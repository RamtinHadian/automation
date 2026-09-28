package dto

import (
	"time"

	"ladani/enterprise-automation/internal/domain"

	"github.com/google/uuid"
)

type CreateLetterRequest struct {
	Subject          string                       `json:"subject" binding:"required,min=3,max=255"`
	Body             string                       `json:"body" binding:"required,min=5"`
	Type             domain.LetterType            `json:"type" binding:"required,oneof=INCOMING OUTGOING INTERNAL"`
	Priority         domain.LetterPriority        `json:"priority" binding:"required,oneof=NORMAL IMMEDIATE INSTANT"`
	Confidentiality  domain.LetterConfidentiality `json:"confidentiality" binding:"required,oneof=NORMAL CONFIDENTIAL SECRET"`
	ExternalSender   string                       `json:"external_sender" binding:"max=200"`
	ExternalReceiver string                       `json:"external_receiver" binding:"max=200"`
	ExternalLetterNo string                       `json:"external_letter_no" binding:"max=100"`
	ExternalDatedAt  *time.Time                   `json:"external_dated_at"`
	CRMAccountID     *uuid.UUID                   `json:"crm_account_id"`
	CRMDealID        *uuid.UUID                   `json:"crm_deal_id"`
	InitialReferral  *InitialReferralDTO          `json:"initial_referral"`
}

type InitialReferralDTO struct {
	ToUserID   uuid.UUID                 `json:"to_user_id" binding:"required"`
	ActionType domain.ReferralActionType `json:"action_type" binding:"required,oneof=FOR_ACTION FOR_SIGNATURE CC FOR_INFO"`
	ParaphText string                    `json:"paraph_text" binding:"required,min=2"`
	DeadlineAt *time.Time                `json:"deadline_at"`
}

type DigitalSignRequest struct {
	SignatureHash   string `json:"signature_hash" binding:"required"`
	SignedPayload   string `json:"signed_payload" binding:"required"`
	CertificateInfo string `json:"certificate_info"`
}

type LetterListFilterQuery struct {
	Type            *domain.LetterType            `form:"type"`
	Priority        *domain.LetterPriority        `form:"priority"`
	Confidentiality *domain.LetterConfidentiality `form:"confidentiality"`
	Status          *domain.LetterStatus          `form:"status"`
	DepartmentID    *uuid.UUID                    `form:"department_id"`
	CreatedByID     *uuid.UUID                    `form:"created_by_id"`
	CRMAccountID    *uuid.UUID                    `form:"crm_account_id"`
	CRMDealID       *uuid.UUID                    `form:"crm_deal_id"`
	SearchQuery     string                        `form:"q"`
	FromDate        *time.Time                    `form:"from_date"`
	ToDate          *time.Time                    `form:"to_date"`
	Limit           int                           `form:"limit,default=20"`
	Offset          int                           `form:"offset,default=0"`
}
