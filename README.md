# Strakly Backend

Multi-tenant gym & fitness studio management SaaS API built with NestJS, Prisma, and PostgreSQL.

## Tech Stack

- **Framework:** NestJS 11 + TypeScript
- **Database:** PostgreSQL with Prisma 7 ORM
- **Auth:** JWT + Google OAuth + Passport
- **Real-time:** WebSocket notifications via Socket.io
- **Email:** ZeptoMail transactional email
- **Storage:** AWS S3 for file uploads
- **Queue:** RabbitMQ (CloudAMQP) for async tasks
- **AI:** OpenAI integration for chat conversations
- **Docs:** Swagger UI at `/docs`

## Getting Started

```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run migrations (dev)
npm run prisma:migrate

# Seed database
npm run prisma:seed

# Start dev server
npm run start:dev

# Build for production
npm run build
```

## Environment Variables

Copy `.env.example` and configure:

```env
# Core
ENVIRONMENT=dev
PORT=3000

# Database (PostgreSQL)
DATABASE_URL_DEV=postgresql://user:pass@host:5432/db?schema=public
DATABASE_URL_PROD=postgresql://user:pass@host:5432/db?schema=public
DIRECT_URL=postgresql://user:pass@host:5432/db   # No pgbouncer, for migrations

# Authentication
JWT_SECRET=your-secret-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Email (ZeptoMail)
ZEPTOMAIL_API_KEY=your-key
ZEPTOMAIL_API_URL=https://api.zeptomail.com
ZEPTOMAIL_FROM_EMAIL=noreply@strakly.com

# Storage (AWS S3)
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
AWS_REGION=your-region
AWS_S3_BUCKET=your-bucket

# Queue (RabbitMQ)
CLOUDAMQP_URL=amqp://user:pass@host/vhost

# AI
OPENAI_API_KEY=your-key

# Frontend
FRONTEND_URL=http://localhost:5173
```

## Project Structure

```
src/
├── main.ts                     # Bootstrap (global prefix /api, CORS, Swagger)
├── app.module.ts               # Root module importing all feature modules
├── auth/                       # Authentication & authorization
│   ├── auth.controller.ts      # Login, signup, refresh, OAuth endpoints
│   ├── auth.service.ts         # Core auth logic (JWT, Google, multi-user-type)
│   ├── guards/                 # JWT, Roles, Plan Features guards
│   ├── strategies/             # Passport JWT strategy
│   ├── decorators/             # @Roles(), @PlanFeatures(), @UserId(), @GymId()
│   └── dto/                    # Request/response DTOs
├── database/                   # Prisma service & seed data
├── tenant/                     # Multi-tenant schema management
├── common/                     # Shared utilities, decorators, validators
│   ├── decorators/             # @GymId(), @UserId(), @BranchId()
│   ├── utils/                  # Password, Pagination, AttendanceCode utils
│   └── constants/              # Feature flags
├── email/                      # Email service + 10 HTML templates
├── notifications/              # WebSocket gateway + scheduler
├── upload/                     # S3 file upload service
├── rabbitmq/                   # Message queue service
├── [45+ feature modules]/      # Business logic modules
└── ...

prisma/
├── schema.prisma               # Database schema (15 public models + tenant tables)
├── seed.ts                     # Seed script (plans, permissions, test users)
└── migrations/                 # Version-based migration files
```

## Multi-Tenant Architecture

Each gym gets an isolated PostgreSQL schema created dynamically by `TenantService`:

- **Public schema:** SystemUser, Gym, Branch, Permission, SaasPlan, SaasSubscription, SupportTicket, etc.
- **Tenant schemas** (`gym_{id}`): Clients, Memberships, Payments, Attendance, Classes, Products, etc.
- Tenant context resolved from JWT token → gym ID → schema name
- Raw SQL used for tenant-specific tables, Prisma for public schema

## Database Models

### Public Schema
| Model | Purpose |
|-------|---------|
| SystemUser | Platform superadmins |
| User | Staff (admin, manager, trainer) |
| UserGymXref | User-gym role assignments |
| Gym | Tenant registry |
| Branch | Multi-location support |
| Permission / RolePermissionXref | RBAC |
| SaasPlan | Subscription tiers |
| SaasGymSubscription | Active subscriptions |
| SaasPaymentHistory | Payment transactions |
| SupportTicket / SupportTicketMessage | Support system |
| Conversation / ConversationMessage | AI chat history |
| ContactRequest | Public contact form |
| EmailVerification | OTP/password reset |
| LookupType / Lookup | Reference data |

### Tenant Schema (created per gym)
Clients, Memberships, Payments, Attendance, Classes, Appointments, Diet, Equipment, Products, Salary, Documents, Custom Fields, Guest Visits, Leads, Referrals, Surveys, Engagement, Gamification, Loyalty, Member Goals, Progress Photos, Wearables, etc.

## API Modules (55 total)

| Category | Modules |
|----------|---------|
| **Core** | Auth, Users, Gym, Branch, Tenant, Database, Permissions, Lookups |
| **Members** | Memberships, Payments, Plans, Offers, Leads, Referrals |
| **Operations** | Attendance, Classes, Appointments, Guest Visits, Diets |
| **Staff** | Users, Salary |
| **Finance** | Reports, Dashboard, SaaS Subscriptions, Products |
| **Communication** | Announcements, Notifications, Support, Contact Requests, Email |
| **Engagement** | Surveys, Gamification, Loyalty, Campaigns, Engagement |
| **Content** | Documents, Custom Fields, Progress Photos, Member Goals, Member Notes |
| **Advanced** | Wearables, Conversations (AI), Activity Logs |
| **Infrastructure** | Upload, RabbitMQ, Migration, Public |

## Authentication & Roles

- **JWT** tokens with refresh token rotation
- **Google OAuth** integration
- **User types:** superadmin (SystemUser), admin, branch_admin, manager, trainer, client
- **Guards:** `JwtAuthGuard`, `RolesGuard`, `PlanFeaturesGuard`
- **Decorators:** `@Roles('admin', 'manager')`, `@PlanFeatures('feature_code')`

## Email Templates

10 transactional email templates: Welcome, Email Verification, Password Reset, Payment Receipt, Membership Expiry, Ticket Resolved, Contact Request, etc.

## Real-time Features

- WebSocket gateway for push notifications
- Scheduled notification delivery via `NotificationsScheduler`
- Socket.io with JWT-authenticated connections

## Test Users (after seeding)

| Email | Password | Role |
|-------|----------|------|
| superadmin@test.com | password123 | superadmin |
| admin@test.com | password123 | admin |
| manager@test.com | password123 | manager |
| trainer@test.com | password123 | trainer |
| member@test.com | password123 | member |

## Build & Deploy

- **Development:** `npm run start:dev` (port 3000)
- **Production:** `npm run build && npm run start:prod` (port 8080)
- **Deploy target:** DigitalOcean App Platform
- **Health check:** `GET /api/health`
- **API docs:** `GET /docs` (Swagger UI)
- **CORS origins:** localhost, strakly.com, app.strakly.com, DigitalOcean
