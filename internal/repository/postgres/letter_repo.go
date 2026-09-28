package postgres

import (
	"context"
	"errors"
	"fmt"

	"ladani/enterprise-automation/internal/domain"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type LetterRepository struct {
	db *gorm.DB
}

func NewLetterRepository(db *gorm.DB) *LetterRepository {
	return &LetterRepository{db: db}
}

func (r *LetterRepository) WithTx(tx *gorm.DB) domain.LetterRepository {
	return &LetterRepository{db: tx}
}

func (r *LetterRepository) Create(ctx context.Context, letter *domain.Letter) error {
	if err := r.db.WithContext(ctx).Create(letter).Error; err != nil {
		return fmt.Errorf("failed to create letter: %w", err)
	}
	return nil
}

func (r *LetterRepository) GetByID(ctx context.Context, id uuid.UUID) (*domain.Letter, error) {
	var letter domain.Letter
	err := r.db.WithContext(ctx).
		Preload("CreatedBy").
		Preload("Department").
		Preload("CRMAccount").
		Preload("CRMDeal").
		Preload("Attachments").
		Preload("Revisions").
		Preload("Signatures.Signer").
		Preload("Referrals.FromUser").
		Preload("Referrals.ToUser").
		Preload("Folders").
		First(&letter, "id = ?", id).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("failed to fetch letter: %w", err)
	}
	return &letter, nil
}

func (r *LetterRepository) GetByIndicatorNumber(ctx context.Context, indicator string) (*domain.Letter, error) {
	var letter domain.Letter
	err := r.db.WithContext(ctx).
		Preload("CreatedBy").
		Preload("Department").
		Preload("CRMAccount").
		Preload("CRMDeal").
		Preload("Attachments").
		First(&letter, "indicator_number = ?", indicator).Error

	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, domain.ErrNotFound
		}
		return nil, fmt.Errorf("failed to fetch letter by indicator: %w", err)
	}
	return &letter, nil
}

func (r *LetterRepository) Update(ctx context.Context, letter *domain.Letter) error {
	res := r.db.WithContext(ctx).Save(letter)
	if res.Error != nil {
		return fmt.Errorf("failed to update letter: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}

func (r *LetterRepository) List(ctx context.Context, filter domain.LetterFilter) ([]domain.Letter, int64, error) {
	var letters []domain.Letter
	var total int64

	query := r.db.WithContext(ctx).Model(&domain.Letter{})

	if filter.Type != nil {
		query = query.Where("type = ?", *filter.Type)
	}
	if filter.Priority != nil {
		query = query.Where("priority = ?", *filter.Priority)
	}
	if filter.Confidentiality != nil {
		query = query.Where("confidentiality = ?", *filter.Confidentiality)
	}
	if filter.Status != nil {
		query = query.Where("status = ?", *filter.Status)
	}
	if filter.DepartmentID != nil {
		query = query.Where("department_id = ?", *filter.DepartmentID)
	}
	if filter.CreatedByID != nil {
		query = query.Where("created_by_id = ?", *filter.CreatedByID)
	}
	if filter.CRMAccountID != nil {
		query = query.Where("crm_account_id = ?", *filter.CRMAccountID)
	}
	if filter.CRMDealID != nil {
		query = query.Where("crm_deal_id = ?", *filter.CRMDealID)
	}
	if filter.SearchQuery != "" {
		searchPattern := "%" + filter.SearchQuery + "%"
		query = query.Where(
			"subject ILIKE ? OR indicator_number ILIKE ? OR external_sender ILIKE ? OR external_receiver ILIKE ?",
			searchPattern, searchPattern, searchPattern, searchPattern,
		)
	}
	if filter.FromDate != nil {
		query = query.Where("created_at >= ?", *filter.FromDate)
	}
	if filter.ToDate != nil {
		query = query.Where("created_at <= ?", *filter.ToDate)
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, fmt.Errorf("failed to count letters: %w", err)
	}

	limit := filter.Limit
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}

	err := query.
		Preload("CreatedBy").
		Preload("Department").
		Preload("CRMAccount").
		Preload("CRMDeal").
		Order("created_at DESC").
		Limit(limit).
		Offset(filter.Offset).
		Find(&letters).Error

	if err != nil {
		return nil, 0, fmt.Errorf("failed to list letters: %w", err)
	}

	return letters, total, nil
}

func (r *LetterRepository) AddRevision(ctx context.Context, revision *domain.LetterRevision) error {
	return r.db.WithContext(ctx).Create(revision).Error
}

func (r *LetterRepository) AddSignature(ctx context.Context, sig *domain.LetterSignature) error {
	return r.db.WithContext(ctx).Create(sig).Error
}

func (r *LetterRepository) AddAttachment(ctx context.Context, att *domain.LetterAttachment) error {
	return r.db.WithContext(ctx).Create(att).Error
}
