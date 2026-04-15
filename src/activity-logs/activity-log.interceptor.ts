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

// Roles to track — admin/superadmin actions are skipped
const TRACKED_ROLES = ['manager', 'trainer'];

const ACTION_MAP: Record<string, ActionMapping> = {
  // --- Users / Clients ---
  'POST /users': {
    action: 'user.created',
    actionCategory: 'user',
    description: 'Created a new client',
    targetType: 'user',
  },
  'POST /users/bulk/create': {
    action: 'user.bulk_created',
    actionCategory: 'user',
    description: 'Bulk created clients',
    targetType: 'user',
  },
  'PATCH /users/:id': {
    action: 'user.updated',
    actionCategory: 'user',
    description: 'Updated client details',
    targetType: 'user',
  },
  'PATCH /users/bulk/update': {
    action: 'user.bulk_updated',
    actionCategory: 'user',
    description: 'Bulk updated clients',
    targetType: 'user',
  },
  'DELETE /users/:id': {
    action: 'user.deleted',
    actionCategory: 'user',
    description: 'Deleted a client',
    targetType: 'user',
  },
  'DELETE /users/bulk/delete': {
    action: 'user.bulk_deleted',
    actionCategory: 'user',
    description: 'Bulk deleted clients',
    targetType: 'user',
  },
  'PATCH /users/:id/status': {
    action: 'user.status_changed',
    actionCategory: 'user',
    description: 'Changed client status',
    targetType: 'user',
  },
  'POST /users/:id/reset-password': {
    action: 'user.password_reset',
    actionCategory: 'user',
    description: 'Reset client password',
    targetType: 'user',
  },
  'PATCH /users/:id/approve': {
    action: 'user.approved',
    actionCategory: 'user',
    description: 'Approved a registration request',
    targetType: 'user',
  },
  'PATCH /users/:id/reject': {
    action: 'user.rejected',
    actionCategory: 'user',
    description: 'Rejected a registration request',
    targetType: 'user',
  },
  'PATCH /users/:id/permissions': {
    action: 'user.permissions_updated',
    actionCategory: 'user',
    description: 'Updated manager permissions',
    targetType: 'user',
  },
  'POST /users/trainers/:id/clients': {
    action: 'trainer.client_assigned',
    actionCategory: 'user',
    description: 'Assigned a client to trainer',
    targetType: 'user',
  },
  'DELETE /users/trainers/:id/clients/:id': {
    action: 'trainer.client_removed',
    actionCategory: 'user',
    description: 'Removed client from trainer',
    targetType: 'user',
  },

  // --- Memberships ---
  'POST /memberships': {
    action: 'membership.created',
    actionCategory: 'membership',
    description: 'Created a membership',
    targetType: 'membership',
  },
  'PATCH /memberships/:id': {
    action: 'membership.updated',
    actionCategory: 'membership',
    description: 'Updated a membership',
    targetType: 'membership',
  },
  'DELETE /memberships/:id': {
    action: 'membership.deleted',
    actionCategory: 'membership',
    description: 'Deleted a membership',
    targetType: 'membership',
  },
  'POST /memberships/:id/payment': {
    action: 'membership.payment_recorded',
    actionCategory: 'membership',
    description: 'Recorded a membership payment',
    targetType: 'membership',
  },
  'POST /memberships/:id/cancel': {
    action: 'membership.cancelled',
    actionCategory: 'membership',
    description: 'Cancelled a membership',
    targetType: 'membership',
  },
  'POST /memberships/:id/freeze': {
    action: 'membership.frozen',
    actionCategory: 'membership',
    description: 'Froze a membership',
    targetType: 'membership',
  },
  'POST /memberships/:id/unfreeze': {
    action: 'membership.unfrozen',
    actionCategory: 'membership',
    description: 'Unfroze a membership',
    targetType: 'membership',
  },
  'POST /memberships/:id/renew': {
    action: 'membership.renewed',
    actionCategory: 'membership',
    description: 'Renewed a membership',
    targetType: 'membership',
  },
  'PATCH /memberships/:id/facilities': {
    action: 'membership.facilities_updated',
    actionCategory: 'membership',
    description: 'Updated membership facilities',
    targetType: 'membership',
  },

  // --- Attendance ---
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
  'DELETE /attendance/:id': {
    action: 'attendance.deleted',
    actionCategory: 'attendance',
    description: 'Deleted an attendance record',
    targetType: 'attendance',
  },

  // --- Plans ---
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

  // --- Offers ---
  'POST /offers': {
    action: 'offer.created',
    actionCategory: 'offer',
    description: 'Created an offer',
    targetType: 'offer',
  },
  'PATCH /offers/:id': {
    action: 'offer.updated',
    actionCategory: 'offer',
    description: 'Updated an offer',
    targetType: 'offer',
  },
  'DELETE /offers/:id': {
    action: 'offer.deleted',
    actionCategory: 'offer',
    description: 'Deleted an offer',
    targetType: 'offer',
  },

  // --- Products ---
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
  'PATCH /products/:id/stock': {
    action: 'product.stock_adjusted',
    actionCategory: 'product',
    description: 'Adjusted product stock',
    targetType: 'product',
  },
  'POST /products/sales': {
    action: 'product.sale_recorded',
    actionCategory: 'sale',
    description: 'Recorded a product sale',
    targetType: 'sale',
  },
  'POST /products/sales/batch': {
    action: 'product.batch_sale',
    actionCategory: 'sale',
    description: 'Completed a batch product sale',
    targetType: 'sale',
  },
  'DELETE /products/sales/:id': {
    action: 'product.sale_voided',
    actionCategory: 'sale',
    description: 'Voided a product sale',
    targetType: 'sale',
  },
  'DELETE /products/sales/batch/:id': {
    action: 'product.batch_sale_voided',
    actionCategory: 'sale',
    description: 'Voided a batch sale',
    targetType: 'sale',
  },
  'POST /products/inventory/batch-adjust': {
    action: 'product.inventory_adjusted',
    actionCategory: 'product',
    description: 'Batch adjusted inventory',
    targetType: 'product',
  },
  'POST /products/inventory/stock-takes': {
    action: 'product.stock_take_started',
    actionCategory: 'product',
    description: 'Started a stock take',
    targetType: 'product',
  },
  'POST /products/inventory/stock-takes/:id/complete': {
    action: 'product.stock_take_completed',
    actionCategory: 'product',
    description: 'Completed a stock take',
    targetType: 'product',
  },

  // --- Payments ---
  'POST /payments': {
    action: 'payment.created',
    actionCategory: 'payment',
    description: 'Created a payment',
    targetType: 'payment',
  },
  'PATCH /payments/:id': {
    action: 'payment.updated',
    actionCategory: 'payment',
    description: 'Updated a payment',
    targetType: 'payment',
  },

  // --- Classes ---
  'POST /classes/types': {
    action: 'class_type.created',
    actionCategory: 'class',
    description: 'Created a class type',
    targetType: 'class_type',
  },
  'PATCH /classes/types/:id': {
    action: 'class_type.updated',
    actionCategory: 'class',
    description: 'Updated a class type',
    targetType: 'class_type',
  },
  'DELETE /classes/types/:id': {
    action: 'class_type.deleted',
    actionCategory: 'class',
    description: 'Deleted a class type',
    targetType: 'class_type',
  },
  'POST /classes/schedules': {
    action: 'class_schedule.created',
    actionCategory: 'class',
    description: 'Created a class schedule',
    targetType: 'class_schedule',
  },
  'PATCH /classes/schedules/:id': {
    action: 'class_schedule.updated',
    actionCategory: 'class',
    description: 'Updated a class schedule',
    targetType: 'class_schedule',
  },
  'DELETE /classes/schedules/:id': {
    action: 'class_schedule.deleted',
    actionCategory: 'class',
    description: 'Deleted a class schedule',
    targetType: 'class_schedule',
  },
  'POST /classes/sessions/generate': {
    action: 'class_session.generated',
    actionCategory: 'class',
    description: 'Generated class sessions',
    targetType: 'class_session',
  },
  'PATCH /classes/sessions/:id': {
    action: 'class_session.updated',
    actionCategory: 'class',
    description: 'Updated a class session',
    targetType: 'class_session',
  },
  'POST /classes/sessions/:id/book': {
    action: 'class_booking.created',
    actionCategory: 'class',
    description: 'Booked a class session',
    targetType: 'class_booking',
  },
  'PATCH /classes/bookings/:id/status': {
    action: 'class_booking.status_changed',
    actionCategory: 'class',
    description: 'Updated booking status',
    targetType: 'class_booking',
  },

  // --- Appointments ---
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
  'PATCH /appointments/:id/status': {
    action: 'appointment.status_changed',
    actionCategory: 'appointment',
    description: 'Changed appointment status',
    targetType: 'appointment',
  },
  'POST /appointments/services': {
    action: 'appointment_service.created',
    actionCategory: 'appointment',
    description: 'Created an appointment service',
    targetType: 'service',
  },
  'PATCH /appointments/services/:id': {
    action: 'appointment_service.updated',
    actionCategory: 'appointment',
    description: 'Updated an appointment service',
    targetType: 'service',
  },
  'DELETE /appointments/services/:id': {
    action: 'appointment_service.deleted',
    actionCategory: 'appointment',
    description: 'Deleted an appointment service',
    targetType: 'service',
  },
  'PUT /appointments/availability': {
    action: 'trainer_availability.updated',
    actionCategory: 'appointment',
    description: 'Updated trainer availability',
    targetType: 'availability',
  },
  'POST /appointments/packages': {
    action: 'session_package.created',
    actionCategory: 'appointment',
    description: 'Created a session package',
    targetType: 'session_package',
  },

  // --- Leads ---
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
  'PATCH /leads/:id/stage': {
    action: 'lead.stage_changed',
    actionCategory: 'lead',
    description: 'Changed lead pipeline stage',
    targetType: 'lead',
  },
  'PATCH /leads/:id/convert': {
    action: 'lead.converted',
    actionCategory: 'lead',
    description: 'Converted lead to client',
    targetType: 'lead',
  },
  'DELETE /leads/:id': {
    action: 'lead.deleted',
    actionCategory: 'lead',
    description: 'Deleted a lead',
    targetType: 'lead',
  },
  'POST /leads/:id/activities': {
    action: 'lead_activity.created',
    actionCategory: 'lead',
    description: 'Added activity to lead',
    targetType: 'lead',
  },

  // --- Referrals ---
  'POST /referrals': {
    action: 'referral.created',
    actionCategory: 'referral',
    description: 'Created a referral',
    targetType: 'referral',
  },
  'PATCH /referrals/:id': {
    action: 'referral.updated',
    actionCategory: 'referral',
    description: 'Updated a referral',
    targetType: 'referral',
  },
  'PATCH /referrals/:id/reward': {
    action: 'referral.rewarded',
    actionCategory: 'referral',
    description: 'Marked referral as rewarded',
    targetType: 'referral',
  },

  // --- Diets ---
  'POST /diets': {
    action: 'diet.created',
    actionCategory: 'diet',
    description: 'Created a diet plan',
    targetType: 'diet',
  },
  'PATCH /diets/:id': {
    action: 'diet.updated',
    actionCategory: 'diet',
    description: 'Updated a diet plan',
    targetType: 'diet',
  },
  'DELETE /diets/:id': {
    action: 'diet.deleted',
    actionCategory: 'diet',
    description: 'Deleted a diet plan',
    targetType: 'diet',
  },
  'POST /diets/assign': {
    action: 'diet.assigned',
    actionCategory: 'diet',
    description: 'Assigned diet to a client',
    targetType: 'diet',
  },
  'PATCH /diets/assignments/:id': {
    action: 'diet.assignment_updated',
    actionCategory: 'diet',
    description: 'Updated diet assignment',
    targetType: 'diet',
  },
  'DELETE /diets/assignments/:id': {
    action: 'diet.unassigned',
    actionCategory: 'diet',
    description: 'Unassigned diet from client',
    targetType: 'diet',
  },

  // --- Body Metrics ---
  'PATCH /body-metrics/user': {
    action: 'body_metrics.updated',
    actionCategory: 'body_metrics',
    description: 'Updated client body metrics',
    targetType: 'body_metrics',
  },
  'POST /body-metrics/user/record': {
    action: 'body_metrics.recorded',
    actionCategory: 'body_metrics',
    description: 'Recorded client body metrics',
    targetType: 'body_metrics',
  },
  'DELETE /body-metrics/user/history/:id': {
    action: 'body_metrics.history_deleted',
    actionCategory: 'body_metrics',
    description: 'Deleted body metrics history record',
    targetType: 'body_metrics',
  },

  // --- Progress Photos ---
  'POST /progress-photos/upload': {
    action: 'progress_photo.uploaded',
    actionCategory: 'progress_photo',
    description: 'Uploaded a progress photo',
    targetType: 'progress_photo',
  },
  'PATCH /progress-photos/:id': {
    action: 'progress_photo.updated',
    actionCategory: 'progress_photo',
    description: 'Updated a progress photo',
    targetType: 'progress_photo',
  },
  'DELETE /progress-photos/:id': {
    action: 'progress_photo.deleted',
    actionCategory: 'progress_photo',
    description: 'Deleted a progress photo',
    targetType: 'progress_photo',
  },

  // --- Equipment ---
  'POST /equipment': {
    action: 'equipment.created',
    actionCategory: 'equipment',
    description: 'Added equipment',
    targetType: 'equipment',
  },
  'PATCH /equipment/:id': {
    action: 'equipment.updated',
    actionCategory: 'equipment',
    description: 'Updated equipment',
    targetType: 'equipment',
  },
  'DELETE /equipment/:id': {
    action: 'equipment.deleted',
    actionCategory: 'equipment',
    description: 'Deleted equipment',
    targetType: 'equipment',
  },
  'POST /equipment/:id/maintenance': {
    action: 'equipment.maintenance_created',
    actionCategory: 'equipment',
    description: 'Created maintenance record',
    targetType: 'equipment',
  },
  'PATCH /equipment/maintenance/:id': {
    action: 'equipment.maintenance_updated',
    actionCategory: 'equipment',
    description: 'Updated maintenance record',
    targetType: 'equipment',
  },
  'DELETE /equipment/maintenance/:id': {
    action: 'equipment.maintenance_deleted',
    actionCategory: 'equipment',
    description: 'Deleted maintenance record',
    targetType: 'equipment',
  },

  // --- Facilities ---
  'POST /facilities': {
    action: 'facility.created',
    actionCategory: 'facility',
    description: 'Created a facility',
    targetType: 'facility',
  },
  'PATCH /facilities/:id': {
    action: 'facility.updated',
    actionCategory: 'facility',
    description: 'Updated a facility',
    targetType: 'facility',
  },
  'DELETE /facilities/:id': {
    action: 'facility.deleted',
    actionCategory: 'facility',
    description: 'Deleted a facility',
    targetType: 'facility',
  },

  // --- Amenities ---
  'POST /amenities': {
    action: 'amenity.created',
    actionCategory: 'amenity',
    description: 'Created an amenity',
    targetType: 'amenity',
  },
  'PATCH /amenities/:id': {
    action: 'amenity.updated',
    actionCategory: 'amenity',
    description: 'Updated an amenity',
    targetType: 'amenity',
  },
  'DELETE /amenities/:id': {
    action: 'amenity.deleted',
    actionCategory: 'amenity',
    description: 'Deleted an amenity',
    targetType: 'amenity',
  },

  // --- Guest Visits ---
  'POST /guest-visits': {
    action: 'guest_visit.created',
    actionCategory: 'guest_visit',
    description: 'Recorded a guest visit',
    targetType: 'guest_visit',
  },
  'PATCH /guest-visits/:id': {
    action: 'guest_visit.updated',
    actionCategory: 'guest_visit',
    description: 'Updated a guest visit',
    targetType: 'guest_visit',
  },
  'DELETE /guest-visits/:id': {
    action: 'guest_visit.deleted',
    actionCategory: 'guest_visit',
    description: 'Deleted a guest visit',
    targetType: 'guest_visit',
  },

  // --- Member Notes ---
  'POST /member-notes': {
    action: 'member_note.created',
    actionCategory: 'member_note',
    description: 'Created a member note',
    targetType: 'member_note',
  },
  'PATCH /member-notes/:id': {
    action: 'member_note.updated',
    actionCategory: 'member_note',
    description: 'Updated a member note',
    targetType: 'member_note',
  },
  'PATCH /member-notes/:id/pin': {
    action: 'member_note.pin_toggled',
    actionCategory: 'member_note',
    description: 'Toggled pin on member note',
    targetType: 'member_note',
  },
  'DELETE /member-notes/:id': {
    action: 'member_note.deleted',
    actionCategory: 'member_note',
    description: 'Deleted a member note',
    targetType: 'member_note',
  },

  // --- Announcements ---
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
  'PATCH /announcements/:id/toggle-pin': {
    action: 'announcement.pin_toggled',
    actionCategory: 'announcement',
    description: 'Toggled pin on announcement',
    targetType: 'announcement',
  },
  'DELETE /announcements/:id': {
    action: 'announcement.deleted',
    actionCategory: 'announcement',
    description: 'Deleted an announcement',
    targetType: 'announcement',
  },

  // --- Salary ---
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

  // --- Support Tickets ---
  'POST /support': {
    action: 'support_ticket.created',
    actionCategory: 'support',
    description: 'Created a support ticket',
    targetType: 'support_ticket',
  },
  'PATCH /support/:id': {
    action: 'support_ticket.updated',
    actionCategory: 'support',
    description: 'Updated a support ticket',
    targetType: 'support_ticket',
  },
  'POST /support/:id/messages': {
    action: 'support_ticket.message_sent',
    actionCategory: 'support',
    description: 'Sent a support ticket message',
    targetType: 'support_ticket',
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

    const rawUrl: string = request.route?.path || request.url;
    // Strip global /api prefix and query strings for clean route matching
    const url = rawUrl.replace(/^\/api/, '').split('?')[0];

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

    // Only track manager and trainer actions — skip admin/superadmin/client
    if (!TRACKED_ROLES.includes(user.role)) return;

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
