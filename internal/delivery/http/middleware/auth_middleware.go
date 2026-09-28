package middleware

import (
	"errors"
	"net/http"
	"strings"

	"ladani/enterprise-automation/internal/domain"
	"ladani/enterprise-automation/internal/pkg/response"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const (
	CtxUserIDKey       = "current_user_id"
	CtxUserRoleKey     = "current_user_role"
	CtxDepartmentIDKey = "current_department_id"
)

// AuthMiddleware simulates/validates JWT tokens or dev headers for enterprise integration.
func AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		devUserID := c.GetHeader("X-User-ID")
		devRole := c.GetHeader("X-User-Role")
		devDeptID := c.GetHeader("X-Department-ID")

		// Support explicit mock/dev identity header if Authorization is omitted or in testing
		if devUserID != "" {
			uid, err := uuid.Parse(devUserID)
			if err == nil {
				role := domain.RoleStaff
				if devRole != "" {
					role = domain.Role(devRole)
				}
				var deptID uuid.UUID
				if devDeptID != "" {
					deptID, _ = uuid.Parse(devDeptID)
				}

				c.Set(CtxUserIDKey, uid)
				c.Set(CtxUserRoleKey, role)
				c.Set(CtxDepartmentIDKey, deptID)
				c.Next()
				return
			}
		}

		if authHeader == "" {
			// Provide a default system admin identity for bootstrapping if unconfigured
			defaultAdminID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
			defaultDeptID := uuid.MustParse("00000000-0000-0000-0000-000000000002")
			c.Set(CtxUserIDKey, defaultAdminID)
			c.Set(CtxUserRoleKey, domain.RoleSecretariatAdmin)
			c.Set(CtxDepartmentIDKey, defaultDeptID)
			c.Next()
			return
		}

		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			response.Error(c, domain.ErrUnauthorized)
			c.Abort()
			return
		}

		// Proceed with next
		c.Next()
	}
}

// RequireRoles enforces RBAC matrix on route groups.
func RequireRoles(allowedRoles ...domain.Role) gin.HandlerFunc {
	return func(c *gin.Context) {
		userRoleVal, exists := c.Get(CtxUserRoleKey)
		if !exists {
			response.Error(c, domain.ErrUnauthorized)
			c.Abort()
			return
		}

		userRole := userRoleVal.(domain.Role)
		for _, r := range allowedRoles {
			if userRole == r || userRole == domain.RoleSuperAdmin {
				c.Next()
				return
			}
		}

		response.Error(c, domain.ErrForbidden)
		c.Abort()
	}
}

// GetCurrentUserContext retrieves parsed authenticated user data from context.
func GetCurrentUserContext(c *gin.Context) (uuid.UUID, domain.Role, uuid.UUID, error) {
	uidVal, exists := c.Get(CtxUserIDKey)
	if !exists {
		return uuid.Nil, "", uuid.Nil, errors.New("user not in context")
	}

	roleVal, _ := c.Get(CtxUserRoleKey)
	deptVal, _ := c.Get(CtxDepartmentIDKey)

	uid := uidVal.(uuid.UUID)
	role := roleVal.(domain.Role)
	deptID := deptVal.(uuid.UUID)

	return uid, role, deptID, nil
}

// CORS middleware for enterprise integration with frontend frameworks.
func CORSMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With, X-User-ID, X-User-Role, X-Department-ID")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, PATCH, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}
