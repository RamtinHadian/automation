package auth

import (
	"errors"
	"time"

	"ladani/enterprise-automation/internal/domain"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

var ErrInvalidToken = errors.New("invalid or expired token")

// Claims represents the JWT payload used to authenticate requests.
type Claims struct {
	UserID       uuid.UUID   `json:"user_id"`
	Role         domain.Role `json:"role"`
	DepartmentID uuid.UUID   `json:"department_id"`
	jwt.RegisteredClaims
}

// GenerateToken creates a signed HS256 JWT for the given identity.
func GenerateToken(secret string, userID uuid.UUID, role domain.Role, departmentID uuid.UUID, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := Claims{
		UserID:       userID,
		Role:         role,
		DepartmentID: departmentID,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
			Subject:   userID.String(),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// ParseToken verifies the signature and expiry of a JWT and returns its claims.
func ParseToken(secret, tokenString string) (*Claims, error) {
	claims := &Claims{}

	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return []byte(secret), nil
	})
	if err != nil || !token.Valid {
		return nil, ErrInvalidToken
	}

	return claims, nil
}
