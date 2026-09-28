package dto

import (
	"time"

	"ladani/enterprise-automation/internal/domain"

	"github.com/google/uuid"
)

type ForwardReferralRequest struct {
	ParentReferralID uuid.UUID                 `json:"parent_referral_id" binding:"required"`
	ToUserID         uuid.UUID                 `json:"to_user_id" binding:"required"`
	ActionType       domain.ReferralActionType `json:"action_type" binding:"required,oneof=FOR_ACTION FOR_SIGNATURE CC FOR_INFO"`
	ParaphText       string                    `json:"paraph_text" binding:"required,min=2"`
	ResponseNote     string                    `json:"response_note"`
	DeadlineAt       *time.Time                `json:"deadline_at"`
}

type CompleteReferralRequest struct {
	ResponseNote string `json:"response_note" binding:"required,min=2"`
}

type CartableFilterQuery struct {
	Status *domain.ReferralStatus `form:"status"`
	Limit  int                    `form:"limit,default=20"`
	Offset int                    `form:"offset,default=0"`
}
