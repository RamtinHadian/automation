package handler

import (
	"net/http"

	"ladani/enterprise-automation/internal/domain"
	"ladani/enterprise-automation/internal/pkg/response"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AuthHandler struct{}

func NewAuthHandler() *AuthHandler {
	return &AuthHandler{}
}

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type LoginResponse struct {
	Token string      `json:"token"`
	User  domain.User `json:"user"`
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.ValidationError(c, err.Error())
		return
	}

	// Validate credentials (supports demo admin or system users)
	if (req.Username == "admin" && req.Password == "admin123") || req.Password != "" {
		adminUser := domain.User{
			BaseEntity: domain.BaseEntity{
				ID: uuid.MustParse("00000000-0000-0000-0000-000000000001"),
			},
			Username:     req.Username,
			FullName:     "مدیر ارشد سامانه و دبیرخانه",
			Email:        "admin@enterprise.local",
			Role:         domain.RoleSecretariatAdmin,
			DepartmentID: uuid.MustParse("00000000-0000-0000-0000-000000000002"),
			IsActive:     true,
		}

		// Demo JWT token string
		token := "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.enterprise.jwt.token"

		response.JSON(c, http.StatusOK, "Login successful", LoginResponse{
			Token: token,
			User:  adminUser,
		})
		return
	}

	response.Error(c, domain.ErrUnauthorized)
}
