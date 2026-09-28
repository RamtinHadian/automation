package handler

import (
	"net/http"

	"ladani/enterprise-automation/internal/domain"
	"ladani/enterprise-automation/internal/pkg/response"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type CRMHandler struct {
	crmRepo domain.CRMRepository
}

func NewCRMHandler(crmRepo domain.CRMRepository) *CRMHandler {
	return &CRMHandler{crmRepo: crmRepo}
}

// GetAccountLetters returns the full correspondence history for a CRM account.
// GET /api/v1/crm/accounts/:id/letters
func (h *CRMHandler) GetAccountLetters(c *gin.Context) {
	idStr := c.Param("id")
	accountID, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(c, domain.ErrInvalidInput)
		return
	}

	letters, err := h.crmRepo.GetAccountLetters(c.Request.Context(), accountID)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.JSON(c, http.StatusOK, "Account correspondence history retrieved", letters)
}

// GetDealLetters returns the correspondence history linked to a specific sales deal.
// GET /api/v1/crm/deals/:id/letters
func (h *CRMHandler) GetDealLetters(c *gin.Context) {
	idStr := c.Param("id")
	dealID, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(c, domain.ErrInvalidInput)
		return
	}

	letters, err := h.crmRepo.GetDealLetters(c.Request.Context(), dealID)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.JSON(c, http.StatusOK, "Deal correspondence history retrieved", letters)
}
