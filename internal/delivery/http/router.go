package http

import (
	"ladani/enterprise-automation/internal/delivery/http/handler"
	"ladani/enterprise-automation/internal/delivery/http/middleware"
	"ladani/enterprise-automation/internal/domain"

	"github.com/gin-gonic/gin"
)

type RouterConfig struct {
	AuthHandler     *handler.AuthHandler
	LetterHandler   *handler.LetterHandler
	WorkflowHandler *handler.WorkflowHandler
	CRMHandler      *handler.CRMHandler
	SystemHandler   *handler.SystemHandler
}

// SetupRoutes registers all HTTP endpoints, middleware, and route groups.
func SetupRoutes(r *gin.Engine, cfg RouterConfig) {
	r.Use(middleware.CORSMiddleware())
	r.Use(gin.Recovery())
	r.Use(gin.Logger())

	// Static Web UI Pages
	r.GET("/login", func(c *gin.Context) {
		c.File("./web/login.html")
	})
	r.GET("/dashboard", func(c *gin.Context) {
		c.File("./web/dashboard.html")
	})
	r.GET("/", func(c *gin.Context) {
		c.Redirect(302, "/login")
	})

	// Health check
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "UP", "system": "Enterprise Secretariat & CRM Engine"})
	})

	// Public Auth API
	if cfg.AuthHandler != nil {
		r.POST("/api/v1/auth/login", cfg.AuthHandler.Login)
	}

	apiV1 := r.Group("/api/v1")
	apiV1.Use(middleware.AuthMiddleware())
	{
		// Database & System Inspector
		if cfg.SystemHandler != nil {
			apiV1.GET("/system/db-status", cfg.SystemHandler.GetDatabaseStatus)
		}
		// 1. Letters & Secretariat (دبیرخانه و نامه‌نگاری)
		letters := apiV1.Group("/letters")
		{
			letters.POST("", cfg.LetterHandler.CreateLetter)
			letters.GET("", cfg.LetterHandler.List)
			letters.GET("/:id", cfg.LetterHandler.GetByID)
			letters.GET("/indicator/:indicator", cfg.LetterHandler.GetByIndicator)
			letters.POST("/:id/sign", middleware.RequireRoles(domain.RoleSecretariatAdmin, domain.RoleUnitManager), cfg.LetterHandler.SignLetter)
			letters.POST("/:id/attachments", cfg.LetterHandler.UploadAttachment)
			letters.GET("/:id/referrals", cfg.WorkflowHandler.GetReferralChain)
		}

		// 2. Cartable & Referrals (کارتابل و ارجاعات)
		cartable := apiV1.Group("/cartable")
		{
			cartable.GET("", cfg.WorkflowHandler.GetUserCartable)
			cartable.PATCH("/:id/read", cfg.WorkflowHandler.MarkAsRead)
			cartable.POST("/forward", cfg.WorkflowHandler.ForwardReferral)
			cartable.POST("/:id/complete", cfg.WorkflowHandler.CompleteReferral)
		}

		// 3. CRM Bridge (پل ارتباطی دبیرخانه و CRM)
		crm := apiV1.Group("/crm")
		{
			crm.GET("/accounts/:id/letters", cfg.CRMHandler.GetAccountLetters)
			crm.GET("/deals/:id/letters", cfg.CRMHandler.GetDealLetters)
		}
	}
}
