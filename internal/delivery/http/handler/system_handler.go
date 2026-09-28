package handler

import (
	"net/http"

	"ladani/enterprise-automation/internal/domain"
	"ladani/enterprise-automation/internal/pkg/response"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type SystemHandler struct {
	db *gorm.DB
}

func NewSystemHandler(db *gorm.DB) *SystemHandler {
	return &SystemHandler{db: db}
}

type TableSummary struct {
	TableName string `json:"table_name"`
	RowCount  int64  `json:"row_count"`
	Dialect   string `json:"dialect"`
}

func (h *SystemHandler) GetDatabaseStatus(c *gin.Context) {
	dialect := h.db.Dialector.Name()

	var deptCount, userCount, letterCount, referralCount, crmAccountCount, crmDealCount, folderCount int64

	h.db.Model(&domain.Department{}).Count(&deptCount)
	h.db.Model(&domain.User{}).Count(&userCount)
	h.db.Model(&domain.Letter{}).Count(&letterCount)
	h.db.Model(&domain.LetterReferral{}).Count(&referralCount)
	h.db.Model(&domain.CRMAccount{}).Count(&crmAccountCount)
	h.db.Model(&domain.CRMDeal{}).Count(&crmDealCount)
	h.db.Model(&domain.ArchiveFolder{}).Count(&folderCount)

	tables := []TableSummary{
		{TableName: "departments (دپارتمان‌ها و چارت سازمانی)", RowCount: deptCount, Dialect: dialect},
		{TableName: "users (کاربران و پرسنل اداری)", RowCount: userCount, Dialect: dialect},
		{TableName: "letters (نامه‌ها و دفتر اندیکاتور)", RowCount: letterCount, Dialect: dialect},
		{TableName: "letter_referrals (کارتابل و ارجاعات اداری)", RowCount: referralCount, Dialect: dialect},
		{TableName: "crm_accounts (مشتریان حقوقی B2B)", RowCount: crmAccountCount, Dialect: dialect},
		{TableName: "crm_deals (فرصت‌های فروش و معاملات)", RowCount: crmDealCount, Dialect: dialect},
		{TableName: "archive_folders (زونکن‌های بایگانی دبیرخانه)", RowCount: folderCount, Dialect: dialect},
	}

	response.JSON(c, http.StatusOK, "Database status retrieved successfully", gin.H{
		"dialect":   dialect,
		"status":    "ACTIVE_CONNECTED",
		"tables":    tables,
		"db_file":   "enterprise_dev.db / postgres",
		"auto_sync": true,
	})
}

// GetOrganizationUsers returns list of users with their departments for routing.
func (h *SystemHandler) GetOrganizationUsers(c *gin.Context) {
	var users []domain.User
	if err := h.db.Preload("Department").Find(&users).Error; err != nil {
		response.Error(c, err)
		return
	}
	response.JSON(c, http.StatusOK, "Organization users retrieved", users)
}

// GetDepartments returns the full department hierarchy.
func (h *SystemHandler) GetDepartments(c *gin.Context) {
	var depts []domain.Department
	if err := h.db.Preload("Users").Find(&depts).Error; err != nil {
		response.Error(c, err)
		return
	}
	response.JSON(c, http.StatusOK, "Departments hierarchy retrieved", depts)
}
