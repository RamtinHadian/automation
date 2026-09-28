package handler

import (
	"net/http"

	"ladani/enterprise-automation/internal/delivery/http/dto"
	"ladani/enterprise-automation/internal/delivery/http/middleware"
	"ladani/enterprise-automation/internal/domain"
	"ladani/enterprise-automation/internal/pkg/response"
	"ladani/enterprise-automation/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type WorkflowHandler struct {
	workflowService *service.WorkflowService
}

func NewWorkflowHandler(workflowService *service.WorkflowService) *WorkflowHandler {
	return &WorkflowHandler{
		workflowService: workflowService,
	}
}

// GetUserCartable retrieves the current user's inbox with optional status filter.
// GET /api/v1/cartable
func (h *WorkflowHandler) GetUserCartable(c *gin.Context) {
	var q dto.CartableFilterQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		response.ValidationError(c, err.Error())
		return
	}

	userID, _, _, err := middleware.GetCurrentUserContext(c)
	if err != nil {
		response.Error(c, domain.ErrUnauthorized)
		return
	}

	items, total, err := h.workflowService.GetUserCartable(c.Request.Context(), userID, q.Status, q.Limit, q.Offset)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.PaginatedJSON(c, items, total, q.Limit, q.Offset)
}

// MarkAsRead marks an unread referral as seen.
// PATCH /api/v1/cartable/:id/read
func (h *WorkflowHandler) MarkAsRead(c *gin.Context) {
	idStr := c.Param("id")
	refID, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(c, domain.ErrInvalidInput)
		return
	}

	userID, _, _, err := middleware.GetCurrentUserContext(c)
	if err != nil {
		response.Error(c, domain.ErrUnauthorized)
		return
	}

	if err := h.workflowService.MarkReferralAsRead(c.Request.Context(), refID, userID); err != nil {
		response.Error(c, err)
		return
	}

	response.JSON(c, http.StatusOK, "Referral marked as read", nil)
}

// ForwardReferral forwards a cartable task to another colleague with a paraph text.
// POST /api/v1/cartable/forward
func (h *WorkflowHandler) ForwardReferral(c *gin.Context) {
	var req dto.ForwardReferralRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, err.Error())
		return
	}

	userID, _, _, err := middleware.GetCurrentUserContext(c)
	if err != nil {
		response.Error(c, domain.ErrUnauthorized)
		return
	}

	params := service.ForwardReferralParams{
		ParentReferralID: req.ParentReferralID,
		FromUserID:       userID,
		ToUserID:         req.ToUserID,
		ActionType:       req.ActionType,
		ParaphText:       req.ParaphText,
		ResponseNote:     req.ResponseNote,
		DeadlineAt:       req.DeadlineAt,
	}

	newRef, err := h.workflowService.ForwardReferral(c.Request.Context(), params)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.JSON(c, http.StatusCreated, "Referral forwarded successfully", newRef)
}

// CompleteReferral finalizes action on a referral task.
// POST /api/v1/cartable/:id/complete
func (h *WorkflowHandler) CompleteReferral(c *gin.Context) {
	idStr := c.Param("id")
	refID, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(c, domain.ErrInvalidInput)
		return
	}

	var req dto.CompleteReferralRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, err.Error())
		return
	}

	userID, _, _, err := middleware.GetCurrentUserContext(c)
	if err != nil {
		response.Error(c, domain.ErrUnauthorized)
		return
	}

	params := service.CompleteReferralParams{
		ReferralID:   refID,
		UserID:       userID,
		ResponseNote: req.ResponseNote,
	}

	if err := h.workflowService.CompleteReferral(c.Request.Context(), params); err != nil {
		response.Error(c, err)
		return
	}

	response.JSON(c, http.StatusOK, "Referral task completed successfully", nil)
}

// GetReferralChain gets the full paraph and forwarding chain for a letter.
// GET /api/v1/letters/:id/referrals
func (h *WorkflowHandler) GetReferralChain(c *gin.Context) {
	idStr := c.Param("id")
	letterID, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(c, domain.ErrInvalidInput)
		return
	}

	chain, err := h.workflowService.GetReferralChain(c.Request.Context(), letterID)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.JSON(c, http.StatusOK, "Referral chain retrieved successfully", chain)
}
