package postgres

import (
	"context"
	"fmt"
	"sync"
	"time"

	"ladani/enterprise-automation/internal/domain"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type IndicatorRepository struct {
	mu sync.Mutex
}

func NewIndicatorRepository() *IndicatorRepository {
	return &IndicatorRepository{}
}

// GetNextIndicatorNumber provides atomic, gap-free, concurrency-safe counter per YearMonth partition.
// Uses PostgreSQL row-level pessimistic locking (FOR UPDATE) within the current transaction.
func (r *IndicatorRepository) GetNextIndicatorNumber(ctx context.Context, tx *gorm.DB, yearMonth string) (int64, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	var seq domain.IndicatorSequence

	// Try to find the record with a row-level exclusive write lock (SELECT ... FOR UPDATE)
	err := tx.WithContext(ctx).
		Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("year_month = ?", yearMonth).
		First(&seq).Error

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			// First entry for this year-month partition, create with initial count 1
			seq = domain.IndicatorSequence{
				YearMonth:  yearMonth,
				LastNumber: 1,
				UpdatedAt:  time.Now().UTC(),
			}
			if err := tx.WithContext(ctx).Create(&seq).Error; err != nil {
				return 0, fmt.Errorf("failed to initialize indicator sequence: %w", err)
			}
			return seq.LastNumber, nil
		}
		return 0, fmt.Errorf("failed to query indicator sequence: %w", err)
	}

	// Increment monotonically
	seq.LastNumber++
	seq.UpdatedAt = time.Now().UTC()

	if err := tx.WithContext(ctx).Save(&seq).Error; err != nil {
		return 0, fmt.Errorf("failed to increment indicator sequence: %w", err)
	}

	return seq.LastNumber, nil
}
