import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import {
  CreateChallengeDto,
  UpdateChallengeDto,
  ChallengeFiltersDto,
  CreateAchievementDto,
  UpdateAchievementDto,
} from './dto/gamification.dto';
import { SqlValue } from '../common/types';

@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name);

  constructor(private readonly tenantService: TenantService) {}

  // ─── Format Helpers ───

  private formatChallenge(row: Record<string, any>) {
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      type: row.type,
      metric: row.metric,
      goalValue: row.goal_value,
      goalDirection: row.goal_direction,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
      maxParticipants: row.max_participants,
      participantCount: row.participant_count,
      pointsReward: row.points_reward,
      badgeName: row.badge_name,
      badgeIcon: row.badge_icon,
      rules: row.rules,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private formatAchievement(row: Record<string, any>) {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      icon: row.icon,
      category: row.category,
      criteria: row.criteria,
      pointsValue: row.points_value,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private formatStreak(row: Record<string, any>) {
    return {
      id: row.id,
      userId: row.user_id,
      streakType: row.streak_type,
      currentCount: row.current_count,
      longestCount: row.longest_count,
      lastActivityDate: row.last_activity_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ─── Challenges ───

  async findAllChallenges(
    gymId: number,
    branchId: number | null = null,
    filters: ChallengeFiltersDto = {},
  ) {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['c.is_deleted = FALSE'];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (branchId !== null) {
        conditions.push(
          `(c.branch_id = $${paramIndex++} OR c.branch_id IS NULL)`,
        );
        values.push(branchId);
      }

      if (filters.status) {
        conditions.push(`c.status = $${paramIndex++}`);
        values.push(filters.status);
      }

      if (filters.type) {
        conditions.push(`c.type = $${paramIndex++}`);
        values.push(filters.type);
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const countResult = await client.query(
        `SELECT COUNT(*) FROM challenges c ${whereClause}`,
        values,
      );
      const total = parseInt(countResult.rows[0].count);

      const result = await client.query(
        `SELECT c.*,
                (SELECT COUNT(*) FROM challenge_participants cp WHERE cp.challenge_id = c.id) AS participant_count
         FROM challenges c
         ${whereClause}
         ORDER BY c.created_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...values, limit, skip],
      );

      return {
        data: result.rows.map((row) => this.formatChallenge(row)),
        total,
        page,
        limit,
      };
    });
  }

  async findOneChallenge(id: number, gymId: number) {
    const challenge = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT c.*,
                  (SELECT COUNT(*) FROM challenge_participants cp WHERE cp.challenge_id = c.id) AS participant_count
           FROM challenges c
           WHERE c.id = $1 AND c.is_deleted = FALSE`,
          [id],
        );
        return result.rows[0];
      },
    );

    if (!challenge) {
      throw new NotFoundException(`Challenge #${id} not found`);
    }

    return this.formatChallenge(challenge);
  }

  async createChallenge(
    dto: CreateChallengeDto,
    gymId: number,
    branchId: number | null,
    userId: number,
  ) {
    const challenge = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `INSERT INTO challenges
             (branch_id, title, description, type, metric, goal_value, goal_direction,
              start_date, end_date, status, max_participants, points_reward,
              badge_name, badge_icon, rules, created_by, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'upcoming', $10, $11, $12, $13, $14, $15, NOW(), NOW())
           RETURNING *`,
          [
            branchId,
            dto.title,
            dto.description || null,
            dto.type,
            dto.metric || null,
            dto.goalValue || null,
            dto.goalDirection || null,
            dto.startDate,
            dto.endDate,
            dto.maxParticipants || null,
            dto.pointsReward || null,
            dto.badgeName || null,
            dto.badgeIcon || null,
            dto.rules || null,
            userId,
          ],
        );
        return result.rows[0];
      },
    );

    return this.formatChallenge(challenge);
  }

  async updateChallenge(
    id: number,
    gymId: number,
    dto: UpdateChallengeDto,
  ) {
    await this.findOneChallenge(id, gymId);

    const updates: string[] = [];
    const values: SqlValue[] = [];
    let paramIndex = 1;

    if (dto.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      values.push(dto.title);
    }
    if (dto.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(dto.description);
    }
    if (dto.type !== undefined) {
      updates.push(`type = $${paramIndex++}`);
      values.push(dto.type);
    }
    if (dto.metric !== undefined) {
      updates.push(`metric = $${paramIndex++}`);
      values.push(dto.metric);
    }
    if (dto.goalValue !== undefined) {
      updates.push(`goal_value = $${paramIndex++}`);
      values.push(dto.goalValue);
    }
    if (dto.goalDirection !== undefined) {
      updates.push(`goal_direction = $${paramIndex++}`);
      values.push(dto.goalDirection);
    }
    if (dto.startDate !== undefined) {
      updates.push(`start_date = $${paramIndex++}`);
      values.push(dto.startDate);
    }
    if (dto.endDate !== undefined) {
      updates.push(`end_date = $${paramIndex++}`);
      values.push(dto.endDate);
    }
    if (dto.maxParticipants !== undefined) {
      updates.push(`max_participants = $${paramIndex++}`);
      values.push(dto.maxParticipants);
    }
    if (dto.pointsReward !== undefined) {
      updates.push(`points_reward = $${paramIndex++}`);
      values.push(dto.pointsReward);
    }
    if (dto.badgeName !== undefined) {
      updates.push(`badge_name = $${paramIndex++}`);
      values.push(dto.badgeName);
    }
    if (dto.badgeIcon !== undefined) {
      updates.push(`badge_icon = $${paramIndex++}`);
      values.push(dto.badgeIcon);
    }
    if (dto.rules !== undefined) {
      updates.push(`rules = $${paramIndex++}`);
      values.push(dto.rules);
    }

    if (updates.length === 0) return this.findOneChallenge(id, gymId);

    updates.push(`updated_at = NOW()`);
    values.push(id);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE challenges SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values,
      );
    });

    return this.findOneChallenge(id, gymId);
  }

  async softDeleteChallenge(id: number, gymId: number) {
    await this.findOneChallenge(id, gymId);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE challenges SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [id],
      );
    });

    return { message: 'Challenge deleted successfully' };
  }

  async joinChallenge(challengeId: number, userId: number, gymId: number) {
    await this.findOneChallenge(challengeId, gymId);

    return this.tenantService.executeInTenant(gymId, async (client) => {
      // Check if already joined
      const existing = await client.query(
        `SELECT id FROM challenge_participants WHERE challenge_id = $1 AND user_id = $2`,
        [challengeId, userId],
      );

      if (existing.rows.length > 0) {
        return { message: 'Already joined this challenge' };
      }

      // Check max participants
      const challenge = await client.query(
        `SELECT max_participants,
                (SELECT COUNT(*) FROM challenge_participants WHERE challenge_id = $1) AS current_count
         FROM challenges WHERE id = $1`,
        [challengeId],
      );

      const row = challenge.rows[0];
      if (
        row.max_participants &&
        parseInt(row.current_count) >= row.max_participants
      ) {
        return { message: 'Challenge is full' };
      }

      await client.query(
        `INSERT INTO challenge_participants (challenge_id, user_id, current_value, progress_pct, rank, joined_at)
         VALUES ($1, $2, 0, 0, 0, NOW())`,
        [challengeId, userId],
      );

      return { message: 'Successfully joined the challenge' };
    });
  }

  async getLeaderboard(challengeId: number, gymId: number) {
    await this.findOneChallenge(challengeId, gymId);

    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT cp.*, u.name AS user_name
         FROM challenge_participants cp
         LEFT JOIN users u ON u.id = cp.user_id
         WHERE cp.challenge_id = $1
         ORDER BY cp.progress_pct DESC, cp.joined_at ASC`,
        [challengeId],
      );

      return result.rows.map((row, index) => ({
        rank: index + 1,
        userId: row.user_id,
        userName: row.user_name,
        currentValue: row.current_value,
        progressPct: row.progress_pct,
        joinedAt: row.joined_at,
      }));
    });
  }

  // ─── Achievements ───

  async findAllAchievements(gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT * FROM achievements WHERE is_deleted = FALSE ORDER BY category, name`,
      );
      return result.rows.map((row) => this.formatAchievement(row));
    });
  }

  async createAchievement(dto: CreateAchievementDto, gymId: number) {
    const achievement = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `INSERT INTO achievements (name, description, icon, category, criteria, points_value, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
           RETURNING *`,
          [
            dto.name,
            dto.description || null,
            dto.icon || null,
            dto.category,
            dto.criteria,
            dto.pointsValue || null,
          ],
        );
        return result.rows[0];
      },
    );

    return this.formatAchievement(achievement);
  }

  async updateAchievement(
    id: number,
    gymId: number,
    dto: UpdateAchievementDto,
  ) {
    const updates: string[] = [];
    const values: SqlValue[] = [];
    let paramIndex = 1;

    if (dto.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(dto.name);
    }
    if (dto.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(dto.description);
    }
    if (dto.icon !== undefined) {
      updates.push(`icon = $${paramIndex++}`);
      values.push(dto.icon);
    }
    if (dto.category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      values.push(dto.category);
    }
    if (dto.criteria !== undefined) {
      updates.push(`criteria = $${paramIndex++}`);
      values.push(dto.criteria);
    }
    if (dto.pointsValue !== undefined) {
      updates.push(`points_value = $${paramIndex++}`);
      values.push(dto.pointsValue);
    }

    if (updates.length === 0) {
      return this.tenantService.executeInTenant(gymId, async (client) => {
        const result = await client.query(
          `SELECT * FROM achievements WHERE id = $1 AND is_deleted = FALSE`,
          [id],
        );
        if (!result.rows[0])
          throw new NotFoundException(`Achievement #${id} not found`);
        return this.formatAchievement(result.rows[0]);
      });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const achievement = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `UPDATE achievements SET ${updates.join(', ')}
           WHERE id = $${paramIndex} AND is_deleted = FALSE
           RETURNING *`,
          values,
        );
        if (!result.rows[0])
          throw new NotFoundException(`Achievement #${id} not found`);
        return result.rows[0];
      },
    );

    return this.formatAchievement(achievement);
  }

  async softDeleteAchievement(id: number, gymId: number) {
    await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `UPDATE achievements SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND is_deleted = FALSE
         RETURNING id`,
        [id],
      );
      if (!result.rows[0])
        throw new NotFoundException(`Achievement #${id} not found`);
    });

    return { message: 'Achievement deleted successfully' };
  }

  async getUserAchievements(userId: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT ua.*, a.name, a.description, a.icon, a.category, a.points_value
         FROM user_achievements ua
         JOIN achievements a ON a.id = ua.achievement_id
         WHERE ua.user_id = $1 AND a.is_deleted = FALSE
         ORDER BY ua.earned_at DESC`,
        [userId],
      );

      return result.rows.map((row) => ({
        id: row.id,
        achievementId: row.achievement_id,
        userId: row.user_id,
        name: row.name,
        description: row.description,
        icon: row.icon,
        category: row.category,
        pointsValue: row.points_value,
        earnedAt: row.earned_at,
      }));
    });
  }

  async getMyAchievements(userId: number, gymId: number) {
    return this.getUserAchievements(userId, gymId);
  }

  // ─── Streaks ───

  async getUserStreaks(userId: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT * FROM streaks WHERE user_id = $1 ORDER BY streak_type`,
        [userId],
      );
      return result.rows.map((row) => this.formatStreak(row));
    });
  }

  // ─── Attendance Event Handler ───

  async onAttendanceMarked(
    gymId: number,
    userId: number,
    branchId: number | null,
  ) {
    try {
      await this.tenantService.executeInTenant(gymId, async (client) => {
        // 1. Update daily_visit streak (INSERT ON CONFLICT)
        await client.query(
          `INSERT INTO streaks (user_id, streak_type, current_count, longest_count, last_activity_date, created_at, updated_at)
           VALUES ($1, 'daily_visit', 1, 1, CURRENT_DATE, NOW(), NOW())
           ON CONFLICT (user_id, streak_type) DO UPDATE SET
             current_count = CASE
               WHEN streaks.last_activity_date = CURRENT_DATE - INTERVAL '1 day'
                 THEN streaks.current_count + 1
               WHEN streaks.last_activity_date = CURRENT_DATE
                 THEN streaks.current_count
               ELSE 1
             END,
             longest_count = GREATEST(
               streaks.longest_count,
               CASE
                 WHEN streaks.last_activity_date = CURRENT_DATE - INTERVAL '1 day'
                   THEN streaks.current_count + 1
                 WHEN streaks.last_activity_date = CURRENT_DATE
                   THEN streaks.current_count
                 ELSE 1
               END
             ),
             last_activity_date = CURRENT_DATE,
             updated_at = NOW()`,
          [userId],
        );

        // 2. Check if any active challenges need progress update
        const activeChallenges = await client.query(
          `SELECT cp.id AS participant_id, c.id AS challenge_id, c.goal_value, c.metric
           FROM challenge_participants cp
           JOIN challenges c ON c.id = cp.challenge_id
           WHERE cp.user_id = $1
             AND c.status = 'active'
             AND c.is_deleted = FALSE
             AND (c.metric = 'attendance' OR c.metric = 'visits')`,
          [userId],
        );

        for (const cp of activeChallenges.rows) {
          const goalValue = cp.goal_value || 0;

          await client.query(
            `UPDATE challenge_participants
             SET current_value = COALESCE(current_value, 0) + 1,
                 progress_pct = CASE
                   WHEN $2 > 0 THEN LEAST(((COALESCE(current_value, 0) + 1)::DECIMAL / $2) * 100, 100)
                   ELSE 0
                 END,
                 updated_at = NOW()
             WHERE id = $1`,
            [cp.participant_id, goalValue],
          );
        }

        // 3. Check achievement criteria
        // Count total attendance for this user
        const attendanceCount = await client.query(
          `SELECT COUNT(*) AS cnt FROM attendance WHERE user_id = $1`,
          [userId],
        );
        const totalVisits = parseInt(attendanceCount.rows[0].cnt);

        // Get streak info
        const streakResult = await client.query(
          `SELECT current_count, longest_count FROM streaks
           WHERE user_id = $1 AND streak_type = 'daily_visit'`,
          [userId],
        );
        const currentStreak = streakResult.rows[0]?.current_count || 0;

        // Find achievements the user qualifies for but hasn't earned yet
        const unearned = await client.query(
          `SELECT a.* FROM achievements a
           WHERE a.is_deleted = FALSE
             AND a.id NOT IN (SELECT achievement_id FROM user_achievements WHERE user_id = $1)`,
          [userId],
        );

        for (const ach of unearned.rows) {
          let qualifies = false;

          try {
            const criteriaObj =
              typeof ach.criteria === 'string'
                ? JSON.parse(ach.criteria)
                : ach.criteria;

            if (
              criteriaObj.type === 'total_visits' &&
              totalVisits >= (criteriaObj.value || 0)
            ) {
              qualifies = true;
            } else if (
              criteriaObj.type === 'streak_days' &&
              currentStreak >= (criteriaObj.value || 0)
            ) {
              qualifies = true;
            }
          } catch {
            // criteria is not valid JSON, skip
          }

          if (qualifies) {
            await client.query(
              `INSERT INTO user_achievements (user_id, achievement_id, earned_at)
               VALUES ($1, $2, NOW())
               ON CONFLICT (user_id, achievement_id) DO NOTHING`,
              [userId, ach.id],
            );
          }
        }
      });
    } catch (error) {
      this.logger.error(
        `Error in onAttendanceMarked for gym ${gymId}, user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // ─── Summary & Stats ───

  async getMySummary(userId: number, gymId: number) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      // Total points from earned achievements
      const pointsResult = await client.query(
        `SELECT COALESCE(SUM(a.points_value), 0) AS total_points
         FROM user_achievements ua
         JOIN achievements a ON a.id = ua.achievement_id
         WHERE ua.user_id = $1`,
        [userId],
      );
      const totalPoints = parseInt(pointsResult.rows[0].total_points);

      // Active challenges count
      const challengesResult = await client.query(
        `SELECT COUNT(*) AS cnt
         FROM challenge_participants cp
         JOIN challenges c ON c.id = cp.challenge_id
         WHERE cp.user_id = $1 AND c.status = 'active' AND c.is_deleted = FALSE`,
        [userId],
      );
      const activeChallenges = parseInt(challengesResult.rows[0].cnt);

      // Current streaks
      const streaksResult = await client.query(
        `SELECT streak_type, current_count, longest_count, last_activity_date
         FROM streaks WHERE user_id = $1`,
        [userId],
      );
      const streaks = streaksResult.rows.map((row) => ({
        streakType: row.streak_type,
        currentCount: row.current_count,
        longestCount: row.longest_count,
        lastActivityDate: row.last_activity_date,
      }));

      // Badges count
      const badgesResult = await client.query(
        `SELECT COUNT(*) AS cnt FROM user_achievements WHERE user_id = $1`,
        [userId],
      );
      const badgesCount = parseInt(badgesResult.rows[0].cnt);

      return {
        totalPoints,
        activeChallenges,
        streaks,
        badgesCount,
      };
    });
  }

  async getStats(gymId: number, branchId: number | null) {
    return this.tenantService.executeInTenant(gymId, async (client) => {
      const conditions: string[] = ['c.is_deleted = FALSE'];
      const values: SqlValue[] = [];
      let paramIndex = 1;

      if (branchId !== null) {
        conditions.push(
          `(c.branch_id = $${paramIndex++} OR c.branch_id IS NULL)`,
        );
        values.push(branchId);
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Active challenges
      const activeChallengesResult = await client.query(
        `SELECT COUNT(*) AS cnt FROM challenges c ${whereClause} AND c.status = 'active'`,
        values,
      );
      const activeChallenges = parseInt(activeChallengesResult.rows[0].cnt);

      // Total participation
      const participationResult = await client.query(
        `SELECT COUNT(DISTINCT cp.user_id) AS cnt
         FROM challenge_participants cp
         JOIN challenges c ON c.id = cp.challenge_id
         ${whereClause}`,
        values,
      );
      const totalParticipants = parseInt(participationResult.rows[0].cnt);

      // Total badges earned
      const badgesResult = await client.query(
        `SELECT COUNT(*) AS cnt FROM user_achievements`,
      );
      const totalBadgesEarned = parseInt(badgesResult.rows[0].cnt);

      return {
        activeChallenges,
        totalParticipants,
        totalBadgesEarned,
      };
    });
  }
}
