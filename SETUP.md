# Strakly Backend - Setup Guide

## Prerequisites

- Node.js >= 18.0.0
- npm
- PostgreSQL database (Supabase recommended)

## Initial Setup

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd goalApp_backend
npm install
```

### 2. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Environment: dev | prod
ENVIRONMENT=dev

# Server Configuration
PORT=3000

# JWT Secret (change in production!)
JWT_SECRET=your-secret-key

# Database URLs
DATABASE_URL_DEV="postgresql://user:password@dev-host:5432/database?pgbouncer=true"
DATABASE_URL_PROD="postgresql://user:password@prod-host:5432/database?pgbouncer=true"

# Direct URLs for migrations (without pgbouncer)
DIRECT_URL="postgresql://user:password@dev-host:5432/database"
DIRECT_URL_PROD="postgresql://user:password@prod-host:5432/database"
```

### 3. Database Setup

Generate Prisma client:

```bash
npx prisma generate
```

Push schema to database:

```bash
npx prisma db push
```

Seed the database with initial data:

```bash
npx prisma db seed
```

### 4. Start the Application

Development mode:

```bash
npm run start:dev
```

Production mode:

```bash
npm run build
npm run start:prod
```

## Environment Switching

The application automatically connects to the correct database based on `ENVIRONMENT`:

| ENVIRONMENT | Database URL Used |
|-------------|-------------------|
| `dev`       | `DATABASE_URL_DEV` |
| `prod`      | `DATABASE_URL_PROD` |

## Prisma Commands

| Command | Description |
|---------|-------------|
| `npx prisma generate` | Generate Prisma client |
| `npx prisma db push` | Push schema to database (dev) |
| `npx prisma db seed` | Seed database with initial data |
| `npx prisma studio` | Open Prisma Studio (database GUI) |
| `npx prisma migrate dev` | Create and apply migrations (dev) |
| `npx prisma migrate deploy` | Apply migrations (production) |

## Digital Ocean Deployment

### Build Command

```bash
npm install && npm run build
```

### Run Command

```bash
npm run prisma:seed && npm run start:prod
```

### Environment Variables (Digital Ocean)

Set these in your Digital Ocean App settings:

| Variable | Value |
|----------|-------|
| `ENVIRONMENT` | `prod` |
| `DATABASE_URL_PROD` | Your production database URL |
| `DIRECT_URL_PROD` | Your production direct URL |
| `JWT_SECRET` | Your production secret |
| `PORT` | `8080` |

## Test Users (After Seeding)

| Email | Password | Role |
|-------|----------|------|
| superadmin@test.com | password123 | superadmin |
| admin@test.com | password123 | admin |
| manager@test.com | password123 | manager |
| trainer@test.com | password123 | trainer |
| member@test.com | password123 | member |

## API Documentation

Once running, access Swagger documentation at:

```
http://localhost:3000/api
```

## Troubleshooting

### Database Connection Issues

1. Verify your database URL is correct
2. Check that `ENVIRONMENT` matches your intended database
3. Ensure your IP is whitelisted in Supabase

### Prisma Schema Issues

If you get schema validation errors:

```bash
npx prisma generate
npx prisma db push --force-reset  # WARNING: This resets the database!
```

### Seed Errors

If seeding fails due to existing data:

```bash
# Clear and re-seed (development only!)
npx prisma db push --force-reset
npx prisma db seed
```
