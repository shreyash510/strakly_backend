# Strakly - Gym Management System

A comprehensive, multi-tenant gym management platform designed to streamline operations for gym owners, managers, trainers, and members. Built with NestJS + PostgreSQL (backend) and React + Redux Toolkit (frontend).

---

## Architecture

- **Multi-tenancy**: Dynamic schema creation per gym with full tenant isolation
- **Role-Based Access Control**: 7 roles with granular permissions
- **Feature Gating**: SaaS plan tiers control which features each gym can access
- **Real-time Updates**: WebSocket support for live notifications
- **File Uploads**: AWS S3 integration for images and documents
- **AI Chat**: OpenAI integration for conversational assistant
- **Message Queue**: RabbitMQ for async operations
- **Activity Logging**: Comprehensive audit trails per entity

---

## User Roles

| Role | Description |
|------|-------------|
| **Superadmin** | Platform-level access, manage all gyms, SaaS subscriptions, system settings |
| **Admin** | Full gym access, manage own gym, users, all features, and settings |
| **Branch Admin** | Manage assigned branch, staff, members, and branch operations |
| **Manager** | Manage assigned gym/branch, staff, members, and daily operations |
| **Trainer** | View assigned clients, track progress, manage workouts, classes, appointments |
| **Client/Member** | Access personal dashboard, subscriptions, attendance, goals, and self-service features |
| **User** | Basic registered user (pre-role assignment) |

---

## Feature Modules

### 1. Member Management
- Add, edit, and manage members with detailed profiles
- Search and filter members by name, email, or status
- Bulk create, update, and delete operations
- Assign trainers to members
- Track body metrics (weight, height, BMI, body fat %, muscle mass)
- Body metrics history and progress tracking
- Member notes (general, medical, interaction, follow-up) with pinning
- Member goals with milestones and progress tracking (weight loss, muscle gain, general fitness, sports prep, rehab, flexibility, endurance)
- Progress photos (front/side/back) with visibility settings
- Approve/reject registration requests
- Status management (active, inactive, suspended)

### 2. Gym Management
- Multi-gym support for franchise operations
- Gym profile management and settings
- Toggle gym active/inactive status
- Track gym-wise statistics and performance
- Gym subscription management (SaaS plan tier)

### 3. Branch Management
- Multi-location branch support per gym
- Create, edit, delete branches
- Set default branch
- Transfer members between branches
- Branch limit enforcement based on SaaS plan

### 4. Subscription & Membership Management
- **Plans**: Create and manage membership plans with custom pricing and duration
- **Offers**: Create promotional offers with discount percentages and validity periods
- **Promo Codes**: Validate and apply discount codes during enrollment
- **Enrollment**: Enroll members with automatic pricing calculation
- **Tracking**: View active, expiring, and recent memberships
- **Freeze/Unfreeze**: Temporarily freeze memberships with date tracking
- **Cancellation**: Cancel memberships with reason tracking
- **Renewal**: Self-service and admin renewal workflows
- **Facilities**: Link specific facilities to membership plans
- **Statistics**: Total revenue, active memberships, expiring soon alerts, membership overview

### 5. Payment & Billing
- Record payments against memberships
- Payment history with reference tracking
- Payment statistics and summaries
- Multiple payment methods support

### 6. Attendance System
- Unique 4-digit attendance code for each member
- Check-in and check-out tracking
- View attendance history with timestamps
- Weekly and monthly attendance statistics
- Mark attendance by code or manual selection
- Currently present count
- Attendance reports and trends
- Date-based attendance lookup

### 7. Trainer Management
- Assign trainers to members
- Trainer can view their assigned clients
- Client progress monitoring
- Trainer client summary reports
- Client attendance and progress reports

### 8. Salary Management
- Create and manage staff salary records
- Bonuses and deductions tracking
- Mark salary as paid
- Staff salary statistics
- "My Salary" view for staff members

### 9. Diet & Nutrition Programs
- Create diet plans with detailed meal information
- Categorize diets (weight loss, muscle gain, maintenance, etc.)
- Assign diet plans to members
- Track diet assignments and compliance
- Plan feature gated: `diet_planning`

### 10. Facilities Management
- Create and manage gym facilities/rooms
- Track facility capacity and usage
- Link facilities to membership plans
- Plan feature gated: `amenities_management`

### 11. Amenities Management
- List and manage gym amenities and services
- Track amenity availability
- Plan feature gated: `amenities_management`

### 12. Equipment Tracking
- Equipment inventory with serial numbers and purchase details
- Maintenance scheduling and tracking
- Upcoming maintenance alerts
- Equipment status management (operational, needs_repair, out_of_service)
- Equipment statistics dashboard
- Plan feature gated: `equipment_tracking`

### 13. Group Classes & Scheduling
- **Class Types**: Create class types with categories (yoga, spin, HIIT, CrossFit, strength, pilates, zumba, boxing, cardio, stretching, functional)
- **Schedules**: Recurring class schedules with day-of-week, time, room, instructor
- **Sessions**: Auto-generate sessions from schedules, manage session status (scheduled, cancelled, completed)
- **Bookings**: Members book sessions, capacity management, waitlisting
- **Booking Status**: Booked, waitlisted, attended, no-show, cancelled
- My Bookings view for members
- Plan feature gated: `class_scheduling`

### 14. Appointments & Personal Training
- **Services**: Define appointment services with duration, price, max participants, category
- **Trainer Availability**: Set trainer availability windows per day
- **Available Slots**: Query available booking slots for a service/trainer
- **Appointments**: Book, update, and manage appointments
- **Status Flow**: Booked, confirmed, completed, cancelled, no-show
- **Session Packages**: Bundled session packages with usage tracking (active, expired, exhausted)
- My Appointments view for members
- Plan feature gated: `appointment_booking`

### 15. Guest Visits & Day Passes
- Register guest visits with contact details
- Track day pass amount and payment method (cash, card, bank_transfer, online)
- Convert guest to member
- Guest visit statistics (total visits, conversions, conversion rate, revenue)
- Plan feature gated: `guest_day_pass`

### 16. Products & POS (Point of Sale)
- Product catalog with categories
- Inventory tracking with stock management
- Low stock alerts
- Record individual and batch sales
- Sales statistics and reporting
- Plan feature gated: `pos_retail`

### 17. Leads & CRM
- Lead tracking with pipeline management
- Pipeline stages: New, Contacted, Tour Scheduled, Tour Completed, Proposal Sent, Negotiation, Won, Lost
- Lead scoring: Hot, Warm, Cold
- Activity logging per lead
- Stage history tracking
- Convert leads to members
- Lead source tracking and statistics
- Plan feature gated: `lead_crm`

### 18. Referral Program
- Generate referral codes for members
- Track referral conversions
- Mark referrals as rewarded
- Per-user referral tracking
- Referral statistics
- Plan feature gated: `referral_tracking`

### 19. Campaigns (Email/SMS Marketing)
- **Templates**: Create reusable campaign templates
- **Campaigns**: Create campaigns targeting segmented audiences
- **Audience Preview**: Preview target audience before sending
- **Scheduling**: Schedule campaigns for future delivery
- **Tracking**: Track campaign recipients and delivery status
- Send, schedule, and cancel campaigns
- Plan feature gated: `campaigns`

### 20. Announcements
- Create announcements with types: general, update, event, maintenance, promotion
- Target by role or gym
- Pin important announcements
- Active announcements feed
- Plan feature gated: `announcements`

### 21. Support & Helpdesk
- Members can raise support tickets
- Track ticket status (open, in-progress, resolved)
- Priority-based ticket management
- Threaded message communication history

### 22. Contact Requests
- Public contact form submissions
- Admin review and response workflow
- Mark as read/resolved
- Contact request statistics

### 23. Documents & Digital Waivers
- **Templates**: Create document templates (waiver, contract, PAR-Q, consent, terms)
- **E-Signatures**: Collect digital signatures from members
- **PDF Generation**: Generate signed document PDFs
- Version tracking and compliance records
- My Documents view for members
- Plan feature gated: `digital_waivers`

### 24. Surveys & NPS
- **Survey Types**: NPS, post-class, cancellation, custom
- **Question Types**: NPS scale, rating, text, single choice, multi-choice, yes/no
- Create and publish surveys
- Track responses and completion
- Survey analytics and NPS scoring
- Pending surveys view for members
- Plan feature gated: `surveys_nps`

### 25. Engagement Scoring & Churn Alerts
- Calculate member engagement scores (0-100)
- Risk levels: Low, Medium, High, Critical
- Churn alert types: Risk increase, no visit 7d/14d, payment failed, expiring soon
- Acknowledge and manage alerts
- Engagement dashboard with risk distribution
- Score history tracking per member
- Recalculate scores on demand
- Plan feature gated: `engagement_scoring`

### 26. Gamification
- **Challenges**: Create challenges (attendance streak, weight loss, strength, body metric, visits count, class count, custom)
- **Achievements**: Define achievements and badges
- **Leaderboards**: Challenge leaderboards
- **Streaks**: Track member streaks
- Join challenges, track progress
- My Achievements and Summary views
- Gamification statistics dashboard
- Plan feature gated: `gamification`

### 27. Loyalty & Rewards Program
- **Config**: Configure loyalty program settings (points per action)
- **Tiers**: Define loyalty tiers with point thresholds and benefits
- **Points**: Track member points, adjustments, leaderboard
- **Transactions**: Full transaction history per member
- **Rewards**: Create rewards catalog (discount, product, service, session, merchandise, custom)
- **Redemption**: Members redeem points for rewards
- Loyalty dashboard
- Plan feature gated: `loyalty_rewards`

### 28. Wearable Integrations
- Connect fitness wearables: Apple Health, Google Fit, Fitbit, Garmin, Samsung Health, WHOOP
- OAuth-based provider connections
- Sync health data (steps, heart rate, calories, sleep, etc.)
- Health data summary and chart views
- Admin view of member wearable data
- Plan feature gated: `wearable_integration`

### 29. Custom Fields
- Create custom fields for entities: User, Membership, Lead
- Field types: Text, Number, Date, Dropdown, Checkbox, File, Textarea, Email, Phone
- Reorder fields
- Custom field values per entity
- Plan feature gated: `custom_fields`

### 30. Currency Management
- Multi-currency support
- Create and manage currencies
- Exchange rate configuration
- Currency conversion
- Plan feature gated: `multi_currency`

### 31. Reports & Analytics
- Revenue and income/expense reports
- Membership sales reports
- Payment dues reports
- Trainer client summary and progress reports
- PDF report download
- Financial reports (separate permission)

### 32. Notifications
- In-app notifications
- Unread count tracking
- Mark as read (individual and bulk)
- System notifications for superadmins

### 33. AI Chat
- AI-powered conversational assistant
- Conversation history management
- Message exchange tracking
- Plan feature gated: `ai_chat`

### 34. Data Migration
- Import/export tools
- Plan feature gated: `data_migration`

---

## User-Facing Features (Member App)

### Dashboard
- Quick overview of subscription status
- Upcoming sessions and appointments
- Recent activity
- Trainer information

### My Subscription
- View current membership details and plan features
- Subscription history
- Days remaining
- Self-service renewal
- Freeze/unfreeze membership
- Linked facilities

### My Attendance
- Personal attendance code display
- Check-in/check-out history
- Weekly/monthly visit count
- Total visits tracking

### My Goals
- Set personal fitness goals with milestones
- Track progress (0-100%)
- Goal types: weight loss, muscle gain, general fitness, sports prep, rehab, flexibility, endurance

### My Trainer
- View assigned trainer information
- Trainer contact details

### My Classes & Bookings
- Browse available classes
- Book class sessions
- View my bookings

### My Appointments
- Book personal training appointments
- View appointment history
- Session package usage

### My Achievements
- View earned achievements and badges
- Challenge participation
- Streak tracking

### My Loyalty Points
- View points balance
- Transaction history
- Redeem rewards from catalog
- Tier status

### My Surveys
- View pending surveys
- Submit survey responses

### My Wearables
- Connect fitness wearable providers
- View synced health data
- Health data charts and summaries

### Profile & Settings
- Personal information management
- Body metrics tracking and history
- Progress photos
- Profile photo

---

## Manager/Admin Features

### Admin Dashboard
- Gym overview statistics
- Member count and new clients
- Active subscriptions and revenue tracking
- Recent activities and inquiries

### Staff Management
- Manage trainers, managers, branch admins
- Assign permissions and branches
- Salary management

### Member Operations
- Enroll new members
- Manage subscriptions and payments
- Mark attendance
- Handle support tickets
- Add member notes
- Track member goals and progress

---

## Trainer Features

### My Clients
- View all assigned clients
- Client contact information
- Track client progress and attendance
- Client summary reports

### Class & Appointment Management
- View assigned classes
- Manage availability for appointments
- Track session bookings

---

## Superadmin Features

### Platform Dashboard
- All gyms overview with pagination
- System-wide statistics

### Gym Management
- Create, manage, and toggle gym status
- View all gyms

### SaaS Subscription Management
- Manage SaaS plans and tiers
- Feature gating per plan
- Payment history tracking

### Contact Requests
- Review public contact form submissions

### User Management
- Manage users across all gyms

---

## Technical Highlights

- **Multi-tenant Architecture**: Dynamic PostgreSQL schema per gym
- **Modern UI**: React 18 + TypeScript + Tailwind CSS + shadcn/ui
- **State Management**: Redux Toolkit with async thunks
- **API**: RESTful NestJS with Swagger documentation
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT + Google OAuth + OTP verification
- **Real-time**: Socket.io for live notifications
- **File Storage**: AWS S3 for images, documents, PDFs
- **AI**: OpenAI integration for chat assistant
- **Async Processing**: RabbitMQ message queue
- **PDF Generation**: Puppeteer-based report generation
- **Role-Based Access Control**: 95+ permission codes across 7 roles
- **Feature Gating**: 15+ plan-gated features
- **Activity Logging**: Full audit trail per entity
- **Responsive Design**: Mobile-friendly interface

---

## Currency

Default currency: **INR (Indian Rupees)**
Multi-currency support available with exchange rate management (plan feature gated).

---

*Strakly - Simplifying Gym Management*
