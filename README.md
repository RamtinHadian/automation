# Enterprise CRM & Office Automation Backend (سیستم دبیرخانه، کارتابل و اتوماسیون اداری)

A production-grade, Clean Architecture backend built with **Go 1.22+**, **Gin-Gonic**, and **PostgreSQL (GORM)**.

---

## 🏛 Clean Architecture Directory Structure

```
├── cmd/
│   └── api/
│       └── main.go                 # App bootstrap, DI, DB migrations & graceful shutdown
├── internal/
│   ├── config/
│   │   └── config.go              # Environment loader & configuration management
│   ├── domain/
│   │   ├── models.go              # GORM database entities, UUIDs, indexes, & enums
│   │   ├── errors.go              # Typed domain errors
│   │   └── interfaces.go          # Repository & TransactionManager contracts
│   ├── repository/
│   │   └── postgres/
│   │       ├── db.go              # DB pool & AutoMigrate
│   │       ├── letter_repo.go     # Correspondence persistence & queries
│   │       ├── workflow_repo.go   # Cartable & referral forwarding chain
│   │       ├── indicator_repo.go  # Concurrency-safe atomic indicator sequence
│   │       └── crm_repo.go        # CRM queries & cross-module bridge
│   ├── service/
│   │   ├── secretariat_service.go # Atomic indicator generation & transaction-wrapped letter creation
│   │   └── workflow_service.go    # Paraph submissions, forwarding & cartable workflow
│   ├── delivery/
│   │   └── http/
│   │       ├── dto/               # Gin binding request & query DTOs
│   │       ├── handler/           # REST controllers (Letter, Workflow, CRM)
│   │       ├── middleware/        # JWT/Dev Auth, RBAC enforcement, & CORS
│   │       └── router.go          # Route groups & endpoint wiring
│   └── pkg/
│       └── response/
│           └── response.go        # Standardized API envelopes & error handler
└── go.mod
```

---

## ⚙️ Core Architectural Highlights

### 1. Atomic & Monotonic Indicator Number Generator (شماره اندیکاتور)
- **Format**: `SEC-YYYYMM-XXXXX` (e.g. `SEC-202608-00001`)
- **Concurrency Safety**: Implemented via PostgreSQL row-level exclusive locks (`SELECT ... FOR UPDATE` & in-memory mutex) within transaction scope to prevent race conditions or gap leaks in high-throughput environments.

### 2. Cartable & Referral State Engine (کارتابل و ارجاعات)
- Tracks complete forwarding chains with `FromUserID`, `ToUserID`, `ActionType` (`FOR_ACTION`, `FOR_SIGNATURE`, `CC`, `FOR_INFO`), `ParaphText`, `ResponseNote`, and `Status` (`PENDING`, `READ`, `COMPLETED`, `REJECTED`).
- Atomic state transitions ensure that once a task is forwarded, the parent step is completed and linked via `ParentReferralID`.

### 3. CRM-Secretariat Bridge (اتصال دبیرخانه به CRM)
- Letters can be directly linked to B2B customer accounts (`CRMAccountID`) and sales deals (`CRMDealID`).
- Complete correspondence history is accessible from the CRM profile endpoints.

---

## 🚀 API Endpoint Reference

### Letters & Secretariat (`/api/v1/letters`)
- `POST /api/v1/letters` - Create and register an official letter with indicator number, attachments, and initial referral.
- `GET /api/v1/letters` - Filter letters by type, priority, confidentiality, date, department, or search query.
- `GET /api/v1/letters/:id` - Fetch letter by UUID.
- `GET /api/v1/letters/indicator/:indicator` - Fetch letter by Indicator Number.
- `POST /api/v1/letters/:id/sign` - Digitally sign an approved letter (Requires `SECRETARIAT_ADMIN` or `UNIT_MANAGER`).
- `POST /api/v1/letters/:id/attachments` - Upload multipart attachments with SHA-256 checksums.
- `GET /api/v1/letters/:id/referrals` - Fetch complete referral and paraph history.

### Cartable & Inbox (`/api/v1/cartable`)
- `GET /api/v1/cartable` - Get authenticated user's inbox tasks (supports `?status=PENDING`).
- `PATCH /api/v1/cartable/:id/read` - Mark referral task as seen.
- `POST /api/v1/cartable/forward` - Forward task to colleague with a paraph text.
- `POST /api/v1/cartable/:id/complete` - Complete task with a closing note.

### CRM Bridge (`/api/v1/crm`)
- `GET /api/v1/crm/accounts/:id/letters` - Get correspondence history for a customer account.
- `GET /api/v1/crm/deals/:id/letters` - Get correspondence history for a sales pipeline deal.
