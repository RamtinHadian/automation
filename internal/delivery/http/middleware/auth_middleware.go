package middleware

import (
	"errors"
	"net/http"
	"strings"

	"ladani/enterprise-automation/internal/domain"
	authpkg "ladani/enterprise-automation/internal/pkg/auth"
	"ladani/enterprise-automation/internal/pkg/response"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const (
	CtxUserIDKey       = "current_user_id"
	CtxUserRoleKey     = "current_user_role"
	CtxDepartmentIDKey = "current_department_id"
)

// AuthMiddleware validates a signed JWT bearer token and populates the request context.
func AuthMiddleware(jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			response.Error(c, domain.ErrUnauthorized)
			c.Abort()
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
			response.Error(c, domain.ErrUnauthorized)
			c.Abort()
			return
		}

		claims, err := authpkg.ParseToken(jwtSecret, strings.TrimSpace(parts[1]))
		if err != nil {
			response.Error(c, domain.ErrUnauthorized)
			c.Abort()
			return
		}

		c.Set(CtxUserIDKey, claims.UserID)
		c.Set(CtxUserRoleKey, claims.Role)
		c.Set(CtxDepartmentIDKey, claims.DepartmentID)
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

		userRole, ok := userRoleVal.(domain.Role)
		if !ok {
			response.Error(c, domain.ErrUnauthorized)
			c.Abort()
			return
		}

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

	uid, ok := uidVal.(uuid.UUID)
	if !ok {
		return uuid.Nil, "", uuid.Nil, errors.New("invalid user id in context")
	}

	roleVal, exists := c.Get(CtxUserRoleKey)
	if !exists {
		return uuid.Nil, "", uuid.Nil, errors.New("role not in context")
	}
	role, ok := roleVal.(domain.Role)
	if !ok {
		return uuid.Nil, "", uuid.Nil, errors.New("invalid role in context")
	}

	deptVal, exists := c.Get(CtxDepartmentIDKey)
	if !exists {
		return uuid.Nil, "", uuid.Nil, errors.New("department not in context")
	}
	deptID, ok := deptVal.(uuid.UUID)
	if !ok {
		return uuid.Nil, "", uuid.Nil, errors.New("invalid department id in context")
	}

	return uid, role, deptID, nil
}

// CORSMiddleware reflects an allow-listed origin so credentialed requests remain
// spec-compliant (a wildcard origin cannot be combined with allow-credentials).
func CORSMiddleware(allowedOrigins []string) gin.HandlerFunc {
	allowed := make(map[string]struct{}, len(allowedOrigins))
	for _, o := range allowedOrigins {
		allowed[o] = struct{}{}
	}

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if _, ok := allowed[origin]; ok {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
			c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
			c.Writer.Header().Set("Vary", "Origin")
		}
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, PATCH, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}
