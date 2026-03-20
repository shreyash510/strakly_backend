import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { ActivityLogsService } from './activity-logs.service';

interface ActionMapping {
  action: string;
  actionCategory: string;
  description: string;
  targetType?: string;
}

const ACTION_MAP: Record<string, ActionMapping> = {
  'POST /users': {
    action: 'user.created',
    actionCategory: 'user',
    description: 'Created a new client',
    targetType: 'user',
  },
  'PATCH /users/:id': {
    action: 'user.updated',
    actionCategory: 'user',
    description: 'Updated client details',
    targetType: 'user',
  },
  'DELETE /users/:id': {
    action: 'user.deleted',
    actionCategory: 'user',
    description: 'Deleted a client',
    targetType: 'user',
  },
  'POST /products': {
    action: 'product.created',
    actionCategory: 'product',
    description: 'Created a new product',
    targetType: 'product',
  },
  'PATCH /products/:id': {
    action: 'product.updated',
    actionCategory: 'product',
    description: 'Updated a product',
    targetType: 'product',
  },
  'DELETE /products/:id': {
    action: 'product.deleted',
    actionCategory: 'product',
    description: 'Deleted a product',
    targetType: 'product',
  },
  'POST /products/batch-sale': {
    action: 'product.batch_sale',
    actionCategory: 'sale',
    description: 'Completed a product sale',
    targetType: 'sale',
  },
  'POST /products/sales/:id/void': {
    action: 'product.sale_voided',
    actionCategory: 'sale',
    description: 'Voided a sale',
    targetType: 'sale',
  },
  'POST /memberships/enroll': {
    action: 'membership.created',
    actionCategory: 'membership',
    description: 'Enrolled a client in a membership',
    targetType: 'membership',
  },
  'PATCH /memberships/:id': {
    action: 'membership.updated',
    actionCategory: 'membership',
    description: 'Updated a membership',
    targetType: 'membership',
  },
  'POST /attendance/mark': {
    action: 'attendance.checked_in',
    actionCategory: 'attendance',
    description: 'Marked attendance',
    targetType: 'attendance',
  },
  'PATCH /attendance/checkout/:id': {
    action: 'attendance.checked_out',
    actionCategory: 'attendance',
    description: 'Checked out a member',
    targetType: 'attendance',
  },
  'POST /plans': {
    action: 'plan.created',
    actionCategory: 'plan',
    description: 'Created a membership plan',
    targetType: 'plan',
  },
  'PATCH /plans/:id': {
    action: 'plan.updated',
    actionCategory: 'plan',
    description: 'Updated a membership plan',
    targetType: 'plan',
  },
  'DELETE /plans/:id': {
    action: 'plan.deleted',
    actionCategory: 'plan',
    description: 'Deleted a membership plan',
    targetType: 'plan',
  },
  'POST /announcements': {
    action: 'announcement.created',
    actionCategory: 'announcement',
    description: 'Created an announcement',
    targetType: 'announcement',
  },
  'PATCH /announcements/:id': {
    action: 'announcement.updated',
    actionCategory: 'announcement',
    description: 'Updated an announcement',
    targetType: 'announcement',
  },
  'DELETE /announcements/:id': {
    action: 'announcement.deleted',
    actionCategory: 'announcement',
    description: 'Deleted an announcement',
    targetType: 'announcement',
  },
  'POST /classes': {
    action: 'class.created',
    actionCategory: 'class',
    description: 'Created a class',
    targetType: 'class',
  },
  'PATCH /classes/:id': {
    action: 'class.updated',
    actionCategory: 'class',
    description: 'Updated a class',
    targetType: 'class',
  },
  'DELETE /classes/:id': {
    action: 'class.deleted',
    actionCategory: 'class',
    description: 'Deleted a class',
    targetType: 'class',
  },
  'POST /appointments': {
    action: 'appointment.created',
    actionCategory: 'appointment',
    description: 'Created an appointment',
    targetType: 'appointment',
  },
  'PATCH /appointments/:id': {
    action: 'appointment.updated',
    actionCategory: 'appointment',
    description: 'Updated an appointment',
    targetType: 'appointment',
  },
  'POST /leads': {
    action: 'lead.created',
    actionCategory: 'lead',
    description: 'Created a lead',
    targetType: 'lead',
  },
  'PATCH /leads/:id': {
    action: 'lead.updated',
    actionCategory: 'lead',
    description: 'Updated a lead',
    targetType: 'lead',
  },
  'POST /salary': {
    action: 'salary.created',
    actionCategory: 'salary',
    description: 'Created a salary record',
    targetType: 'salary',
  },
  'PATCH /salary/:id': {
    action: 'salary.updated',
    actionCategory: 'salary',
    description: 'Updated a salary record',
    targetType: 'salary',
  },
};

// Routes to skip logging (GET-only routes, auth, health etc.)
const SKIP_ROUTES = [
  '/auth/',
  '/health',
  '/activity-logs',
  '/upload',
];

@Injectable()
export class ActivityLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ActivityLogInterceptor.name);

  constructor(private readonly activityLogsService: ActivityLogsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    // Only log mutating requests
    if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) {
      return next.handle();
    }

    const url: string = request.route?.path || request.url;

    // Skip certain routes
    if (SKIP_ROUTES.some((skip) => url.startsWith(skip))) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: () => {
          // Log asynchronously - don't block the response
          this.logAction(request, method, url).catch((err) =>
            this.logger.error('Failed to auto-log activity', err),
          );
        },
      }),
    );
  }

  private async logAction(
    request: any,
    method: string,
    routePath: string,
  ): Promise<void> {
    const user = request.user;
    if (!user || !user.gymId) return;

    // Match the route to an action mapping
    const mapping = this.findMapping(method, routePath);
    if (!mapping) return;

    // Extract target ID from params
    const targetId = request.params?.id
      ? parseInt(request.params.id, 10)
      : undefined;

    const ipAddress =
      request.headers['x-forwarded-for'] ||
      request.connection?.remoteAddress ||
      request.ip;

    await this.activityLogsService.log(
      {
        actorId: user.userId,
        actorType: user.role || 'unknown',
        actorName: user.name || undefined,
        action: mapping.action,
        actionCategory: mapping.actionCategory,
        targetType: mapping.targetType,
        targetId: targetId || undefined,
        description: mapping.description,
        branchId: user.branchId || undefined,
        ipAddress: typeof ipAddress === 'string' ? ipAddress : ipAddress?.[0],
        userAgent: request.headers['user-agent'],
      },
      user.gymId,
    );
  }

  private findMapping(
    method: string,
    routePath: string,
  ): ActionMapping | undefined {
    // Try exact match first
    const exactKey = `${method} ${routePath}`;
    if (ACTION_MAP[exactKey]) {
      return ACTION_MAP[exactKey];
    }

    // Try pattern match (replace numeric segments with :id)
    const normalizedPath = routePath.replace(/\/\d+/g, '/:id');
    const patternKey = `${method} ${normalizedPath}`;
    if (ACTION_MAP[patternKey]) {
      return ACTION_MAP[patternKey];
    }

    return undefined;
  }
}
