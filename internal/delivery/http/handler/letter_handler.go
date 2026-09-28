package handler

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"ladani/enterprise-automation/internal/delivery/http/dto"
	"ladani/enterprise-automation/internal/delivery/http/middleware"
	"ladani/enterprise-automation/internal/domain"
	"ladani/enterprise-automation/internal/pkg/response"
	"ladani/enterprise-automation/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type LetterHandler struct {
	secretariatService *service.SecretariatService
	uploadDir          string
}

func NewLetterHandler(secretariatService *service.SecretariatService, uploadDir string) *LetterHandler {
	return &LetterHandler{
		secretariatService: secretariatService,
		uploadDir:          uploadDir,
	}
}

// CreateLetter creates an official letter with indicator number, attachments, and optional initial routing.
// POST /api/v1/letters
func (h *LetterHandler) CreateLetter(c *gin.Context) {
	var req dto.CreateLetterRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, err.Error())
		return
	}

	userID, _, deptID, err := middleware.GetCurrentUserContext(c)
	if err != nil {
		response.Error(c, domain.ErrUnauthorized)
		return
	}

	params := service.CreateLetterParams{
		Subject:          req.Subject,
		Body:             req.Body,
		Type:             req.Type,
		Priority:         req.Priority,
		Confidentiality:  req.Confidentiality,
		ExternalSender:   req.ExternalSender,
		ExternalReceiver: req.ExternalReceiver,
		ExternalLetterNo: req.ExternalLetterNo,
		ExternalDatedAt:  req.ExternalDatedAt,
		CreatedByID:      userID,
		DepartmentID:     deptID,
		CRMAccountID:     req.CRMAccountID,
		CRMDealID:        req.CRMDealID,
	}

	if req.InitialReferral != nil {
		params.InitialReferral = &service.InitialReferralParams{
			ToUserID:   req.InitialReferral.ToUserID,
			ActionType: req.InitialReferral.ActionType,
			ParaphText: req.InitialReferral.ParaphText,
			DeadlineAt: req.InitialReferral.DeadlineAt,
		}
	}

	letter, err := h.secretariatService.CreateLetter(c.Request.Context(), params)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.JSON(c, http.StatusCreated, "Letter created and registered successfully", letter)
}

// GetByID retrieves letter details by UUID.
// GET /api/v1/letters/:id
func (h *LetterHandler) GetByID(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(c, domain.ErrInvalidInput)
		return
	}

	letter, err := h.secretariatService.GetLetter(c.Request.Context(), id)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.JSON(c, http.StatusOK, "Letter retrieved successfully", letter)
}

// GetByIndicator retrieves letter details by Secretariat Indicator number.
// GET /api/v1/letters/indicator/:indicator
func (h *LetterHandler) GetByIndicator(c *gin.Context) {
	indicator := strings.TrimSpace(c.Param("indicator"))
	if indicator == "" {
		response.Error(c, domain.ErrInvalidInput)
		return
	}

	letter, err := h.secretariatService.GetLetterByIndicator(c.Request.Context(), indicator)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.JSON(c, http.StatusOK, "Letter retrieved successfully", letter)
}

// List retrieves paginated letters based on filters.
// GET /api/v1/letters
func (h *LetterHandler) List(c *gin.Context) {
	var q dto.LetterListFilterQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		response.ValidationError(c, err.Error())
		return
	}

	filter := domain.LetterFilter{
		Type:            q.Type,
		Priority:        q.Priority,
		Confidentiality: q.Confidentiality,
		Status:          q.Status,
		DepartmentID:    q.DepartmentID,
		CreatedByID:     q.CreatedByID,
		CRMAccountID:    q.CRMAccountID,
		CRMDealID:       q.CRMDealID,
		SearchQuery:     q.SearchQuery,
		FromDate:        q.FromDate,
		ToDate:          q.ToDate,
		Limit:           q.Limit,
		Offset:          q.Offset,
	}

	letters, total, err := h.secretariatService.ListLetters(c.Request.Context(), filter)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.PaginatedJSON(c, letters, total, q.Limit, q.Offset)
}

// SignLetter digitally stamps an approved letter.
// POST /api/v1/letters/:id/sign
func (h *LetterHandler) SignLetter(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(c, domain.ErrInvalidInput)
		return
	}

	var req dto.DigitalSignRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, err.Error())
		return
	}

	userID, _, _, err := middleware.GetCurrentUserContext(c)
	if err != nil {
		response.Error(c, domain.ErrUnauthorized)
		return
	}

	params := service.DigitalSignParams{
		LetterID:        id,
		SignerID:        userID,
		SignatureHash:   req.SignatureHash,
		SignedPayload:   req.SignedPayload,
		CertificateInfo: req.CertificateInfo,
	}

	sig, err := h.secretariatService.SignLetter(c.Request.Context(), params)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.JSON(c, http.StatusOK, "Letter digitally signed successfully", sig)
}

// UploadAttachment handles multi-part file upload attachment for a letter.
// POST /api/v1/letters/:id/attachments
func (h *LetterHandler) UploadAttachment(c *gin.Context) {
	idStr := c.Param("id")
	letterID, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(c, domain.ErrInvalidInput)
		return
	}

	fileHeader, err := c.FormFile("file")
	if err != nil {
		response.Error(c, domain.ErrInvalidInput)
		return
	}

	// Validate file size limit (e.g. 25MB)
	if fileHeader.Size > 25*1024*1024 {
		response.Error(c, domain.ErrInvalidInput)
		return
	}

	_ = os.MkdirAll(h.uploadDir, 0755)
	destFileName := fmt.Sprintf("%s_%s", uuid.New().String(), filepath.Base(fileHeader.Filename))
	destPath := filepath.Join(h.uploadDir, destFileName)

	if err := c.SaveUploadedFile(fileHeader, destPath); err != nil {
		response.Error(c, err)
		return
	}

	fileContent, _ := os.ReadFile(destPath)

	attParams := service.AttachmentParams{
		FileName:    fileHeader.Filename,
		StoragePath: destPath,
		MimeType:    fileHeader.Header.Get("Content-Type"),
		FileSize:    fileHeader.Size,
		FileContent: fileContent,
	}

	// Read letter to ensure existence
	letter, err := h.secretariatService.GetLetter(c.Request.Context(), letterID)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.JSON(c, http.StatusCreated, "Attachment uploaded successfully", gin.H{
		"letter_id":   letter.ID,
		"file_name":   attParams.FileName,
		"file_size":   attParams.FileSize,
		"mime_type":   attParams.MimeType,
		"upload_path": destPath,
	})
}
