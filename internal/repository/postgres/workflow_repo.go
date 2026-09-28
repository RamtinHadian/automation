package postgres

import (
	"context"
	"errors"
	"fmt"

	"ladani/enterprise-automation/internal/domain"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type WorkflowRepository struct {
	db *gorm.DB
}

func NewWorkflowRepository(db *gorm.DB) *WorkflowRepository {
	return &WorkflowRepository{db: db}
}

func (r *WorkflowRepository) WithTx(tx *gorm.DB) domain.WorkflowRepository {
	return &WorkflowRepository{db: tx}
}

func (r *WorkflowRepository) CreateReferral(ctx context.Context, referral *domain.LetterReferral) error {
	if err := r.db.WithContext(ctx).Create(referral).Error; err != nil {
		return fmt.Errorf("failed to create referral: %w", err)
	}
	return nil
}

func (r *WorkflowRepository) GetReferralByID(ctx context.Context, id uuid.UUID) (*domain.LetterReferral, error) {
	var referral domain.LetterReferral
	err := r.db.WithContext(ctx).
		Preload("Letter").
		Preload("FromUser").
		Preload("ToUser").
		First(&referral, "id = ?", id).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("failed to get referral: %w", err)
	}
	return &referral, nil
}

func (r *WorkflowRepository) UpdateReferral(ctx context.Context, referral *domain.LetterReferral) error {
	res := r.db.WithContext(ctx).Save(referral)
	if res.Error != nil {
		return fmt.Errorf("failed to update referral: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *WorkflowRepository) GetUserCartable(ctx context.Context, userID uuid.UUID, status *domain.ReferralStatus, limit, offset int) ([]domain.LetterReferral, int64, error) {
	var referrals []domain.LetterReferral
	var total int64

	query := r.db.WithContext(ctx).Model(&domain.LetterReferral{}).Where("to_user_id = ?", userID)

	if status != nil {
		query = query.Where("status = ?", *status)
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to count cartable items: %w", err)
	}

	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	err := query.
		Preload("Letter.CreatedBy").
		Preload("Letter.Department").
		Preload("Letter.CRMAccount").
		Preload("Letter.CRMDeal").
		Preload("FromUser").
		Preload("ToUser").
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&referrals).Error

	if err != nil {
		return nil, 0, fmt.Errorf("failed to fetch cartable: %w", err)
	}

	return referrals, total, nil
}

func (r *WorkflowRepository) GetLetterReferralChain(ctx context.Context, letterID uuid.UUID) ([]domain.LetterReferral, error) {
	var referrals []domain.LetterReferral
	err := r.db.WithContext(ctx).
		Preload("FromUser").
		Preload("ToUser").
		Where("letter_id = ?", letterID).
		Order("created_at ASC").
		Find(&referrals).Error

	if err != nil {
		return nil, fmt.Errorf("failed to fetch referral chain: %w", err)
	}
	return referrals, nil
}
