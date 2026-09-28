package postgres

import (
	"log"
	"time"

	"ladani/enterprise-automation/internal/domain"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// SeedInitialData creates standard initial enterprise structure, users, CRM accounts, and sample letters.
func SeedInitialData(db *gorm.DB) error {
	var count int64
	if err := db.Model(&domain.Department{}).Count(&count).Error; err != nil {
		return err
	}

	if count > 0 {
		log.Println("Database already seeded. Skipping initial data creation.")
		return nil
	}

	log.Println("🌱 Seeding database keys, relationships, departments, users, and CRM bridge entities...")

	// Fixed UUIDs for predictable reference across tests and dev environment
	deptExecID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	deptSecID := uuid.MustParse("00000000-0000-0000-0000-000000000002")
	deptITID := uuid.MustParse("00000000-0000-0000-0000-000000000003")
	deptCRMID := uuid.MustParse("00000000-0000-0000-0000-000000000004")

	userAdminID := uuid.MustParse("00000000-0000-0000-0000-000000000001")
	userITMgrID := uuid.MustParse("00000000-0000-0000-0000-000000000002")
	userSalesID := uuid.MustParse("00000000-0000-0000-0000-000000000003")

	crmAccountID := uuid.MustParse("00000000-0000-0000-0000-000000000101")
	crmDealID := uuid.MustParse("00000000-0000-0000-0000-000000000201")

	return db.Transaction(func(tx *gorm.DB) error {
		// 1. Departments Hierarchy
		deptExec := domain.Department{
			BaseEntity:  domain.BaseEntity{ID: deptExecID},
			Name:        "مدیریت عامل و هیئت مدیره",
			Code:        "EXEC-01",
			Description: "دبیرخانه مرکزی و مدیریت ارشد سازمان",
		}
		if err := tx.Create(&deptExec).Error; err != nil {
			return err
		}

		deptSec := domain.Department{
			BaseEntity:  domain.BaseEntity{ID: deptSecID},
			Name:        "اداره کل دبیرخانه و بایگانی مرکزی",
			Code:        "SEC-01",
			Description: "ثبت و صدور اندیکاتور و زونکن‌بندی",
			ParentID:    &deptExecID,
		}
		if err := tx.Create(&deptSec).Error; err != nil {
			return err
		}

		deptIT := domain.Department{
			BaseEntity:  domain.BaseEntity{ID: deptITID},
			Name:        "مدیریت فناوری اطلاعات و زیرساخت",
			Code:        "IT-01",
			Description: "توسعه نرم‌افزار و شبکه",
			ParentID:    &deptExecID,
		}
		if err := tx.Create(&deptIT).Error; err != nil {
			return err
		}

		deptCRM := domain.Department{
			BaseEntity:  domain.BaseEntity{ID: deptCRMID},
			Name:        "واحد توسعه بازار و فروش CRM",
			Code:        "CRM-01",
			Description: "ارتباط با مشتریان حقوقی و مناقصات",
			ParentID:    &deptExecID,
		}
		if err := tx.Create(&deptCRM).Error; err != nil {
			return err
		}

		// 2. Users & Roles
		adminUser := domain.User{
			BaseEntity:   domain.BaseEntity{ID: userAdminID},
			Username:     "admin",
			Email:        "admin@enterprise.local",
			PasswordHash: "$2a$10$e7Z...mock", // password: admin123
			FullName:     "علی رضایی (مدیر دبیرخانه)",
			JobTitle:     "مدیر کل دبیرخانه و اتوماسیون",
			Role:         domain.RoleSecretariatAdmin,
			DepartmentID: deptSecID,
			IsActive:     true,
		}
		if err := tx.Create(&adminUser).Error; err != nil {
			return err
		}

		itMgrUser := domain.User{
			BaseEntity:   domain.BaseEntity{ID: userITMgrID},
			Username:     "it_manager",
			Email:        "it@enterprise.local",
			PasswordHash: "$2a$10$e7Z...mock",
			FullName:     "محمد حسینی (مدیر فناوری اطلاعات)",
			JobTitle:     "مدیر فنی زیرساخت",
			Role:         domain.RoleUnitManager,
			DepartmentID: deptITID,
			IsActive:     true,
		}
		if err := tx.Create(&itMgrUser).Error; err != nil {
			return err
		}

		salesAgentUser := domain.User{
			BaseEntity:   domain.BaseEntity{ID: userSalesID},
			Username:     "sales_agent",
			Email:        "sales@enterprise.local",
			PasswordHash: "$2a$10$e7Z...mock",
			FullName:     "سارا احمدی (کارشناس فروش CRM)",
			JobTitle:     "مدیر حساب مشتریان B2B",
			Role:         domain.RoleCRMSalesAgent,
			DepartmentID: deptCRMID,
			IsActive:     true,
		}
		if err := tx.Create(&salesAgentUser).Error; err != nil {
			return err
		}

		// 3. CRM B2B Account & Deal Pipeline
		crmAccount := domain.CRMAccount{
			BaseEntity:         domain.BaseEntity{ID: crmAccountID},
			CompanyName:        "شرکت صنایع پتروشیمی خلیج فارس",
			NationalID:         "10100987654",
			RegistrationNumber: "45890",
			EconomicCode:       "411122334455",
			Industry:           "نفت و گاز و پتروشیمی",
			Phone:              "02188990000",
			Email:              "info@pgpic.ir",
			Website:            "https://pgpic.ir",
			Address:            "تهران، خیابان ولیعصر، بالاتر از میرداماد",
			AssignedAgentID:    &userSalesID,
		}
		if err := tx.Create(&crmAccount).Error; err != nil {
			return err
		}

		crmContact := domain.CRMContact{
			AccountID: crmAccountID,
			FirstName: "احمد",
			LastName:  "کریمی",
			JobTitle:  "مدیر بازرگانی و خرید خارجی",
			Email:     "karimi@pgpic.ir",
			Phone:     "09121112233",
			IsPrimary: true,
		}
		if err := tx.Create(&crmContact).Error; err != nil {
			return err
		}

		crmDeal := domain.CRMDeal{
			BaseEntity:      domain.BaseEntity{ID: crmDealID},
			AccountID:       crmAccountID,
			Title:           "قرارداد استقرار اتوماسیون اداری و CRM پتروشیمی",
			Stage:           domain.DealStageProposal,
			ValueAmount:     2500000000, // 2.5 Billion IRR
			Currency:        "IRR",
			ProbabilityRate: 75,
			AssignedAgentID: &userSalesID,
		}
		if err := tx.Create(&crmDeal).Error; err != nil {
			return err
		}

		// 4. Archive Folder (زونکن‌بندی)
		folder := domain.ArchiveFolder{
			Name:           "زونکن قراردادهای فروش سال ۱۴۰۵",
			Code:           "ZONKEN-2026-SALES",
			DepartmentID:   deptCRMID,
			RetentionYears: 10,
		}
		if err := tx.Create(&folder).Error; err != nil {
			return err
		}

		// 5. Initial Letter (با اندیکاتور)
		letter1 := domain.Letter{
			IndicatorNumber: "SEC-202608-00001",
			Subject:         "ارسال پیش‌نویس قرارداد همکاری و استعلام فنی",
			Body:            "احتراماً پیرو مذاکرات صورت گرفته، پیش‌نویس قرارداد به پیوست جهت بررسی ارائه‌ می‌گردد.",
			Type:            domain.LetterTypeOutgoing,
			Priority:        domain.PriorityImmediate,
			Confidentiality: domain.ConfidentialityNormal,
			Status:          domain.LetterStatusRegistered,
			ExternalReceiver: "شرکت صنایع پتروشیمی خلیج فارس",
			CreatedByID:     userSalesID,
			DepartmentID:    deptCRMID,
			CRMAccountID:    &crmAccountID,
			CRMDealID:       &crmDealID,
		}
		if err := tx.Create(&letter1).Error; err != nil {
			return err
		}

		// Initial Referral in Cartable
		deadline := time.Now().Add(48 * time.Hour)
		referral1 := domain.LetterReferral{
			LetterID:   letter1.ID,
			FromUserID: userSalesID,
			ToUserID:   userAdminID,
			ActionType: domain.ActionForSignature,
			Status:     domain.ReferralStatusPending,
			ParaphText: "جهت امضای دیجیتال و صدور نهایی نامه در دبیرخانه",
			DeadlineAt: &deadline,
		}
		if err := tx.Create(&referral1).Error; err != nil {
			return err
		}

		log.Println("✅ Database migration, FK constraints, and initial seed data completed successfully.")
		return nil
	})
}
