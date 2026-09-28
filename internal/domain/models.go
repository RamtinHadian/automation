package domain

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// BaseEntity contains common fields across models with UUID primary keys.
type BaseEntity struct {
	ID        uuid.UUID      `gorm:"type:uuid;primaryKey" json:"id"`
	CreatedAt time.Time      `gorm:"not null;index" json:"created_at"`
	UpdatedAt time.Time      `gorm:"not null" json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
}

// BeforeCreate hook ensures UUID is assigned if not already set.
func (b *BaseEntity) BeforeCreate(tx *gorm.DB) error {
	if b.ID == uuid.Nil {
		b.ID = uuid.New()
	}
	return nil
}

// ==========================================
// Module A: Organization, RBAC & Users
// ==========================================

type Role string

const (
	RoleSecretariatAdmin Role = "SECRETARIAT_ADMIN"
	RoleUnitManager      Role = "UNIT_MANAGER"
	RoleStaff            Role = "STAFF"
	RoleCRMSalesAgent    Role = "CRM_SALES_AGENT"
	RoleSuperAdmin       Role = "SUPER_ADMIN"
)

type Department struct {
	BaseEntity
	Name        string        `gorm:"type:varchar(150);not null" json:"name"`
	Code        string        `gorm:"type:varchar(50);uniqueIndex;not null" json:"code"`
	Description string        `gorm:"type:text" json:"description"`
	ParentID    *uuid.UUID    `gorm:"type:uuid;index" json:"parent_id"`
	Parent      *Department   `gorm:"foreignKey:ParentID;constraint:OnDelete:SET NULL" json:"parent,omitempty"`
	Children    []Department  `gorm:"foreignKey:ParentID" json:"children,omitempty"`
	Users       []User        `gorm:"foreignKey:DepartmentID" json:"users,omitempty"`
}

type User struct {
	BaseEntity
	Username               string      `gorm:"type:varchar(100);uniqueIndex;not null" json:"username"`
	Email                  string      `gorm:"type:varchar(150);uniqueIndex;not null" json:"email"`
	PasswordHash           string      `gorm:"type:varchar(255);not null" json:"-"`
	FullName               string      `gorm:"type:varchar(150);not null" json:"full_name"`
	JobTitle               string      `gorm:"type:varchar(100)" json:"job_title"`
	Role                   Role        `gorm:"type:varchar(50);not null;default:'STAFF'" json:"role"`
	DepartmentID           uuid.UUID   `gorm:"type:uuid;not null;index" json:"department_id"`
	Department             *Department `gorm:"foreignKey:DepartmentID;constraint:OnDelete:RESTRICT" json:"department,omitempty"`
	DigitalPublicKey       string      `gorm:"type:text" json:"digital_public_key,omitempty"`
	SignatureImageURL      string      `gorm:"type:varchar(255)" json:"signature_image_url,omitempty"`
	IsActive               bool        `gorm:"default:true;not null" json:"is_active"`
}

// ==========================================
// Module B: Secretariat & Automation (دبیرخانه و نامه‌نگاری)
// ==========================================

type LetterType string

const (
	LetterTypeIncoming LetterType = "INCOMING"
	LetterTypeOutgoing LetterType = "OUTGOING"
	LetterTypeInternal LetterType = "INTERNAL"
)

type LetterPriority string

const (
	PriorityNormal    LetterPriority = "NORMAL"
	PriorityImmediate LetterPriority = "IMMEDIATE"
	PriorityInstant   LetterPriority = "INSTANT"
)

type LetterConfidentiality string

const (
	ConfidentialityNormal       LetterConfidentiality = "NORMAL"
	ConfidentialityConfidential LetterConfidentiality = "CONFIDENTIAL"
	ConfidentialitySecret       LetterConfidentiality = "SECRET"
)

type LetterStatus string

const (
	LetterStatusDraft      LetterStatus = "DRAFT"
	LetterStatusInReview   LetterStatus = "IN_REVIEW"
	LetterStatusApproved   LetterStatus = "APPROVED"
	LetterStatusRegistered LetterStatus = "REGISTERED"
	LetterStatusArchived   LetterStatus = "ARCHIVED"
)

type ReferralActionType string

const (
	ActionForAction    ReferralActionType = "FOR_ACTION"    // جهت اقدام
	ActionForSignature ReferralActionType = "FOR_SIGNATURE" // جهت امضا
	ActionCC           ReferralActionType = "CC"            // رونوشت
	ActionForInfo      ReferralActionType = "FOR_INFO"      // جهت استحضار/اطلاع
)

type ReferralStatus string

const (
	ReferralStatusPending   ReferralStatus = "PENDING"
	ReferralStatusRead      ReferralStatus = "READ"
	ReferralStatusCompleted ReferralStatus = "COMPLETED"
	ReferralStatusRejected  ReferralStatus = "REJECTED"
)

// IndicatorSequence tracks atomic counter per year-month partition.
type IndicatorSequence struct {
	YearMonth    string    `gorm:"type:varchar(6);primaryKey" json:"year_month"` // Format: YYYYMM
	LastNumber   int64     `gorm:"not null;default:0" json:"last_number"`
	UpdatedAt    time.Time `gorm:"not null" json:"updated_at"`
}

// Letter represents official correspondence.
type Letter struct {
	BaseEntity
	IndicatorNumber string                `gorm:"type:varchar(50);uniqueIndex;not null" json:"indicator_number"`
	Subject         string                `gorm:"type:varchar(255);not null;index" json:"subject"`
	Body            string                `gorm:"type:text;not null" json:"body"`
	Type            LetterType            `gorm:"type:varchar(20);not null;index" json:"type"`
	Priority        LetterPriority        `gorm:"type:varchar(20);not null;default:'NORMAL'" json:"priority"`
	Confidentiality LetterConfidentiality `gorm:"type:varchar(20);not null;default:'NORMAL'" json:"confidentiality"`
	Status          LetterStatus          `gorm:"type:varchar(20);not null;default:'DRAFT';index" json:"status"`
	
	// External metadata (for Incoming/Outgoing)
	ExternalSender    string     `gorm:"type:varchar(200)" json:"external_sender,omitempty"`
	ExternalReceiver  string     `gorm:"type:varchar(200)" json:"external_receiver,omitempty"`
	ExternalLetterNo  string     `gorm:"type:varchar(100);index" json:"external_letter_no,omitempty"`
	ExternalDatedAt   *time.Time `json:"external_dated_at,omitempty"`
	
	// Originator & Department
	CreatedByID  uuid.UUID   `gorm:"type:uuid;not null;index" json:"created_by_id"`
	CreatedBy    *User       `gorm:"foreignKey:CreatedByID" json:"created_by,omitempty"`
	DepartmentID uuid.UUID   `gorm:"type:uuid;not null;index" json:"department_id"`
	Department   *Department `gorm:"foreignKey:DepartmentID" json:"department,omitempty"`

	// CRM Cross-Module Bridge
	CRMAccountID *uuid.UUID  `gorm:"type:uuid;index" json:"crm_account_id,omitempty"`
	CRMAccount   *CRMAccount `gorm:"foreignKey:CRMAccountID;constraint:OnDelete:SET NULL" json:"crm_account,omitempty"`
	CRMDealID    *uuid.UUID  `gorm:"type:uuid;index" json:"crm_deal_id,omitempty"`
	CRMDeal      *CRMDeal    `gorm:"foreignKey:CRMDealID;constraint:OnDelete:SET NULL" json:"crm_deal,omitempty"`

	// Relations
	Referrals   []LetterReferral   `gorm:"foreignKey:LetterID;constraint:OnDelete:CASCADE" json:"referrals,omitempty"`
	Attachments []LetterAttachment `gorm:"foreignKey:LetterID;constraint:OnDelete:CASCADE" json:"attachments,omitempty"`
	Revisions   []LetterRevision   `gorm:"foreignKey:LetterID;constraint:OnDelete:CASCADE" json:"revisions,omitempty"`
	Signatures  []LetterSignature  `gorm:"foreignKey:LetterID;constraint:OnDelete:CASCADE" json:"signatures,omitempty"`
	Folders     []ArchiveFolder    `gorm:"many2many:letter_folder_items;" json:"folders,omitempty"`
}

// LetterReferral represents cartable workflow forwarding and paraph chain.
type LetterReferral struct {
	BaseEntity
	LetterID        uuid.UUID          `gorm:"type:uuid;not null;index" json:"letter_id"`
	Letter          *Letter            `gorm:"foreignKey:LetterID" json:"letter,omitempty"`
	FromUserID      uuid.UUID          `gorm:"type:uuid;not null;index" json:"from_user_id"`
	FromUser        *User              `gorm:"foreignKey:FromUserID" json:"from_user,omitempty"`
	ToUserID        uuid.UUID          `gorm:"type:uuid;not null;index" json:"to_user_id"`
	ToUser          *User              `gorm:"foreignKey:ToUserID" json:"to_user,omitempty"`
	ActionType      ReferralActionType `gorm:"type:varchar(30);not null;default:'FOR_ACTION'" json:"action_type"`
	Status          ReferralStatus     `gorm:"type:varchar(20);not null;default:'PENDING';index" json:"status"`
	ParaphText      string             `gorm:"type:text;not null" json:"paraph_text"`
	ResponseNote    string             `gorm:"type:text" json:"response_note,omitempty"`
	DeadlineAt      *time.Time         `json:"deadline_at,omitempty"`
	CompletedAt     *time.Time         `json:"completed_at,omitempty"`
	ParentReferralID *uuid.UUID        `gorm:"type:uuid;index" json:"parent_referral_id,omitempty"`
}

// LetterAttachment tracks files associated with a letter.
type LetterAttachment struct {
	BaseEntity
	LetterID     uuid.UUID `gorm:"type:uuid;not null;index" json:"letter_id"`
	FileName     string    `gorm:"type:varchar(255);not null" json:"file_name"`
	StoragePath  string    `gorm:"type:varchar(500);not null" json:"storage_path"`
	MimeType     string    `gorm:"type:varchar(100);not null" json:"mime_type"`
	FileSize     int64     `gorm:"not null" json:"file_size"`
	ChecksumSHA256 string  `gorm:"type:varchar(64)" json:"checksum_sha256"`
}

// LetterRevision tracks draft modifications history.
type LetterRevision struct {
	BaseEntity
	LetterID  uuid.UUID `gorm:"type:uuid;not null;index" json:"letter_id"`
	Version   int       `gorm:"not null" json:"version"`
	Subject   string    `gorm:"type:varchar(255);not null" json:"subject"`
	Body      string    `gorm:"type:text;not null" json:"body"`
	EditedByID uuid.UUID `gorm:"type:uuid;not null;index" json:"edited_by_id"`
	EditedBy  *User     `gorm:"foreignKey:EditedByID" json:"edited_by,omitempty"`
	ChangeLog string    `gorm:"type:text" json:"change_log"`
}

// LetterSignature logs cryptographic approvals and e-signatures.
type LetterSignature struct {
	BaseEntity
	LetterID        uuid.UUID `gorm:"type:uuid;not null;index" json:"letter_id"`
	SignerID        uuid.UUID `gorm:"type:uuid;not null;index" json:"signer_id"`
	Signer          *User     `gorm:"foreignKey:SignerID" json:"signer,omitempty"`
	SignatureHash   string    `gorm:"type:text;not null" json:"signature_hash"`
	SignedPayload   string    `gorm:"type:text;not null" json:"signed_payload"`
	SignedAt        time.Time `gorm:"not null" json:"signed_at"`
	CertificateInfo string    `gorm:"type:text" json:"certificate_info,omitempty"`
}

// ArchiveFolder models the secretariat folder hierarchy (زونکن‌بندی).
type ArchiveFolder struct {
	BaseEntity
	Name            string         `gorm:"type:varchar(150);not null" json:"name"`
	Code            string         `gorm:"type:varchar(50);uniqueIndex;not null" json:"code"`
	DepartmentID    uuid.UUID      `gorm:"type:uuid;not null;index" json:"department_id"`
	Department      *Department    `gorm:"foreignKey:DepartmentID" json:"department,omitempty"`
	ParentFolderID  *uuid.UUID     `gorm:"type:uuid;index" json:"parent_folder_id,omitempty"`
	ParentFolder    *ArchiveFolder `gorm:"foreignKey:ParentFolderID;constraint:OnDelete:SET NULL" json:"parent_folder,omitempty"`
	RetentionYears  int            `gorm:"default:5;not null" json:"retention_years"`
	Letters         []Letter       `gorm:"many2many:letter_folder_items;" json:"letters,omitempty"`
}

// ==========================================
// Module C: Enterprise CRM
// ==========================================

type DealStage string

const (
	DealStageLead          DealStage = "LEAD"
	DealStageQualification DealStage = "QUALIFICATION"
	DealStageProposal      DealStage = "PROPOSAL"
	DealStageNegotiation   DealStage = "NEGOTIATION"
	DealStageWon           DealStage = "WON"
	DealStageLost          DealStage = "LOST"
)

// CRMAccount models B2B corporate customer accounts.
type CRMAccount struct {
	BaseEntity
	CompanyName        string       `gorm:"type:varchar(200);not null;index" json:"company_name"`
	NationalID         string       `gorm:"type:varchar(50);uniqueIndex" json:"national_id"`     // شناسه ملی شرکت
	RegistrationNumber string       `gorm:"type:varchar(50);index" json:"registration_number"`  // شماره ثبت
	EconomicCode       string       `gorm:"type:varchar(50)" json:"economic_code"`             // کد اقتصادی
	Industry           string       `gorm:"type:varchar(100)" json:"industry"`
	Phone              string       `gorm:"type:varchar(50)" json:"phone"`
	Email              string       `gorm:"type:varchar(100)" json:"email"`
	Website            string       `gorm:"type:varchar(150)" json:"website"`
	Address            string       `gorm:"type:text" json:"address"`
	AssignedAgentID    *uuid.UUID   `gorm:"type:uuid;index" json:"assigned_agent_id"`
	AssignedAgent      *User        `gorm:"foreignKey:AssignedAgentID" json:"assigned_agent,omitempty"`
	Contacts           []CRMContact `gorm:"foreignKey:AccountID;constraint:OnDelete:CASCADE" json:"contacts,omitempty"`
	Deals              []CRMDeal    `gorm:"foreignKey:AccountID;constraint:OnDelete:CASCADE" json:"deals,omitempty"`
	Letters            []Letter     `gorm:"foreignKey:CRMAccountID" json:"letters,omitempty"`
}

// CRMContact models individual contact persons for an account.
type CRMContact struct {
	BaseEntity
	AccountID  uuid.UUID   `gorm:"type:uuid;not null;index" json:"account_id"`
	FirstName  string      `gorm:"type:varchar(100);not null" json:"first_name"`
	LastName   string      `gorm:"type:varchar(100);not null" json:"last_name"`
	JobTitle   string      `gorm:"type:varchar(100)" json:"job_title"`
	Email      string      `gorm:"type:varchar(100)" json:"email"`
	Phone      string      `gorm:"type:varchar(50)" json:"phone"`
	IsPrimary  bool        `gorm:"default:false;not null" json:"is_primary"`
}

// CRMDeal models sales pipeline deals linked to accounts and official correspondence.
type CRMDeal struct {
	BaseEntity
	AccountID       uuid.UUID   `gorm:"type:uuid;not null;index" json:"account_id"`
	Account         *CRMAccount `gorm:"foreignKey:AccountID" json:"account,omitempty"`
	Title           string      `gorm:"type:varchar(200);not null" json:"title"`
	Stage           DealStage   `gorm:"type:varchar(30);not null;default:'LEAD';index" json:"stage"`
	ValueAmount     float64     `gorm:"type:numeric(18,2);default:0" json:"value_amount"`
	Currency        string      `gorm:"type:varchar(10);default:'IRR'" json:"currency"`
	ProbabilityRate int         `gorm:"default:10" json:"probability_rate"` // 0 - 100%
	ExpectedCloseAt *time.Time  `json:"expected_close_at,omitempty"`
	AssignedAgentID *uuid.UUID  `gorm:"type:uuid;index" json:"assigned_agent_id"`
	AssignedAgent   *User       `gorm:"foreignKey:AssignedAgentID" json:"assigned_agent,omitempty"`
	Letters         []Letter    `gorm:"foreignKey:CRMDealID" json:"letters,omitempty"`
}
