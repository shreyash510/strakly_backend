# Biometric Integration Guide

> **Status:** Planned Feature
> **Approach:** Webhook-based (Push)
> **Created:** January 2026

---

## Overview

This document outlines the integration of biometric devices (fingerprint scanners, face recognition) with the Strakly gym management system for automated member check-in/check-out.

---

## Architecture

### Webhook Flow

```
┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│                  │         │                  │         │                  │
│  Biometric       │  HTTP   │  Strakly         │  SQL    │  Database        │
│  Device          │ ──────► │  Backend API     │ ──────► │                  │
│  (ZKTeco/Mantra) │  POST   │                  │         │  Tenant Schema   │
│                  │         │                  │         │                  │
└──────────────────┘         └──────────────────┘         └──────────────────┘
        │                            │
        │                            │
        ▼                            ▼
   Member scans               - Validate request
   fingerprint                - Find user by biometricId
                              - Mark attendance
                              - Return response
```

### Why Webhook (Push) Over Polling (Pull)?

| Aspect | Webhook | Polling |
|--------|---------|---------|
| Real-time | Instant | Delayed |
| Server Load | Low | High |
| Network Usage | Efficient | Wasteful |
| Scalability | Excellent | Poor |
| Complexity | Simple | Complex |

---

## Supported Devices

### Recommended Hardware

| Brand | Model | Connection | SDK |
|-------|-------|------------|-----|
| ZKTeco | F18, K40, MB20 | LAN/WiFi | ZKTeco Push SDK |
| Mantra | MFS100, MFSTAB | USB/LAN | Mantra RD Service |
| Suprema | BioStation 2 | LAN/WiFi | Suprema BioStar API |
| eSSL | X990, IFACE302 | LAN/WiFi | eSSL Push Protocol |

### Device Configuration

Devices must be configured to:
1. Connect to local network (LAN/WiFi)
2. Push events to Strakly webhook URL
3. Include device authentication (API key)

---

## Database Changes

### 1. Add Biometric Fields to Users Table

**File:** `src/tenant/tenant.service.ts`

Add to `createTenantTables()`:

```sql
-- Add to users table
biometric_id VARCHAR(100) UNIQUE,
biometric_type VARCHAR(50),  -- 'fingerprint', 'face', 'palm'
biometric_enrolled_at TIMESTAMP,
biometric_device_id VARCHAR(100)
```

### 2. Create Biometric Devices Table (Public Schema)

**File:** `prisma/schema.prisma`

```prisma
model BiometricDevice {
  id            Int       @id @default(autoincrement())
  gymId         Int
  branchId      Int?
  deviceId      String    @unique  // Hardware serial/ID
  deviceName    String
  deviceType    String    // 'fingerprint', 'face', 'multi'
  manufacturer  String    // 'zkteco', 'mantra', 'suprema'
  ipAddress     String?
  apiKey        String    // For webhook authentication
  isActive      Boolean   @default(true)
  lastSyncAt    DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  gym           Gym       @relation(fields: [gymId], references: [id])
  branch        Branch?   @relation(fields: [branchId], references: [id])

  @@index([gymId])
  @@index([branchId])
  @@index([deviceId])
}
```

### 3. Create Biometric Logs Table (Audit)

```prisma
model BiometricLog {
  id            Int       @id @default(autoincrement())
  deviceId      String
  gymId         Int
  biometricId   String
  eventType     String    // 'CHECK_IN', 'CHECK_OUT', 'DENIED'
  rawPayload    Json
  status        String    // 'success', 'failed', 'user_not_found'
  errorMessage  String?
  processedAt   DateTime  @default(now())

  @@index([deviceId])
  @@index([gymId])
  @@index([biometricId])
}
```

---

## API Implementation

### 1. Webhook Controller

**File:** `src/biometric/biometric.controller.ts`

```typescript
import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { BiometricService } from './biometric.service';
import { BiometricWebhookDto } from './dto/biometric-webhook.dto';

@ApiTags('biometric')
@Controller('webhook/biometric')
export class BiometricController {
  constructor(private readonly biometricService: BiometricService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive biometric device webhook' })
  async handleWebhook(
    @Headers('x-device-id') deviceId: string,
    @Headers('x-api-key') apiKey: string,
    @Headers('x-signature') signature: string,
    @Body() payload: BiometricWebhookDto,
  ) {
    // Validate device and API key
    if (!deviceId || !apiKey) {
      throw new UnauthorizedException('Missing device credentials');
    }

    // Process the webhook
    return this.biometricService.processWebhook(deviceId, apiKey, signature, payload);
  }

  @Post('zkteco')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'ZKTeco specific webhook format' })
  async handleZKTecoWebhook(
    @Headers('x-device-id') deviceId: string,
    @Headers('x-api-key') apiKey: string,
    @Body() payload: any,
  ) {
    // Transform ZKTeco format to standard format
    const standardPayload = this.biometricService.transformZKTecoPayload(payload);
    return this.biometricService.processWebhook(deviceId, apiKey, null, standardPayload);
  }

  @Post('mantra')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mantra specific webhook format' })
  async handleMantraWebhook(
    @Headers('x-device-id') deviceId: string,
    @Headers('x-api-key') apiKey: string,
    @Body() payload: any,
  ) {
    // Transform Mantra format to standard format
    const standardPayload = this.biometricService.transformMantraPayload(payload);
    return this.biometricService.processWebhook(deviceId, apiKey, null, standardPayload);
  }
}
```

### 2. Webhook DTO

**File:** `src/biometric/dto/biometric-webhook.dto.ts`

```typescript
import { IsString, IsEnum, IsOptional, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum BiometricEventType {
  CHECK_IN = 'CHECK_IN',
  CHECK_OUT = 'CHECK_OUT',
  DENIED = 'DENIED',
}

export class BiometricWebhookDto {
  @ApiProperty({ description: 'Biometric ID (fingerprint template ID)' })
  @IsString()
  biometricId: string;

  @ApiProperty({ enum: BiometricEventType })
  @IsEnum(BiometricEventType)
  eventType: BiometricEventType;

  @ApiProperty({ description: 'Event timestamp from device' })
  @IsDateString()
  timestamp: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  verifyMode?: string;  // 'fingerprint', 'face', 'card'

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  temperature?: string;  // If device has thermal scanner
}
```

### 3. Biometric Service

**File:** `src/biometric/biometric.service.ts`

```typescript
import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { AttendanceService } from '../attendance/attendance.service';
import { BiometricWebhookDto, BiometricEventType } from './dto/biometric-webhook.dto';
import * as crypto from 'crypto';

@Injectable()
export class BiometricService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly attendanceService: AttendanceService,
  ) {}

  /**
   * Process incoming webhook from biometric device
   */
  async processWebhook(
    deviceId: string,
    apiKey: string,
    signature: string | null,
    payload: BiometricWebhookDto,
  ) {
    // 1. Validate device
    const device = await this.validateDevice(deviceId, apiKey);

    // 2. Log the raw request
    const log = await this.createLog(deviceId, device.gymId, payload);

    try {
      // 3. Find user by biometric ID
      const user = await this.findUserByBiometricId(device.gymId, payload.biometricId);

      if (!user) {
        await this.updateLog(log.id, 'user_not_found', 'No user found with this biometric ID');
        return {
          success: false,
          message: 'User not found',
          biometricId: payload.biometricId,
        };
      }

      // 4. Process attendance based on event type
      let result;
      if (payload.eventType === BiometricEventType.CHECK_IN) {
        result = await this.handleCheckIn(device, user, payload);
      } else if (payload.eventType === BiometricEventType.CHECK_OUT) {
        result = await this.handleCheckOut(device, user, payload);
      } else {
        result = { success: false, message: 'Access denied' };
      }

      // 5. Update log
      await this.updateLog(log.id, result.success ? 'success' : 'failed', result.message);

      // 6. Update device last sync
      await this.prisma.biometricDevice.update({
        where: { id: device.id },
        data: { lastSyncAt: new Date() },
      });

      return {
        success: result.success,
        message: result.message,
        userId: user.id,
        userName: user.name,
        eventType: payload.eventType,
        timestamp: payload.timestamp,
      };

    } catch (error) {
      await this.updateLog(log.id, 'failed', error.message);
      throw error;
    }
  }

  /**
   * Validate device credentials
   */
  private async validateDevice(deviceId: string, apiKey: string) {
    const device = await this.prisma.biometricDevice.findUnique({
      where: { deviceId },
    });

    if (!device) {
      throw new UnauthorizedException('Unknown device');
    }

    if (!device.isActive) {
      throw new UnauthorizedException('Device is deactivated');
    }

    if (device.apiKey !== apiKey) {
      throw new UnauthorizedException('Invalid API key');
    }

    return device;
  }

  /**
   * Find user by biometric ID in tenant schema
   */
  private async findUserByBiometricId(gymId: number, biometricId: string) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT id, name, email, attendance_code, status, branch_id
         FROM users
         WHERE biometric_id = $1 AND status = 'active'`,
        [biometricId]
      );
      return result.rows[0] || null;
    });
  }

  /**
   * Handle check-in event
   */
  private async handleCheckIn(device: any, user: any, payload: BiometricWebhookDto) {
    try {
      // Use attendance service to mark attendance
      const result = await this.attendanceService.markAttendance(
        {
          id: user.id,
          name: user.name,
          email: user.email,
          attendanceCode: user.attendance_code,
        },
        null,  // staffId - null for biometric
        device.gymId,
        'biometric',  // checkInMethod
      );

      return {
        success: true,
        message: `Welcome, ${user.name}!`,
        attendance: result,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to mark attendance',
      };
    }
  }

  /**
   * Handle check-out event
   */
  private async handleCheckOut(device: any, user: any, payload: BiometricWebhookDto) {
    try {
      // Find active attendance record
      const activeAttendance = await this.tenantService.executeInTenant(
        device.gymId,
        async (client) => {
          const result = await client.query(
            `SELECT id FROM attendance
             WHERE user_id = $1 AND status = 'present' AND check_out_time IS NULL
             ORDER BY check_in_time DESC LIMIT 1`,
            [user.id]
          );
          return result.rows[0];
        }
      );

      if (!activeAttendance) {
        return {
          success: false,
          message: 'No active check-in found',
        };
      }

      // Check out
      await this.attendanceService.checkOut(
        activeAttendance.id,
        device.gymId,
        null,  // staffId
      );

      return {
        success: true,
        message: `Goodbye, ${user.name}!`,
      };
    } catch (error) {
      return {
        success: false,
        message: error.message || 'Failed to check out',
      };
    }
  }

  /**
   * Create biometric log entry
   */
  private async createLog(deviceId: string, gymId: number, payload: BiometricWebhookDto) {
    return this.prisma.biometricLog.create({
      data: {
        deviceId,
        gymId,
        biometricId: payload.biometricId,
        eventType: payload.eventType,
        rawPayload: payload as any,
        status: 'processing',
      },
    });
  }

  /**
   * Update log status
   */
  private async updateLog(logId: number, status: string, message?: string) {
    return this.prisma.biometricLog.update({
      where: { id: logId },
      data: { status, errorMessage: message },
    });
  }

  /**
   * Transform ZKTeco payload to standard format
   */
  transformZKTecoPayload(payload: any): BiometricWebhookDto {
    // ZKTeco typically sends:
    // { pin: "123", time: "2026-01-29 10:30:00", status: 0, verify: 1 }
    return {
      biometricId: payload.pin || payload.user_id,
      eventType: payload.status === 0 ? BiometricEventType.CHECK_IN : BiometricEventType.CHECK_OUT,
      timestamp: new Date(payload.time).toISOString(),
      verifyMode: this.getVerifyMode(payload.verify),
    };
  }

  /**
   * Transform Mantra payload to standard format
   */
  transformMantraPayload(payload: any): BiometricWebhookDto {
    // Mantra format varies by model
    return {
      biometricId: payload.userId || payload.employeeId,
      eventType: payload.punchType === 'IN' ? BiometricEventType.CHECK_IN : BiometricEventType.CHECK_OUT,
      timestamp: payload.punchTime || new Date().toISOString(),
      verifyMode: 'fingerprint',
    };
  }

  private getVerifyMode(code: number): string {
    const modes: Record<number, string> = {
      1: 'fingerprint',
      2: 'card',
      3: 'password',
      4: 'face',
    };
    return modes[code] || 'unknown';
  }

  /**
   * Enroll user biometric ID
   */
  async enrollUser(gymId: number, userId: number, biometricId: string, biometricType: string = 'fingerprint') {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE users SET
          biometric_id = $1,
          biometric_type = $2,
          biometric_enrolled_at = NOW()
         WHERE id = $3`,
        [biometricId, biometricType, userId]
      );
      return { success: true, message: 'Biometric enrolled successfully' };
    });
  }

  /**
   * Remove user biometric enrollment
   */
  async unenrollUser(gymId: number, userId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE users SET
          biometric_id = NULL,
          biometric_type = NULL,
          biometric_enrolled_at = NULL
         WHERE id = $1`,
        [userId]
      );
      return { success: true, message: 'Biometric removed successfully' };
    });
  }
}
```

### 4. Biometric Module

**File:** `src/biometric/biometric.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { BiometricController } from './biometric.controller';
import { BiometricService } from './biometric.service';
import { DatabaseModule } from '../database/database.module';
import { TenantModule } from '../tenant/tenant.module';
import { AttendanceModule } from '../attendance/attendance.module';

@Module({
  imports: [DatabaseModule, TenantModule, AttendanceModule],
  controllers: [BiometricController],
  providers: [BiometricService],
  exports: [BiometricService],
})
export class BiometricModule {}
```

---

## Device Management API

### Endpoints for Managing Devices

```typescript
// GET /api/biometric/devices - List all devices for gym
// POST /api/biometric/devices - Register new device
// GET /api/biometric/devices/:id - Get device details
// PATCH /api/biometric/devices/:id - Update device
// DELETE /api/biometric/devices/:id - Remove device
// POST /api/biometric/devices/:id/regenerate-key - Regenerate API key
```

### User Enrollment Endpoints

```typescript
// POST /api/biometric/enroll - Enroll user biometric
// DELETE /api/biometric/enroll/:userId - Remove enrollment
// GET /api/biometric/enrolled - List enrolled users
```

---

## Frontend Implementation

### 1. Device Management Page

**Location:** `src/pages/Settings/BiometricDevices/`

Features:
- List registered devices
- Add new device (generates API key)
- Edit device settings
- View device status (online/offline/last sync)
- Regenerate API key

### 2. User Enrollment UI

**Location:** Add to user details page

Features:
- Show biometric enrollment status
- Button to enroll (opens modal)
- Manual biometric ID input (from device)
- Remove enrollment option

### 3. Attendance Dashboard

Update attendance dashboard to show:
- Check-in method badge (code/biometric/manual)
- Filter by check-in method
- Biometric device statistics

---

## Device Setup Guide

### ZKTeco Device Configuration

1. **Access Device Web Interface**
   - Connect device to network
   - Find device IP (usually shown on device screen)
   - Open `http://<device-ip>` in browser

2. **Configure Push Settings**
   ```
   Settings → Communication → Push Server

   Server URL: https://api.strakly.com/webhook/biometric/zkteco
   Push Protocol: HTTP
   Push Event: Check-in/Check-out
   ```

3. **Set Headers**
   ```
   x-device-id: <your-device-serial>
   x-api-key: <from-strakly-dashboard>
   ```

4. **Test Connection**
   - Use device's "Test Connection" button
   - Check Strakly logs for incoming webhook

### Mantra Device Configuration

1. **Install Mantra Management Software**
2. **Configure Server Settings**
   ```
   Server URL: https://api.strakly.com/webhook/biometric/mantra
   Port: 443
   Protocol: HTTPS
   ```
3. **Add Authentication Headers**
4. **Enable Push Mode**

---

## Security Considerations

### 1. API Key Security
- Generate strong random API keys (32+ characters)
- Store hashed in database
- Rotate keys periodically
- Use HTTPS only

### 2. Request Validation
```typescript
// Validate HMAC signature (optional but recommended)
const expectedSignature = crypto
  .createHmac('sha256', device.apiKey)
  .update(JSON.stringify(payload))
  .digest('hex');

if (signature !== expectedSignature) {
  throw new UnauthorizedException('Invalid signature');
}
```

### 3. Rate Limiting
```typescript
// Limit requests per device
@Throttle(100, 60)  // 100 requests per minute per device
```

### 4. IP Whitelisting (Optional)
- Store allowed IPs per device
- Validate incoming request IP

---

## Error Handling

### Webhook Response Codes

| Code | Meaning | Device Action |
|------|---------|---------------|
| 200 | Success | Show green light |
| 400 | Bad request | Log error |
| 401 | Unauthorized | Alert admin |
| 404 | User not found | Show red light |
| 429 | Rate limited | Retry later |
| 500 | Server error | Queue & retry |

### Device Offline Handling

1. Device stores events locally
2. When online, pushes queued events
3. Include `queued: true` flag
4. Server processes with original timestamp

---

## Testing

### Webhook Testing with cURL

```bash
# Test check-in
curl -X POST https://api.strakly.com/webhook/biometric \
  -H "Content-Type: application/json" \
  -H "x-device-id: TEST-DEVICE-001" \
  -H "x-api-key: your-api-key-here" \
  -d '{
    "biometricId": "FP-12345",
    "eventType": "CHECK_IN",
    "timestamp": "2026-01-29T10:30:00Z"
  }'

# Test check-out
curl -X POST https://api.strakly.com/webhook/biometric \
  -H "Content-Type: application/json" \
  -H "x-device-id: TEST-DEVICE-001" \
  -H "x-api-key: your-api-key-here" \
  -d '{
    "biometricId": "FP-12345",
    "eventType": "CHECK_OUT",
    "timestamp": "2026-01-29T18:00:00Z"
  }'
```

### Postman Collection

Create a Postman collection with:
1. Register device
2. Enroll user
3. Simulate check-in
4. Simulate check-out
5. View logs

---

## Implementation Checklist

### Phase 1: Backend Foundation
- [ ] Add biometric columns to tenant users table
- [ ] Create BiometricDevice model in Prisma
- [ ] Create BiometricLog model in Prisma
- [ ] Run migrations
- [ ] Create biometric module structure

### Phase 2: Webhook Implementation
- [ ] Implement webhook controller
- [ ] Implement biometric service
- [ ] Add device validation
- [ ] Add user lookup by biometric ID
- [ ] Integrate with attendance service
- [ ] Add logging

### Phase 3: Device Management
- [ ] Device CRUD endpoints
- [ ] API key generation
- [ ] Device status tracking

### Phase 4: User Enrollment
- [ ] Enrollment endpoint
- [ ] Add to user edit forms
- [ ] Bulk enrollment support

### Phase 5: Frontend
- [ ] Device management page
- [ ] User enrollment UI
- [ ] Attendance method filter
- [ ] Dashboard updates

### Phase 6: Testing & Documentation
- [ ] Unit tests
- [ ] Integration tests
- [ ] Device setup guides
- [ ] API documentation

---

## Future Enhancements

1. **Multi-modal Biometrics** - Support fingerprint + face
2. **Access Zones** - Different areas (gym, pool, spa)
3. **Visitor Management** - Guest biometric check-in
4. **Analytics** - Peak hours, device usage stats
5. **Mobile Biometrics** - Phone fingerprint/face for check-in
6. **Offline Sync** - Handle device offline scenarios better

---

## Support

For device-specific integration support:
- ZKTeco: https://www.zkteco.com/en/Support
- Mantra: https://www.mantratec.com/support
- Suprema: https://www.supremainc.com/support
