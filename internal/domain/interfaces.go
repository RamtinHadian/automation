package domain

import (
	"context"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// LetterRepository defines persistence operations for letters.
type LetterRepository interface {
	WithTx(tx *gorm.DB) LetterRepository
	Create(ctx context.Context, letter *Letter) error
	GetByID(ctx context.Context, id uuid.UUID) (*Letter, error)
	GetByIndicatorNumber(ctx context.Context, indicator string) (*Letter, error)
	Update(ctx context.Context, letter *Letter) error
	List(ctx context.Context, filter LetterFilter) ([]Letter, int64, error)
	AddRevision(ctx context.Context, revision *LetterRevision) error
	AddSignature(ctx context.Context, sig *LetterSignature) error
	AddAttachment(ctx context.Context, att *LetterAttachment) error
}

// LetterFilter encapsulates search and pagination filters.
type LetterFilter struct {
	Type            *LetterType
	Priority        *LetterPriority
	Confidentiality *LetterConfidentiality
	Status          *LetterStatus
	DepartmentID    *uuid.UUID
	CreatedByID     *uuid.UUID
	CRMAccountID    *uuid.UUID
	CRMDealID       *uuid.UUID
	SearchQuery     string
	FromDate        *time.Time
	ToDate          *time.Time
	Limit           int
	Offset          int
}

// WorkflowRepository defines persistence operations for referrals and cartable tasks.
type WorkflowRepository interface {
	WithTx(tx *gorm.DB) WorkflowRepository
	CreateReferral(ctx context.Context, referral *LetterReferral) error
	GetReferralByID(ctx context.Context, id uuid.UUID) (*LetterReferral, error)
	UpdateReferral(ctx context.Context, referral *LetterReferral) error
	GetUserCartable(ctx context.Context, userID uuid.UUID, status *ReferralStatus, limit, offset int) ([]LetterReferral, int64, error)
	GetLetterReferralChain(ctx context.Context, letterID uuid.UUID) ([]LetterReferral, error)
}

// IndicatorRepository manages atomic sequence generation.
type IndicatorRepository interface {
	GetNextIndicatorNumber(ctx context.Context, db *gorm.DB, yearMonth string) (int64, error)
}

// CRMRepository manages CRM queries and letter links.
type CRMRepository interface {
	GetAccountByID(ctx context.Context, id uuid.UUID) (*CRMAccount, error)
	GetAccountLetters(ctx context.Context, accountID uuid.UUID) ([]Letter, error)
	GetDealLetters(ctx context.Context, dealID uuid.UUID) ([]Letter, error)
}

// TransactionManager abstracts database transaction handling.
type TransactionManager interface {
	ExecuteTx(ctx context.Context, fn func(tx *gorm.DB) error) error
	GetDB() *gorm.DB
}
