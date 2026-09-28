package response

import (
	"errors"
	"net/http"

	"ladani/enterprise-automation/internal/domain"

	"github.com/gin-gonic/gin"
)

type APIResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message,omitempty"`
	Data    interface{} `json:"data,omitempty"`
	Meta    *Pagination `json:"meta,omitempty"`
	Error   *ErrorData  `json:"error,omitempty"`
}

type Pagination struct {
	Total  int64 `json:"total"`
	Limit  int   `json:"limit"`
	Offset int   `json:"offset"`
}

type ErrorData struct {
	Code    string      `json:"code"`
	Details interface{} `json:"details,omitempty"`
}

func JSON(c *gin.Context, httpStatus int, message string, data interface{}) {
	c.JSON(httpStatus, APIResponse{
		Success: httpStatus >= 200 && httpStatus < 300,
		Message: message,
		Data:    data,
	})
}

func PaginatedJSON(c *gin.Context, data interface{}, total int64, limit, offset int) {
	c.JSON(http.StatusOK, APIResponse{
		Success: true,
		Data:    data,
		Meta: &Pagination{
			Total:  total,
			Limit:  limit,
			Offset: offset,
		},
	})
}

func Error(c *gin.Context, err error) {
	status := http.StatusInternalServerError
	code := "INTERNAL_SERVER_ERROR"

	switch {
	case errors.Is(err, domain.ErrNotFound):
		status = http.StatusNotFound
		code = "NOT_FOUND"
	case errors.Is(err, domain.ErrUnauthorized):
		status = http.StatusUnauthorized
		code = "UNAUTHORIZED"
	case errors.Is(err, domain.ErrForbidden):
		status = http.StatusForbidden
		code = "FORBIDDEN"
	case errors.Is(err, domain.ErrInvalidInput):
		status = http.StatusBadRequest
		code = "INVALID_INPUT"
	case errors.Is(err, domain.ErrConflict):
		status = http.StatusConflict
		code = "CONFLICT"
	case errors.Is(err, domain.ErrReferralClosed):
		status = http.StatusUnprocessableEntity
		code = "REFERRAL_ALREADY_CLOSED"
	}

	c.JSON(status, APIResponse{
		Success: false,
		Message: err.Error(),
		Error: &ErrorData{
			Code: code,
		},
	})
}

func ValidationError(c *gin.Context, details interface{}) {
	c.JSON(http.StatusBadRequest, APIResponse{
		Success: false,
		Message: "Validation failed for request payload",
		Error: &ErrorData{
			Code:    "VALIDATION_ERROR",
			Details: details,
		},
	})
}
