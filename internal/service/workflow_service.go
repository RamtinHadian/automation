package service

import (
	"context"
	"fmt"
	"time"

	"ladani/enterprise-automation/internal/domain"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ForwardReferralParams struct {
	ParentReferralID uuid.UUID
	FromUserID       uuid.UUID
	ToUserID         uuid.UUID
	ActionType       domain.ReferralActionType
	ParaphText       string
	ResponseNote     string
	DeadlineAt       *time.Time
}

type CompleteReferralParams struct {
	ReferralID   uuid.UUID
	UserID       uuid.UUID
	ResponseNote string
}

type WorkflowService struct {
	txManager    domain.TransactionManager
	workflowRepo domain.WorkflowRepository
	letterRepo   domain.LetterRepository
}

func NewWorkflowService(
	txManager domain.TransactionManager,
	workflowRepo domain.WorkflowRepository,
	letterRepo domain.LetterRepository,
) *WorkflowService {
	return &WorkflowService{
		txManager:    txManager,
		workflowRepo: workflowRepo,
		letterRepo:   letterRepo,
	}
}

// ForwardReferral forwards an existing cartable item to another user with a paraph while completing or chaining the current referral.
func (s *WorkflowService) ForwardReferral(ctx context.Context, params ForwardReferralParams) (*domain.LetterReferral, error) {
	var newReferral *domain.LetterReferral

	err := s.txManager.ExecuteTx(ctx, func(tx *gorm.DB) error {
		txWorkflowRepo := s.workflowRepo.WithTx(tx)

		// 1. Fetch current referral
		currentRef, err := txWorkflowRepo.GetReferralByID(ctx, params.ParentReferralID)
		if err != nil {
			return err
		}

		if currentRef.ToUserID != params.FromUserID {
			return domain.ErrForbidden
		}

		if currentRef.Status == domain.ReferralStatusCompleted || currentRef.Status == domain.ReferralStatusRejected {
			return domain.ErrReferralClosed
		}

		// 2. Complete previous referral state
		now := time.Now().UTC()
		currentRef.Status = domain.ReferralStatusCompleted
		currentRef.ResponseNote = params.ResponseNote
		currentRef.CompletedAt = &now

		if err := txWorkflowRepo.UpdateReferral(ctx, currentRef); err != nil {
			return err
		}

		// 3. Create downstream referral
		newRef := &domain.LetterReferral{
			LetterID:         currentRef.LetterID,
			FromUserID:       params.FromUserID,
			ToUserID:         params.ToUserID,
			ActionType:       params.ActionType,
			Status:           domain.ReferralStatusPending,
			ParaphText:       params.ParaphText,
			DeadlineAt:       params.DeadlineAt,
			ParentReferralID: &currentRef.ID,
		}

		if err := txWorkflowRepo.CreateReferral(ctx, newRef); err != nil {
			return err
		}

		newReferral = newRef
		return nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to forward referral: %w", err)
	}

	return s.workflowRepo.GetReferralByID(ctx, newReferral.ID)
}

// MarkReferralAsRead marks a cartable task as opened/seen.
func (s *WorkflowService) MarkReferralAsRead(ctx context.Context, referralID uuid.UUID, userID uuid.UUID) error {
	ref, err := s.workflowRepo.GetReferralByID(ctx, referralID)
	if err != nil {
		return err
	}

	if ref.ToUserID != userID {
		return domain.ErrForbidden
	}

	if ref.Status == domain.ReferralStatusPending {
		ref.Status = domain.ReferralStatusRead
		return s.workflowRepo.UpdateReferral(ctx, ref)
	}

	return nil
}

// CompleteReferral finalizes action on a referral task without re-forwarding.
func (s *WorkflowService) CompleteReferral(ctx context.Context, params CompleteReferralParams) error {
	ref, err := s.workflowRepo.GetReferralByID(ctx, params.ReferralID)
	if err != nil {
		return err
	}

	if ref.ToUserID != params.UserID {
		return domain.ErrForbidden
	}

	if ref.Status == domain.ReferralStatusCompleted {
		return domain.ErrReferralClosed
	}

	now := time.Now().UTC()
	ref.Status = domain.ReferralStatusCompleted
	ref.ResponseNote = params.ResponseNote
	ref.CompletedAt = &now

	return s.workflowRepo.UpdateReferral(ctx, ref)
}

// GetUserCartable fetches the current user's inbox with pagination and status filtering.
func (s *WorkflowService) GetUserCartable(ctx context.Context, userID uuid.UUID, status *domain.ReferralStatus, limit, offset int) ([]domain.LetterReferral, int64, error) {
	return s.workflowRepo.GetUserCartable(ctx, userID, status, limit, offset)
}

// GetReferralChain gets all historical paraphs and routes for a given letter.
func (s *WorkflowService) GetReferralChain(ctx context.Context, letterID uuid.UUID) ([]domain.LetterReferral, error) {
	return s.workflowRepo.GetLetterReferralChain(ctx, letterID)
}
