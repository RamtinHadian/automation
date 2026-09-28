package postgres

import (
	"context"
	"errors"
	"fmt"

	"ladani/enterprise-automation/internal/domain"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type CRMRepository struct {
	db *gorm.DB
}

func NewCRMRepository(db *gorm.DB) *CRMRepository {
	return &CRMRepository{db: db}
}

func (r *CRMRepository) GetAccountByID(ctx context.Context, id uuid.UUID) (*domain.CRMAccount, error) {
	var account domain.CRMAccount
	err := r.db.WithContext(ctx).
		Preload("Contacts").
		Preload("Deals").
		Preload("AssignedAgent").
		First(&account, "id = ?", id).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("failed to fetch CRM account: %w", err)
	}
	return &account, nil
}

func (r *CRMRepository) GetAccountLetters(ctx context.Context, accountID uuid.UUID) ([]domain.Letter, error) {
	var letters []domain.Letter
	err := r.db.WithContext(ctx).
		Preload("CreatedBy").
		Preload("Department").
		Preload("Attachments").
		Where("crm_account_id = ?", accountID).
		Order("created_at DESC").
		Find(&letters).Error

	if err != nil {
		return nil, fmt.Errorf("failed to fetch account letters: %w", err)
	}
	return letters, nil
}

func (r *CRMRepository) GetDealLetters(ctx context.Context, dealID uuid.UUID) ([]domain.Letter, error) {
	var letters []domain.Letter
	err := r.db.WithContext(ctx).
		Preload("CreatedBy").
		Preload("Department").
		Preload("Attachments").
		Where("crm_deal_id = ?", dealID).
		Order("created_at DESC").
		Find(&letters).Error

	if err != nil {
		return nil, fmt.Errorf("failed to fetch deal letters: %w", err)
	}
	return letters, nil
}
