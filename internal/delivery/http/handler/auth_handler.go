package handler

import (
	"errors"
	"net/http"
	"time"

	"ladani/enterprise-automation/internal/domain"
	authpkg "ladani/enterprise-automation/internal/pkg/auth"
	"ladani/enterprise-automation/internal/pkg/response"
	"ladani/enterprise-automation/internal/repository/postgres"

	"github.com/gin-gonic/gin"
)

type AuthHandler struct {
	userRepo  *postgres.UserRepository
	jwtSecret string
	jwtExpiry time.Duration
}

func NewAuthHandler(userRepo *postgres.UserRepository, jwtSecret string, jwtExpiryHours int) *AuthHandler {
	return &AuthHandler{
		userRepo:  userRepo,
		jwtSecret: jwtSecret,
		jwtExpiry: time.Duration(jwtExpiryHours) * time.Hour,
	}
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

	user, err := h.userRepo.GetByUsername(c.Request.Context(), req.Username)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			response.Error(c, domain.ErrUnauthorized)
			return
		}
		response.Error(c, err)
		return
	}

	if !user.IsActive || !authpkg.ComparePassword(user.PasswordHash, req.Password) {
		response.Error(c, domain.ErrUnauthorized)
		return
	}

	token, err := authpkg.GenerateToken(h.jwtSecret, user.ID, user.Role, user.DepartmentID, h.jwtExpiry)
	if err != nil {
		response.Error(c, err)
		return
	}

	response.JSON(c, http.StatusOK, "Login successful", LoginResponse{
		Token: token,
		User:  *user,
	})
}
