package domain

import "errors"

var (
	ErrNotFound            = errors.New("resource not found")
	ErrUnauthorized        = errors.New("unauthorized action")
	ErrForbidden           = errors.New("permission denied")
	ErrInvalidInput        = errors.New("invalid input data")
	ErrConflict            = errors.New("resource conflict or duplicate entry")
	ErrInvalidStatusChange = errors.New("invalid status transition")
	ErrReferralClosed      = errors.New("referral task is already completed or closed")
	ErrIndicatorGenFailed  = errors.New("failed to generate unique indicator number")
)
