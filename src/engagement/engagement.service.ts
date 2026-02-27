import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import {
  EngagementFiltersDto,
  AcknowledgeAlertDto,
  AlertFiltersDto,
} from './dto/engagement.dto';
import { SqlValue } from '../common/types';

@Injectable()
export class EngagementService {
  private readonly logger = new Logger(EngagementService.name);

  constructor(private readonly tenantService: TenantService) {}

  // ─── Format Helpers ───

  private formatScore(row: Record<string, any>) {
    return {
      id: row.id,
      branchId: row.branch_id,
      userId: row.user_id,
      userName: row.user_name,
      userEmail: row.user_email,
      userAvatar: row.user_avatar,
      overallScore: parseFloat(row.overall_score),
      riskLevel: row.risk_level,
      visitFrequencyScore: parseFloat(row.visit_frequency_score),
      visitRecencyScore: parseFloat(row.visit_recency_score),
      attendanceTrendScore: parseFloat(row.attendance_trend_score),
      paymentReliabilityScore: parseFloat(row.payment_reliability_score),
      membershipTenureScore: parseFloat(row.membership_tenure_score),
      engagementDepthScore: parseFloat(row.engagement_depth_score),
      factors: row.factors,
      isCurrent: row.is_current,
      calculatedAt: row.calculated_at,
      createdAt: row.created_at,
    };
  }

  private formatAlert(row: Record<string, any>) {
    return {
      id: row.id,
      branchId: row.branch_id,
      userId: row.user_id,
      userName: row.user_name,
      userEmail: row.user_email,
      riskLevel: row.risk_level,
      previousRiskLevel: row.previous_risk_level,
      alertType: row.alert_type,
      message: row.message,
      factors: row.factors,
      isAcknowledged: row.is_acknowledged,
      acknowledgedBy: row.acknowledged_by,
      acknowledgedAt: row.acknowledged_at,
      actionTaken: row.action_taken,
      createdAt: row.created_at,
    };
  }

  // ─── Public Methods ───

  async getScores(
    gymId: number,
    branchId: number | null,
    filters: EngagementFiltersDto = {},
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 15;
    const offset = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['es.is_current = TRUE'];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (branchId !== null) {
        conditions.push(`(es.branch_id = $${paramIndex} OR es.branch_id IS NULL)`);
        values.push(branchId);
        paramIndex++;
      }

      if (filters.riskLevel) {
        conditions.push(`es.risk_level = $${paramIndex++}`);
        values.push(filters.riskLevel);
      }

      if (filters.branchId) {
        conditions.push(`es.branch_id = $${paramIndex++}`);
        values.push(filters.branchId);
      }

      const whereClause = conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

      const countResult = await client.query(
        `SELECT COUNT(*) FROM engagement_scores es ${whereClause}`,
        values,
      );
      const total = parseInt(countResult.rows[0].count);

      const result = await client.query(
        `SELECT es.*,
                u.name AS user_name,
                u.email AS user_email,
                u.avatar AS user_avatar
         FROM engagement_scores es
         LEFT JOIN users u ON u.id = es.user_id
         ${whereClause}
         ORDER BY es.overall_score ASC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, offset],
      );

      return {
        data: result.rows.map((row) => this.formatScore(row)),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    });
  }

  async getScoreByUser(userId: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT es.*,
                u.name AS user_name,
                u.email AS user_email,
                u.avatar AS user_avatar
         FROM engagement_scores es
         LEFT JOIN users u ON u.id = es.user_id
         WHERE es.user_id = $1 AND es.is_current = TRUE
         LIMIT 1`,
        [userId],
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.formatScore(result.rows[0]);
    });
  }

  async getScoreHistory(userId: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT es.*,
                u.name AS user_name,
                u.email AS user_email,
                u.avatar AS user_avatar
         FROM engagement_scores es
         LEFT JOIN users u ON u.id = es.user_id
         WHERE es.user_id = $1
         ORDER BY es.calculated_at ASC`,
        [userId],
      );

      return result.rows.map((row) => this.formatScore(row));
    });
  }

  async calculateForUser(userId: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      return this.calculateForUserWithClient(client, userId, gymId);
    });
  }

  private async calculateForUserWithClient(client: any, userId: number, gymId: number) {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get user info including branch
    const userResult = await client.query(
      `SELECT id, branch_id, join_date FROM users WHERE id = $1 AND is_deleted = FALSE`,
      [userId],
    );

    if (userResult.rows.length === 0) {
      this.logger.warn(`User ${userId} not found or deleted in gym ${gymId}`);
      return null;
    }

    const user = userResult.rows[0];
    const userBranchId = user.branch_id;

    // ─── Query Attendance Data ───
    const attendanceResult = await client.query(
      `SELECT
         COUNT(*) FILTER (WHERE check_in_time >= $2) AS visits_7d,
         COUNT(*) FILTER (WHERE check_in_time >= $3) AS visits_30d,
         MAX(check_in_time) AS last_visit,
         COUNT(*) AS total_visits
       FROM attendance_history
       WHERE user_id = $1`,
      [userId, sevenDaysAgo.toISOString(), thirtyDaysAgo.toISOString()],
    );

    const attendance = attendanceResult.rows[0];
    const visits7d = parseInt(attendance.visits_7d) || 0;
    const visits30d = parseInt(attendance.visits_30d) || 0;
    const lastVisit = attendance.last_visit ? new Date(attendance.last_visit) : null;
    const totalVisits = parseInt(attendance.total_visits) || 0;

    // Previous 30-day window for trend comparison
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const prevPeriodResult = await client.query(
      `SELECT COUNT(*) AS visits_prev_30d
       FROM attendance_history
       WHERE user_id = $1
         AND check_in_time >= $2
         AND check_in_time < $3`,
      [userId, sixtyDaysAgo.toISOString(), thirtyDaysAgo.toISOString()],
    );
    const visitsPrev30d = parseInt(prevPeriodResult.rows[0].visits_prev_30d) || 0;

    // ─── Query Membership Data ───
    const membershipResult = await client.query(
      `SELECT
         MIN(start_date) AS earliest_start,
         COUNT(*) FILTER (WHERE payment_status = 'failed' OR payment_status = 'overdue') AS payment_failures,
         COUNT(*) AS total_memberships
       FROM memberships
       WHERE user_id = $1`,
      [userId],
    );

    const membership = membershipResult.rows[0];
    const earliestStart = membership.earliest_start ? new Date(membership.earliest_start) : null;
    const paymentFailures = parseInt(membership.payment_failures) || 0;
    const totalMemberships = parseInt(membership.total_memberships) || 0;

    // ─── Query Engagement Depth Data ───
    const classBookingsResult = await client.query(
      `SELECT COUNT(*) AS class_bookings_30d
       FROM class_bookings
       WHERE user_id = $1 AND booked_at >= $2`,
      [userId, thirtyDaysAgo.toISOString()],
    );
    const classBookings30d = parseInt(classBookingsResult.rows[0].class_bookings_30d) || 0;

    const appointmentsResult = await client.query(
      `SELECT COUNT(*) AS appointments_30d
       FROM appointments
       WHERE user_id = $1 AND start_time >= $2`,
      [userId, thirtyDaysAgo.toISOString()],
    );
    const appointments30d = parseInt(appointmentsResult.rows[0].appointments_30d) || 0;

    // ─── Calculate Component Scores ───
    const visitFrequencyScore = this.calculateVisitFrequencyScore(visits7d, visits30d);
    const visitRecencyScore = this.calculateVisitRecencyScore(lastVisit, now);
    const attendanceTrendScore = this.calculateAttendanceTrendScore(visits30d, visitsPrev30d);
    const paymentReliabilityScore = this.calculatePaymentReliabilityScore(paymentFailures, totalMemberships);
    const membershipTenureScore = this.calculateMembershipTenureScore(earliestStart, now);
    const engagementDepthScore = this.calculateEngagementDepthScore(classBookings30d, appointments30d, totalVisits);

    // ─── Calculate Overall Score ───
    // Weights: frequency 30%, recency 25%, trend 15%, payment 15%, tenure 10%, depth 5%
    const overallScore = Math.round(
      (visitFrequencyScore * 0.30 +
        visitRecencyScore * 0.25 +
        attendanceTrendScore * 0.15 +
        paymentReliabilityScore * 0.15 +
        membershipTenureScore * 0.10 +
        engagementDepthScore * 0.05) * 100,
    ) / 100;

    // ─── Determine Risk Level ───
    let riskLevel: string;
    if (overallScore >= 80) {
      riskLevel = 'low';
    } else if (overallScore >= 60) {
      riskLevel = 'medium';
    } else if (overallScore >= 40) {
      riskLevel = 'high';
    } else {
      riskLevel = 'critical';
    }

    // Build factors JSON for context
    const factors = {
      visits7d,
      visits30d,
      visitsPrev30d,
      lastVisit: lastVisit ? lastVisit.toISOString() : null,
      totalVisits,
      paymentFailures,
      totalMemberships,
      classBookings30d,
      appointments30d,
      tenureMonths: earliestStart
        ? Math.floor((now.getTime() - earliestStart.getTime()) / (30 * 24 * 60 * 60 * 1000))
        : 0,
    };

    // ─── Get Previous Risk Level ───
    const previousScoreResult = await client.query(
      `SELECT risk_level FROM engagement_scores
       WHERE user_id = $1 AND is_current = TRUE
       LIMIT 1`,
      [userId],
    );
    const previousRiskLevel = previousScoreResult.rows.length > 0
      ? previousScoreResult.rows[0].risk_level
      : null;

    // ─── Mark Previous Scores as Not Current ───
    await client.query(
      `UPDATE engagement_scores SET is_current = FALSE WHERE user_id = $1 AND is_current = TRUE`,
      [userId],
    );

    // ─── Insert New Score Record ───
    const insertResult = await client.query(
      `INSERT INTO engagement_scores (
         branch_id, user_id, overall_score, risk_level,
         visit_frequency_score, visit_recency_score, attendance_trend_score,
         payment_reliability_score, membership_tenure_score, engagement_depth_score,
         factors, is_current, calculated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE, CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        userBranchId,
        userId,
        overallScore,
        riskLevel,
        visitFrequencyScore,
        visitRecencyScore,
        attendanceTrendScore,
        paymentReliabilityScore,
        membershipTenureScore,
        engagementDepthScore,
        JSON.stringify(factors),
      ],
    );

    // ─── Create Churn Alert if Risk Increased to High/Critical ───
    const riskOrder = { low: 0, medium: 1, high: 2, critical: 3 };
    const currentRiskOrder = riskOrder[riskLevel as keyof typeof riskOrder] ?? 0;
    const previousRiskOrder = previousRiskLevel
      ? (riskOrder[previousRiskLevel as keyof typeof riskOrder] ?? 0)
      : 0;

    if (
      (riskLevel === 'high' || riskLevel === 'critical') &&
      currentRiskOrder > previousRiskOrder
    ) {
      const alertType = riskLevel === 'critical' ? 'critical_churn_risk' : 'high_churn_risk';
      const message = riskLevel === 'critical'
        ? `Member is at critical risk of churning. Engagement score dropped to ${overallScore}. Immediate action recommended.`
        : `Member is at high risk of churning. Engagement score dropped to ${overallScore}. Follow-up recommended.`;

      await client.query(
        `INSERT INTO churn_alerts (
           branch_id, user_id, risk_level, previous_risk_level,
           alert_type, message, factors
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          userBranchId,
          userId,
          riskLevel,
          previousRiskLevel,
          alertType,
          message,
          JSON.stringify(factors),
        ],
      );
    }

    return this.formatScore(insertResult.rows[0]);
  }

  async calculateForAllMembers(gymId: number) {
    const BATCH_SIZE = 100;
    let offset = 0;
    let totalMembers = 0;
    let calculated = 0;
    let errors = 0;

    // Process users in batches of 100, each batch shares one DB connection
    while (true) {
      const result = await this.tenantService.executeInTenant(gymId, async (client) => {
        const usersResult = await client.query(
          `SELECT id FROM users WHERE role = 'client' AND is_deleted = FALSE ORDER BY id LIMIT $1 OFFSET $2`,
          [BATCH_SIZE, offset],
        );

        const userIds: number[] = usersResult.rows.map((row: any) => row.id);
        let batchCalculated = 0;
        let batchErrors = 0;

        for (const userId of userIds) {
          try {
            await this.calculateForUserWithClient(client, userId, gymId);
            batchCalculated++;
          } catch (error) {
            batchErrors++;
            this.logger.error(
              `Failed to calculate engagement score for user ${userId} in gym ${gymId}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }

        return { count: userIds.length, batchCalculated, batchErrors };
      });

      totalMembers += result.count;
      calculated += result.batchCalculated;
      errors += result.batchErrors;

      if (result.count < BATCH_SIZE) break;
      offset += BATCH_SIZE;
    }

    if (totalMembers > 0) {
      this.logger.log(`Calculating engagement scores for ${totalMembers} members in gym ${gymId}`);
    }

    return { totalMembers, calculated, errors };
  }

  async getAlerts(
    gymId: number,
    branchId: number | null,
    filters: AlertFiltersDto = {},
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 15;
    const offset = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['ca.is_deleted = FALSE'];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (branchId !== null) {
        conditions.push(`(ca.branch_id = $${paramIndex} OR ca.branch_id IS NULL)`);
        values.push(branchId);
        paramIndex++;
      }

      if (filters.riskLevel) {
        conditions.push(`ca.risk_level = $${paramIndex++}`);
        values.push(filters.riskLevel);
      }

      if (filters.isAcknowledged !== undefined) {
        conditions.push(`ca.is_acknowledged = $${paramIndex++}`);
        values.push(filters.isAcknowledged);
      }

      const whereClause = conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

      const countResult = await client.query(
        `SELECT COUNT(*) FROM churn_alerts ca ${whereClause}`,
        values,
      );
      const total = parseInt(countResult.rows[0].count);

      const result = await client.query(
        `SELECT ca.*,
                u.name AS user_name,
                u.email AS user_email
         FROM churn_alerts ca
         LEFT JOIN users u ON u.id = ca.user_id
         ${whereClause}
         ORDER BY ca.created_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, offset],
      );

      return {
        data: result.rows.map((row) => this.formatAlert(row)),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      };
    });
  }

  async acknowledgeAlert(
    id: number,
    gymId: number,
    userId: number,
    dto: AcknowledgeAlertDto,
  ) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `UPDATE churn_alerts
         SET is_acknowledged = TRUE,
             acknowledged_by = $2,
             acknowledged_at = CURRENT_TIMESTAMP,
             action_taken = COALESCE($3, action_taken)
         WHERE id = $1 AND is_deleted = FALSE
         RETURNING *`,
        [id, userId, dto.actionTaken || null],
      );

      if (result.rows.length === 0) {
        throw new NotFoundException(`Alert with id ${id} not found`);
      }

      return this.formatAlert(result.rows[0]);
    });
  }

  async getDashboard(gymId: number, branchId: number | null) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['es.is_current = TRUE'];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (branchId !== null) {
        conditions.push(`(es.branch_id = $${paramIndex} OR es.branch_id IS NULL)`);
        values.push(branchId);
        paramIndex++;
      }

      const whereClause = conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : '';

      // Risk distribution counts
      const distributionResult = await client.query(
        `SELECT
           es.risk_level,
           COUNT(*) AS count
         FROM engagement_scores es
         ${whereClause}
         GROUP BY es.risk_level`,
        values,
      );

      const riskDistribution: Record<string, number> = {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      };
      for (const row of distributionResult.rows) {
        riskDistribution[row.risk_level] = parseInt(row.count);
      }

      // Average score and totals
      const statsResult = await client.query(
        `SELECT
           COALESCE(AVG(es.overall_score), 0) AS avg_score,
           COUNT(*) AS total_scored,
           COUNT(*) FILTER (WHERE es.risk_level IN ('high', 'critical')) AS total_at_risk
         FROM engagement_scores es
         ${whereClause}`,
        values,
      );

      const stats = statsResult.rows[0];

      return {
        riskDistribution,
        averageScore: Math.round(parseFloat(stats.avg_score) * 100) / 100,
        totalScored: parseInt(stats.total_scored),
        totalAtRisk: parseInt(stats.total_at_risk),
      };
    });
  }

  // ─── Private Score Calculation Helpers ───

  /**
   * Visit Frequency Score (0-100)
   * Based on visits in the last 7 and 30 days.
   * Ideal: 3+ visits/week = 100, 0 visits in 30d = 0
   */
  private calculateVisitFrequencyScore(visits7d: number, visits30d: number): number {
    // Weekly frequency component (70% weight within this score)
    const weeklyScore = Math.min((visits7d / 3) * 100, 100);

    // Monthly frequency component (30% weight within this score)
    const monthlyScore = Math.min((visits30d / 12) * 100, 100);

    return Math.round((weeklyScore * 0.7 + monthlyScore * 0.3) * 100) / 100;
  }

  /**
   * Visit Recency Score (0-100)
   * Based on days since last visit.
   * Same day = 100, 1 day = 95, 3 days = 80, 7 days = 50, 14 days = 20, 30+ days = 0
   */
  private calculateVisitRecencyScore(lastVisit: Date | null, now: Date): number {
    if (!lastVisit) return 0;

    const daysSinceLastVisit = (now.getTime() - lastVisit.getTime()) / (24 * 60 * 60 * 1000);

    if (daysSinceLastVisit <= 0) return 100;
    if (daysSinceLastVisit <= 1) return 95;
    if (daysSinceLastVisit <= 3) return 80;
    if (daysSinceLastVisit <= 7) return 50;
    if (daysSinceLastVisit <= 14) return 20;
    if (daysSinceLastVisit <= 30) return Math.max(0, Math.round(20 - (daysSinceLastVisit - 14) * 1.25));

    return 0;
  }

  /**
   * Attendance Trend Score (0-100)
   * Compares current 30-day period to previous 30-day period.
   * Improvement = high score, decline = low score, stable = moderate.
   */
  private calculateAttendanceTrendScore(visits30d: number, visitsPrev30d: number): number {
    if (visitsPrev30d === 0 && visits30d === 0) return 50; // No data - neutral
    if (visitsPrev30d === 0 && visits30d > 0) return 90; // New member with activity

    const changeRatio = visitsPrev30d > 0
      ? (visits30d - visitsPrev30d) / visitsPrev30d
      : 0;

    // Map ratio to score: +50% or more = 100, 0% = 60, -50% = 20, -100% = 0
    const score = Math.round(60 + changeRatio * 80);
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Payment Reliability Score (0-100)
   * Based on ratio of payment failures to total memberships.
   * No failures = 100, all failed = 0
   */
  private calculatePaymentReliabilityScore(paymentFailures: number, totalMemberships: number): number {
    if (totalMemberships === 0) return 50; // No memberships - neutral

    const failureRatio = paymentFailures / totalMemberships;
    const score = Math.round((1 - failureRatio) * 100);
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Membership Tenure Score (0-100)
   * Longer tenure = higher score. Rewards loyalty.
   * 0 months = 20, 3 months = 50, 6 months = 70, 12 months = 85, 24+ months = 100
   */
  private calculateMembershipTenureScore(earliestStart: Date | null, now: Date): number {
    if (!earliestStart) return 0;

    const tenureMonths = (now.getTime() - earliestStart.getTime()) / (30 * 24 * 60 * 60 * 1000);

    if (tenureMonths <= 0) return 20;
    if (tenureMonths <= 3) return Math.round(20 + (tenureMonths / 3) * 30);
    if (tenureMonths <= 6) return Math.round(50 + ((tenureMonths - 3) / 3) * 20);
    if (tenureMonths <= 12) return Math.round(70 + ((tenureMonths - 6) / 6) * 15);
    if (tenureMonths <= 24) return Math.round(85 + ((tenureMonths - 12) / 12) * 15);

    return 100;
  }

  /**
   * Engagement Depth Score (0-100)
   * Based on variety of engagement: class bookings, appointments, visits.
   * Multi-faceted engagement = higher score.
   */
  private calculateEngagementDepthScore(
    classBookings30d: number,
    appointments30d: number,
    totalVisits: number,
  ): number {
    let score = 0;

    // Class participation (up to 40 points)
    score += Math.min(classBookings30d * 10, 40);

    // Appointments / PT sessions (up to 30 points)
    score += Math.min(appointments30d * 15, 30);

    // Regular attendance breadth (up to 30 points)
    score += Math.min(totalVisits * 2, 30);

    return Math.min(100, score);
  }
}
