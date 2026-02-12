import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Notification } from './notification-types';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

interface SocketData {
  userId: number;
  gymId: number | null;
  branchId: number | null;
  role: string;
  isSuperAdmin: boolean;
}

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/notifications',
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  // Map: `${gymId}:${userId}` -> Set<socket.id> for tenant users
  // Map: `system:${userId}` -> Set<socket.id> for superadmin users
  private userSockets = new Map<string, Set<string>>();

  // Map: socket.id -> SocketData for quick lookup
  private socketData = new Map<string, SocketData>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      // Extract token from handshake auth or query
      const token =
        client.handshake.auth?.token ||
        client.handshake.query?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Connection rejected: No token provided`);
        client.disconnect();
        return;
      }

      // Verify JWT
      const secret =
        this.configService.get<string>('JWT_SECRET') ||
        'strakly-secret-key-change-in-production';

      let payload: JwtPayload;
      try {
        payload = this.jwtService.verify(token, { secret });
      } catch (error) {
        this.logger.warn(`Connection rejected: Invalid token - ${error.message}`);
        client.disconnect();
        return;
      }

      const userId =
        typeof payload.sub === 'string' ? parseInt(payload.sub) : payload.sub;
      const gymId = payload.gymId;
      const branchId = payload.branchId;
      const role = payload.role || 'client';
      const isSuperAdmin = payload.isSuperAdmin === true;

      // Store socket data
      const data: SocketData = {
        userId,
        gymId,
        branchId,
        role,
        isSuperAdmin,
      };
      this.socketData.set(client.id, data);

      // Create key for user sockets map
      const key = isSuperAdmin ? `system:${userId}` : `${gymId}:${userId}`;

      // Add to user sockets map
      if (!this.userSockets.has(key)) {
        this.userSockets.set(key, new Set());
      }
      this.userSockets.get(key)!.add(client.id);

      // Join rooms for targeted broadcasts
      if (isSuperAdmin) {
        client.join('superadmin');
        client.join(`user:system:${userId}`);
      } else if (gymId) {
        client.join(`gym:${gymId}`);
        client.join(`user:${gymId}:${userId}`);
        if (branchId) {
          client.join(`branch:${gymId}:${branchId}`);
        }
      }

      this.logger.log(
        `Client connected: ${client.id} (userId: ${userId}, gymId: ${gymId}, role: ${role})`,
      );
    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const data = this.socketData.get(client.id);

    if (data) {
      const key = data.isSuperAdmin
        ? `system:${data.userId}`
        : `${data.gymId}:${data.userId}`;

      const sockets = this.userSockets.get(key);
      if (sockets) {
        sockets.delete(client.id);
        if (sockets.size === 0) {
          this.userSockets.delete(key);
        }
      }

      this.socketData.delete(client.id);

      this.logger.log(
        `Client disconnected: ${client.id} (userId: ${data.userId})`,
      );
    }
  }

  /**
   * Emit notification to a specific user in a gym
   */
  emitToUser(gymId: number, userId: number, notification: Notification) {
    const key = `${gymId}:${userId}`;
    const sockets = this.userSockets.get(key);

    if (sockets && sockets.size > 0) {
      sockets.forEach((socketId) => {
        this.server.to(socketId).emit('notification', notification);
      });
      this.logger.debug(
        `Notification sent to user ${userId} in gym ${gymId} (${sockets.size} connections)`,
      );
    } else {
      this.logger.debug(
        `User ${userId} in gym ${gymId} not connected, notification stored only`,
      );
    }
  }

  /**
   * Emit notification to a superadmin user
   */
  emitToSuperadmin(userId: number, notification: Notification) {
    const key = `system:${userId}`;
    const sockets = this.userSockets.get(key);

    if (sockets && sockets.size > 0) {
      sockets.forEach((socketId) => {
        this.server.to(socketId).emit('notification', notification);
      });
      this.logger.debug(
        `System notification sent to superadmin ${userId} (${sockets.size} connections)`,
      );
    }
  }

  /**
   * Emit notification to multiple users in a gym (e.g., for announcements)
   */
  emitToUsers(
    gymId: number,
    userIds: number[],
    notification: Notification,
  ) {
    userIds.forEach((userId) => {
      this.emitToUser(gymId, userId, notification);
    });
  }

  /**
   * Emit to all connected users in a gym
   */
  emitToGym(gymId: number, notification: Notification) {
    this.server.to(`gym:${gymId}`).emit('notification', notification);
    this.logger.debug(`Notification broadcast to gym ${gymId}`);
  }

  /**
   * Emit to all connected users in a branch
   */
  emitToBranch(
    gymId: number,
    branchId: number,
    notification: Notification,
  ) {
    this.server
      .to(`branch:${gymId}:${branchId}`)
      .emit('notification', notification);
    this.logger.debug(
      `Notification broadcast to branch ${branchId} in gym ${gymId}`,
    );
  }

  /**
   * Emit to all superadmins
   */
  emitToAllSuperadmins(notification: Notification) {
    this.server.to('superadmin').emit('notification', notification);
    this.logger.debug('System notification broadcast to all superadmins');
  }

  /**
   * Emit user:changed event to all connected users in a gym
   */
  emitUserChanged(gymId: number, payload: { action: string }) {
    this.server.to(`gym:${gymId}`).emit('user:changed', payload);
    this.logger.debug(
      `user:changed event emitted to gym ${gymId} (action: ${payload.action})`,
    );
  }

  /**
   * Emit branch:changed event to all connected users in a gym
   */
  emitBranchChanged(gymId: number, payload: { action: string }) {
    this.server.to(`gym:${gymId}`).emit('branch:changed', payload);
    this.logger.debug(
      `branch:changed event emitted to gym ${gymId} (action: ${payload.action})`,
    );
  }

  /**
   * Emit membership:changed event to all connected users in a gym
   */
  emitMembershipChanged(gymId: number, payload: { action: string }) {
    this.server.to(`gym:${gymId}`).emit('membership:changed', payload);
    this.logger.debug(
      `membership:changed event emitted to gym ${gymId} (action: ${payload.action})`,
    );
  }

  /**
   * Emit attendance:changed event to all connected users in a gym
   */
  emitAttendanceChanged(gymId: number, payload: { action: string }) {
    this.server.to(`gym:${gymId}`).emit('attendance:changed', payload);
    this.logger.debug(
      `attendance:changed event emitted to gym ${gymId} (action: ${payload.action})`,
    );
  }

  /**
   * Emit plan:changed event to all connected users in a gym
   */
  emitPlanChanged(gymId: number, payload: { action: string }) {
    this.server.to(`gym:${gymId}`).emit('plan:changed', payload);
    this.logger.debug(
      `plan:changed event emitted to gym ${gymId} (action: ${payload.action})`,
    );
  }

  /**
   * Emit offer:changed event to all connected users in a gym
   */
  emitOfferChanged(gymId: number, payload: { action: string }) {
    this.server.to(`gym:${gymId}`).emit('offer:changed', payload);
    this.logger.debug(
      `offer:changed event emitted to gym ${gymId} (action: ${payload.action})`,
    );
  }

  /**
   * Emit announcement:changed event to all connected users in a gym
   */
  emitAnnouncementChanged(gymId: number, payload: { action: string }) {
    this.server.to(`gym:${gymId}`).emit('announcement:changed', payload);
    this.logger.debug(
      `announcement:changed event emitted to gym ${gymId} (action: ${payload.action})`,
    );
  }

  /**
   * Emit salary:changed event to all connected users in a gym
   */
  emitSalaryChanged(gymId: number, payload: { action: string }) {
    this.server.to(`gym:${gymId}`).emit('salary:changed', payload);
    this.logger.debug(
      `salary:changed event emitted to gym ${gymId} (action: ${payload.action})`,
    );
  }

  /**
   * Emit diet:changed event to all connected users in a gym
   */
  emitDietChanged(gymId: number, payload: { action: string }) {
    this.server.to(`gym:${gymId}`).emit('diet:changed', payload);
    this.logger.debug(
      `diet:changed event emitted to gym ${gymId} (action: ${payload.action})`,
    );
  }

  /**
   * Emit payment:changed event to all connected users in a gym
   */
  emitPaymentChanged(gymId: number, payload: { action: string }) {
    this.server.to(`gym:${gymId}`).emit('payment:changed', payload);
    this.logger.debug(
      `payment:changed event emitted to gym ${gymId} (action: ${payload.action})`,
    );
  }

  /**
   * Emit support:changed event to all connected users in a gym
   */
  emitSupportChanged(gymId: number, payload: { action: string }) {
    this.server.to(`gym:${gymId}`).emit('support:changed', payload);
    this.logger.debug(
      `support:changed event emitted to gym ${gymId} (action: ${payload.action})`,
    );
  }

  /**
   * Emit gym:changed event to all connected users in a gym
   */
  emitGymChanged(gymId: number, payload: { action: string }) {
    this.server.to(`gym:${gymId}`).emit('gym:changed', payload);
    this.logger.debug(
      `gym:changed event emitted to gym ${gymId} (action: ${payload.action})`,
    );
  }

  /**
   * Emit facility:changed event to all connected users in a gym
   */
  emitFacilityChanged(gymId: number, payload: { action: string }) {
    this.server.to(`gym:${gymId}`).emit('facility:changed', payload);
    this.logger.debug(
      `facility:changed event emitted to gym ${gymId} (action: ${payload.action})`,
    );
  }

  /**
   * Emit amenity:changed event to all connected users in a gym
   */
  emitAmenityChanged(gymId: number, payload: { action: string }) {
    this.server.to(`gym:${gymId}`).emit('amenity:changed', payload);
    this.logger.debug(
      `amenity:changed event emitted to gym ${gymId} (action: ${payload.action})`,
    );
  }

  /**
   * Emit body-metrics:changed event to all connected users in a gym
   */
  emitBodyMetricsChanged(gymId: number, payload: { action: string }) {
    this.server.to(`gym:${gymId}`).emit('body-metrics:changed', payload);
    this.logger.debug(
      `body-metrics:changed event emitted to gym ${gymId} (action: ${payload.action})`,
    );
  }

  /**
   * Emit permission:changed event to all connected users in a gym
   */
  emitPermissionChanged(gymId: number, payload: { action: string }) {
    this.server.to(`gym:${gymId}`).emit('permission:changed', payload);
    this.logger.debug(
      `permission:changed event emitted to gym ${gymId} (action: ${payload.action})`,
    );
  }

  /**
   * Emit permission:changed event to all superadmins
   */
  emitPermissionChangedGlobal(payload: { action: string }) {
    this.server.to('superadmin').emit('permission:changed', payload);
    this.logger.debug(
      `permission:changed event emitted to all superadmins (action: ${payload.action})`,
    );
  }

  /**
   * Emit saas-subscription:changed event to all superadmins
   */
  emitSaasSubscriptionChanged(payload: { action: string }) {
    this.server.to('superadmin').emit('saas-subscription:changed', payload);
    this.logger.debug(
      `saas-subscription:changed event emitted to superadmins (action: ${payload.action})`,
    );
  }

  /**
   * Emit contact-request:changed event to all superadmins
   */
  emitContactRequestChanged(payload: { action: string }) {
    this.server.to('superadmin').emit('contact-request:changed', payload);
    this.logger.debug(
      `contact-request:changed event emitted to superadmins (action: ${payload.action})`,
    );
  }

  /**
   * Emit lookup:changed event to all superadmins
   */
  emitLookupChanged(payload: { action: string }) {
    this.server.to('superadmin').emit('lookup:changed', payload);
    this.logger.debug(
      `lookup:changed event emitted to superadmins (action: ${payload.action})`,
    );
  }

  /**
   * Get connection stats
   */
  getConnectionStats() {
    const stats = {
      totalConnections: this.socketData.size,
      uniqueUsers: this.userSockets.size,
    };
    return stats;
  }
}
