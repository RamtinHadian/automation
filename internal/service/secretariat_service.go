package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"ladani/enterprise-automation/internal/domain"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type CreateLetterParams struct {
	Subject          string
	Body             string
	Type             domain.LetterType
	Priority         domain.LetterPriority
	Confidentiality  domain.LetterConfidentiality
	ExternalSender   string
	ExternalReceiver string
	ExternalLetterNo string
	ExternalDatedAt  *time.Time
	CreatedByID      uuid.UUID
	DepartmentID     uuid.UUID
	CRMAccountID     *uuid.UUID
	CRMDealID        *uuid.UUID
	InitialReferral  *InitialReferralParams
	Attachments      []AttachmentParams
}

type InitialReferralParams struct {
	ToUserID   uuid.UUID
	ActionType domain.ReferralActionType
	ParaphText string
	DeadlineAt *time.Time
}

type AttachmentParams struct {
	FileName    string
	StoragePath string
	MimeType    string
	FileSize    int64
	FileContent []byte // For checksum calculation
}

type DigitalSignParams struct {
	LetterID        uuid.UUID
	SignerID        uuid.UUID
	SignatureHash   string
	SignedPayload   string
	CertificateInfo string
}

type SecretariatService struct {
	txManager     domain.TransactionManager
	letterRepo    domain.LetterRepository
	workflowRepo  domain.WorkflowRepository
	indicatorRepo domain.IndicatorRepository
}

func NewSecretariatService(
	txManager domain.TransactionManager,
	letterRepo domain.LetterRepository,
	workflowRepo domain.WorkflowRepository,
	indicatorRepo domain.IndicatorRepository,
) *SecretariatService {
	return &SecretariatService{
		txManager:     txManager,
		letterRepo:    letterRepo,
		workflowRepo:  workflowRepo,
		indicatorRepo: indicatorRepo,
	}
}

// GenerateIndicatorNumber generates a sequential, unique number: SEC-YYYYMM-XXXXX atomically.
func (s *SecretariatService) GenerateIndicatorNumber(ctx context.Context, tx *gorm.DB) (string, error) {
	now := time.Now().UTC()
	yearMonth := now.Format("200601") // YYYYMM

	nextSeq, err := s.indicatorRepo.GetNextIndicatorNumber(ctx, tx, yearMonth)
	if err != nil {
		return "", fmt.Errorf("%w: %v", domain.ErrIndicatorGenFailed, err)
	}

	return fmt.Sprintf("SEC-%s-%05d", yearMonth, nextSeq), nil
}

// CreateLetter creates an official letter atomically wrapped in a database transaction with indicator generation and initial referral.
func (s *SecretariatService) CreateLetter(ctx context.Context, params CreateLetterParams) (*domain.Letter, error) {
	var createdLetter *domain.Letter

	err := s.txManager.ExecuteTx(ctx, func(tx *gorm.DB) error {
		// 1. Generate concurrency-safe Indicator Number within transaction
		indicatorNum, err := s.GenerateIndicatorNumber(ctx, tx)
		if err != nil {
			return err
		}

		letter := &domain.Letter{
			IndicatorNumber:  indicatorNum,
			Subject:          params.Subject,
			Body:             params.Body,
			Type:             params.Type,
			Priority:         params.Priority,
			Confidentiality:  params.Confidentiality,
			Status:           domain.LetterStatusRegistered,
			ExternalSender:   params.ExternalSender,
			ExternalReceiver: params.ExternalReceiver,
			ExternalLetterNo: params.ExternalLetterNo,
			ExternalDatedAt:  params.ExternalDatedAt,
			CreatedByID:      params.CreatedByID,
			DepartmentID:     params.DepartmentID,
			CRMAccountID:     params.CRMAccountID,
			CRMDealID:        params.CRMDealID,
		}

		// Save letter entity
		txLetterRepo := s.letterRepo.WithTx(tx)
		if err := txLetterRepo.Create(ctx, letter); err != nil {
			return err
		}

		// Initial Revision (v1)
		revision := &domain.LetterRevision{
			LetterID:   letter.ID,
			Version:    1,
			Subject:    letter.Subject,
			Body:       letter.Body,
			EditedByID: params.CreatedByID,
			ChangeLog:  "Initial Letter Creation and Registration",
		}
		if err := txLetterRepo.AddRevision(ctx, revision); err != nil {
			return err
		}

		// Attachments
		for _, att := range params.Attachments {
			checksum := ""
			if len(att.FileContent) > 0 {
				hash := sha256.Sum256(att.FileContent)
				checksum = hex.EncodeToString(hash[:])
			}

			attachment := &domain.LetterAttachment{
				LetterID:       letter.ID,
				FileName:       att.FileName,
				StoragePath:    att.StoragePath,
				MimeType:       att.MimeType,
				FileSize:       att.FileSize,
				ChecksumSHA256: checksum,
			}
			if err := txLetterRepo.AddAttachment(ctx, attachment); err != nil {
				return err
			}
		}

		// 2. Dispatch Initial Referral Workflow if requested
		if params.InitialReferral != nil {
			txWorkflowRepo := s.workflowRepo.WithTx(tx)
			referral := &domain.LetterReferral{
				LetterID:   letter.ID,
				FromUserID: params.CreatedByID,
				ToUserID:   params.InitialReferral.ToUserID,
				ActionType: params.InitialReferral.ActionType,
				Status:     domain.ReferralStatusPending,
				ParaphText: params.InitialReferral.ParaphText,
				DeadlineAt: params.InitialReferral.DeadlineAt,
			}
			if err := txWorkflowRepo.CreateReferral(ctx, referral); err != nil {
				return err
			}
		}

		createdLetter = letter
		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to create letter transaction: %w", err)
	}

	// Fetch fully preloaded entity
	return s.letterRepo.GetByID(ctx, createdLetter.ID)
}

// AddAttachment stores an already-uploaded file's metadata against an existing letter.
func (s *SecretariatService) AddAttachment(ctx context.Context, letterID uuid.UUID, params AttachmentParams) (*domain.LetterAttachment, error) {
	if _, err := s.letterRepo.GetByID(ctx, letterID); err != nil {
		return nil, err
	}

	checksum := ""
	if len(params.FileContent) > 0 {
		hash := sha256.Sum256(params.FileContent)
		checksum = hex.EncodeToString(hash[:])
	}

	attachment := &domain.LetterAttachment{
		LetterID:       letterID,
		FileName:       params.FileName,
		StoragePath:    params.StoragePath,
		MimeType:       params.MimeType,
		FileSize:       params.FileSize,
		ChecksumSHA256: checksum,
	}
	if err := s.letterRepo.AddAttachment(ctx, attachment); err != nil {
		return nil, fmt.Errorf("failed to save attachment: %w", err)
	}

	return attachment, nil
}

// GetLetter retrieves a letter by UUID.
func (s *SecretariatService) GetLetter(ctx context.Context, id uuid.UUID) (*domain.Letter, error) {
	return s.letterRepo.GetByID(ctx, id)
}

// GetLetterByIndicator retrieves a letter by its indicator code.
func (s *SecretariatService) GetLetterByIndicator(ctx context.Context, indicator string) (*domain.Letter, error) {
	return s.letterRepo.GetByIndicatorNumber(ctx, indicator)
}

// ListLetters provides filtered search with pagination.
func (s *SecretariatService) ListLetters(ctx context.Context, filter domain.LetterFilter) ([]domain.Letter, int64, error) {
	return s.letterRepo.List(ctx, filter)
}

// SignLetter digitally stamps an approved letter. The signer must hold a pending
// FOR_SIGNATURE referral addressed to them for this letter; otherwise signing is refused.
func (s *SecretariatService) SignLetter(ctx context.Context, params DigitalSignParams) (*domain.LetterSignature, error) {
	letter, err := s.letterRepo.GetByID(ctx, params.LetterID)
	if err != nil {
		return nil, err
	}

	chain, err := s.workflowRepo.GetLetterReferralChain(ctx, params.LetterID)
	if err != nil {
		return nil, err
	}

	authorized := false
	for _, r := range chain {
		if r.ToUserID == params.SignerID && r.ActionType == domain.ActionForSignature && r.Status == domain.ReferralStatusPending {
			authorized = true
			break
		}
	}
	if !authorized {
		return nil, domain.ErrForbidden
	}

	sig := &domain.LetterSignature{
		LetterID:        letter.ID,
		SignerID:        params.SignerID,
		SignatureHash:   params.SignatureHash,
		SignedPayload:   params.SignedPayload,
		SignedAt:        time.Now().UTC(),
		CertificateInfo: params.CertificateInfo,
	}

	err = s.txManager.ExecuteTx(ctx, func(tx *gorm.DB) error {
		txLetterRepo := s.letterRepo.WithTx(tx)
		if err := txLetterRepo.AddSignature(ctx, sig); err != nil {
			return err
		}

		letter.Status = domain.LetterStatusApproved
		return txLetterRepo.Update(ctx, letter)
	})

	if err != nil {
		return nil, fmt.Errorf("failed to sign letter: %w", err)
	}

	return sig, nil
}
