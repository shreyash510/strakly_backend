import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import {
  CreateWorkoutPlanDto,
  UpdateWorkoutPlanDto,
  AssignWorkoutDto,
  UpdateWorkoutAssignmentDto,
} from './dto/workout.dto';

@Injectable()
export class WorkoutsService {
  constructor(private readonly tenantService: TenantService) {}

  /**
   * Ensure workout tables exist in the tenant schema
   */
  async ensureTablesExist(gymId: number): Promise<void> {
    await this.tenantService.executeInTenant(
      gymId,
      async (client, schemaName) => {
        // Create workout_plans table
        await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."workout_plans" (
          id SERIAL PRIMARY KEY,
          branch_id INTEGER,
          title VARCHAR(255) NOT NULL,
          type VARCHAR(50) NOT NULL,
          description TEXT,
          category VARCHAR(100) NOT NULL,
          difficulty VARCHAR(50) DEFAULT 'beginner',
          duration INTEGER DEFAULT 7,
          sessions_per_week INTEGER DEFAULT 3,
          estimated_session_duration INTEGER DEFAULT 45,
          exercises JSONB DEFAULT '[]',
          status VARCHAR(50) DEFAULT 'draft',
          created_by INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

        // Create workout_assignments table
        await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."workout_assignments" (
          id SERIAL PRIMARY KEY,
          branch_id INTEGER,
          workout_plan_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          assigned_by INTEGER NOT NULL,
          assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          status VARCHAR(50) DEFAULT 'active',
          progress_percentage INTEGER DEFAULT 0,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

        // Create indexes
        await client.query(
          `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_workout_plans_status" ON "${schemaName}"."workout_plans"(status)`,
        );
        await client.query(
          `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_workout_plans_type" ON "${schemaName}"."workout_plans"(type)`,
        );
        await client.query(
          `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_workout_plans_category" ON "${schemaName}"."workout_plans"(category)`,
        );
        await client.query(
          `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_workout_assignments_workout" ON "${schemaName}"."workout_assignments"(workout_plan_id)`,
        );
        await client.query(
          `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_workout_assignments_user" ON "${schemaName}"."workout_assignments"(user_id)`,
        );
        await client.query(
          `CREATE INDEX IF NOT EXISTS "idx_${schemaName}_workout_assignments_status" ON "${schemaName}"."workout_assignments"(status)`,
        );
      },
    );
  }

  /**
   * Find all workout plans with optional filters
   */
  async findAll(
    gymId: number,
    filters?: {
      status?: string;
      type?: string;
      category?: string;
      difficulty?: string;
      search?: string;
      page?: number;
      limit?: number;
      branchId?: number | null;
    },
  ) {
    await this.ensureTablesExist(gymId);

    const page = filters?.page || 1;
    const limit = filters?.limit || 15;
    const skip = (page - 1) * limit;

    const { workouts, total } = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let whereClause = '1=1';
        const values: any[] = [];
        let paramIndex = 1;

        // Branch filtering
        if (filters?.branchId !== undefined && filters.branchId !== null) {
          whereClause += ` AND w.branch_id = $${paramIndex++}`;
          values.push(filters.branchId);
        }

        if (filters?.status && filters.status !== 'all') {
          whereClause += ` AND w.status = $${paramIndex++}`;
          values.push(filters.status);
        }
        if (filters?.type && filters.type !== 'all') {
          whereClause += ` AND w.type = $${paramIndex++}`;
          values.push(filters.type);
        }
        if (filters?.category && filters.category !== 'all') {
          whereClause += ` AND w.category = $${paramIndex++}`;
          values.push(filters.category);
        }
        if (filters?.difficulty && filters.difficulty !== 'all') {
          whereClause += ` AND w.difficulty = $${paramIndex++}`;
          values.push(filters.difficulty);
        }
        if (filters?.search) {
          whereClause += ` AND (w.title ILIKE $${paramIndex} OR w.description ILIKE $${paramIndex})`;
          values.push(`%${filters.search}%`);
          paramIndex++;
        }

        const [workoutsResult, countResult] = await Promise.all([
          client.query(
            `SELECT w.*
           FROM workout_plans w
           WHERE ${whereClause}
           ORDER BY w.created_at DESC
           LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
            [...values, limit, skip],
          ),
          client.query(
            `SELECT COUNT(*) as count FROM workout_plans w WHERE ${whereClause}`,
            values,
          ),
        ]);

        return {
          workouts: workoutsResult.rows,
          total: parseInt(countResult.rows[0].count, 10),
        };
      },
    );

    return {
      data: workouts.map((w: any) => this.formatWorkoutPlan(w)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Find a single workout plan by ID
   */
  async findOne(id: number, gymId: number, branchId?: number | null) {
    await this.ensureTablesExist(gymId);

    const workout = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let query = `SELECT w.* FROM workout_plans w WHERE w.id = $1`;
        const values: any[] = [id];

        // Branch filtering
        if (branchId !== null && branchId !== undefined) {
          query += ` AND w.branch_id = $2`;
          values.push(branchId);
        }

        const result = await client.query(query, values);
        return result.rows[0];
      },
    );

    if (!workout) {
      throw new NotFoundException(`Workout plan with ID ${id} not found`);
    }

    return this.formatWorkoutPlan(workout);
  }

  /**
   * Create a new workout plan
   */
  async create(
    dto: CreateWorkoutPlanDto,
    gymId: number,
    userId: number,
    branchId?: number | null,
  ) {
    await this.ensureTablesExist(gymId);

    const workout = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `INSERT INTO workout_plans (branch_id, title, type, description, category, difficulty, duration, sessions_per_week, estimated_session_duration, exercises, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
         RETURNING *`,
          [
            branchId ?? null,
            dto.title,
            dto.type,
            dto.description || null,
            dto.category,
            dto.difficulty || 'beginner',
            dto.duration || 7,
            dto.sessionsPerWeek || 3,
            dto.estimatedSessionDuration || 45,
            JSON.stringify(dto.exercises || []),
            dto.status || 'draft',
            userId,
          ],
        );
        return result.rows[0];
      },
    );

    return this.formatWorkoutPlan(workout);
  }

  /**
   * Update an existing workout plan
   */
  async update(id: number, dto: UpdateWorkoutPlanDto, gymId: number) {
    await this.findOne(id, gymId); // Verify exists

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (dto.title) {
      updates.push(`title = $${paramIndex++}`);
      values.push(dto.title);
    }
    if (dto.type) {
      updates.push(`type = $${paramIndex++}`);
      values.push(dto.type);
    }
    if (dto.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      values.push(dto.description);
    }
    if (dto.category) {
      updates.push(`category = $${paramIndex++}`);
      values.push(dto.category);
    }
    if (dto.difficulty) {
      updates.push(`difficulty = $${paramIndex++}`);
      values.push(dto.difficulty);
    }
    if (dto.duration !== undefined) {
      updates.push(`duration = $${paramIndex++}`);
      values.push(dto.duration);
    }
    if (dto.sessionsPerWeek !== undefined) {
      updates.push(`sessions_per_week = $${paramIndex++}`);
      values.push(dto.sessionsPerWeek);
    }
    if (dto.estimatedSessionDuration !== undefined) {
      updates.push(`estimated_session_duration = $${paramIndex++}`);
      values.push(dto.estimatedSessionDuration);
    }
    if (dto.exercises !== undefined) {
      updates.push(`exercises = $${paramIndex++}`);
      values.push(JSON.stringify(dto.exercises));
    }
    if (dto.status) {
      updates.push(`status = $${paramIndex++}`);
      values.push(dto.status);
    }

    if (updates.length === 0) {
      return this.findOne(id, gymId);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE workout_plans SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values,
      );
    });

    return this.findOne(id, gymId);
  }

  /**
   * Delete a workout plan
   */
  async delete(id: number, gymId: number) {
    await this.findOne(id, gymId); // Verify exists

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(`DELETE FROM workout_plans WHERE id = $1`, [id]);
    });

    return { id, deleted: true };
  }

  /**
   * Assign a workout plan to a user
   */
  async assignWorkout(
    dto: AssignWorkoutDto,
    gymId: number,
    assignedBy: number,
    branchId?: number | null,
  ) {
    await this.ensureTablesExist(gymId);

    // Verify workout exists
    await this.findOne(dto.workoutPlanId, gymId);

    // Check if user already has this workout assigned (active)
    const existingAssignment = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT id FROM workout_assignments WHERE workout_plan_id = $1 AND user_id = $2 AND status = 'active'`,
          [dto.workoutPlanId, dto.userId],
        );
        return result.rows[0];
      },
    );

    if (existingAssignment) {
      throw new ConflictException(
        'User already has this workout plan assigned',
      );
    }

    // Get user and workout details for the response
    const { assignment, workout, user, assignedByUser } =
      await this.tenantService.executeInTenant(gymId, async (client) => {
        // Insert the assignment
        const assignmentResult = await client.query(
          `INSERT INTO workout_assignments (branch_id, workout_plan_id, user_id, assigned_by, assigned_at, status, progress_percentage, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), 'active', 0, $5, NOW(), NOW())
         RETURNING *`,
          [
            branchId ?? null,
            dto.workoutPlanId,
            dto.userId,
            assignedBy,
            dto.notes || null,
          ],
        );

        // Get workout details
        const workoutResult = await client.query(
          `SELECT * FROM workout_plans WHERE id = $1`,
          [dto.workoutPlanId],
        );

        // Get user details (client)
        const userResult = await client.query(
          `SELECT id, name, email FROM users WHERE id = $1`,
          [dto.userId],
        );

        // Get assigned by user from public schema
        const pool = this.tenantService.getPool();
        const assignedByResult = await pool.query(
          `SELECT id, name FROM users WHERE id = $1`,
          [assignedBy],
        );

        return {
          assignment: assignmentResult.rows[0],
          workout: workoutResult.rows[0],
          user: userResult.rows[0],
          assignedByUser: assignedByResult.rows[0],
        };
      });

    return this.formatWorkoutAssignment(
      assignment,
      workout,
      user,
      assignedByUser,
    );
  }

  /**
   * Get all assignments for a specific workout plan
   */
  async getWorkoutAssignments(
    workoutPlanId: number,
    gymId: number,
    branchId?: number | null,
  ) {
    await this.ensureTablesExist(gymId);
    await this.findOne(workoutPlanId, gymId); // Verify workout exists

    const assignments = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        let whereClause = `wa.workout_plan_id = $1 AND wa.status != 'cancelled'`;
        const values: any[] = [workoutPlanId];
        let paramIndex = 2;

        // Branch filtering
        if (branchId !== null && branchId !== undefined) {
          whereClause += ` AND wa.branch_id = $${paramIndex++}`;
          values.push(branchId);
        }

        const result = await client.query(
          `SELECT wa.*, w.title as workout_title, w.type as workout_type, w.category as workout_category,
                u.id as user_id, u.name as user_name, u.email as user_email
         FROM workout_assignments wa
         JOIN workout_plans w ON w.id = wa.workout_plan_id
         JOIN users u ON u.id = wa.user_id
         WHERE ${whereClause}
         ORDER BY wa.assigned_at DESC`,
          values,
        );
        return result.rows;
      },
    );

    // Get assigned by names from public schema
    const pool = this.tenantService.getPool();
    const assignedByIds = [
      ...new Set(assignments.map((a: any) => a.assigned_by)),
    ];

    let assignedByMap: Record<number, string> = {};
    if (assignedByIds.length > 0) {
      const result = await pool.query(
        `SELECT id, name FROM users WHERE id = ANY($1)`,
        [assignedByIds],
      );
      assignedByMap = Object.fromEntries(
        result.rows.map((u: any) => [u.id, u.name]),
      );
    }

    return assignments.map((a: any) => ({
      id: a.id,
      workoutPlanId: a.workout_plan_id,
      workoutTitle: a.workout_title,
      workoutType: a.workout_type,
      workoutCategory: a.workout_category,
      userId: a.user_id,
      userName: a.user_name,
      userEmail: a.user_email,
      assignedBy: a.assigned_by,
      assignedByName: assignedByMap[a.assigned_by] || 'Unknown',
      assignedAt: a.assigned_at,
      status: a.status,
      progressPercentage: a.progress_percentage,
      notes: a.notes,
    }));
  }

  /**
   * Get all workout assignments for a specific user
   */
  async getUserWorkoutAssignments(userId: number, gymId: number) {
    await this.ensureTablesExist(gymId);

    const assignments = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT wa.*, w.title as workout_title, w.type as workout_type, w.category as workout_category,
                w.difficulty as workout_difficulty, w.duration as workout_duration,
                u.id as user_id, u.name as user_name, u.email as user_email
         FROM workout_assignments wa
         JOIN workout_plans w ON w.id = wa.workout_plan_id
         JOIN users u ON u.id = wa.user_id
         WHERE wa.user_id = $1
         ORDER BY wa.assigned_at DESC`,
          [userId],
        );
        return result.rows;
      },
    );

    // Get assigned by names from public schema
    const pool = this.tenantService.getPool();
    const assignedByIds = [
      ...new Set(assignments.map((a: any) => a.assigned_by)),
    ];

    let assignedByMap: Record<number, string> = {};
    if (assignedByIds.length > 0) {
      const result = await pool.query(
        `SELECT id, name FROM users WHERE id = ANY($1)`,
        [assignedByIds],
      );
      assignedByMap = Object.fromEntries(
        result.rows.map((u: any) => [u.id, u.name]),
      );
    }

    return assignments.map((a: any) => ({
      id: a.id,
      workoutPlanId: a.workout_plan_id,
      workoutTitle: a.workout_title,
      workoutType: a.workout_type,
      workoutCategory: a.workout_category,
      workoutDifficulty: a.workout_difficulty,
      workoutDuration: a.workout_duration,
      userId: a.user_id,
      userName: a.user_name,
      userEmail: a.user_email,
      assignedBy: a.assigned_by,
      assignedByName: assignedByMap[a.assigned_by] || 'Unknown',
      assignedAt: a.assigned_at,
      status: a.status,
      progressPercentage: a.progress_percentage,
      notes: a.notes,
    }));
  }

  /**
   * Update a workout assignment status/progress
   */
  async updateAssignment(
    assignmentId: number,
    dto: UpdateWorkoutAssignmentDto,
    gymId: number,
  ) {
    await this.ensureTablesExist(gymId);

    const assignment = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT * FROM workout_assignments WHERE id = $1`,
          [assignmentId],
        );
        return result.rows[0];
      },
    );

    if (!assignment) {
      throw new NotFoundException(
        `Workout assignment with ID ${assignmentId} not found`,
      );
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (dto.status) {
      updates.push(`status = $${paramIndex++}`);
      values.push(dto.status);
    }
    if (dto.progressPercentage !== undefined) {
      updates.push(`progress_percentage = $${paramIndex++}`);
      values.push(dto.progressPercentage);
    }
    if (dto.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      values.push(dto.notes);
    }

    if (updates.length === 0) {
      return this.getAssignmentById(assignmentId, gymId);
    }

    updates.push(`updated_at = NOW()`);
    values.push(assignmentId);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE workout_assignments SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values,
      );
    });

    return this.getAssignmentById(assignmentId, gymId);
  }

  /**
   * Unassign (cancel) a workout assignment
   */
  async unassignWorkout(assignmentId: number, gymId: number) {
    await this.ensureTablesExist(gymId);

    const assignment = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT * FROM workout_assignments WHERE id = $1`,
          [assignmentId],
        );
        return result.rows[0];
      },
    );

    if (!assignment) {
      throw new NotFoundException(
        `Workout assignment with ID ${assignmentId} not found`,
      );
    }

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE workout_assignments SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
        [assignmentId],
      );
    });

    return { id: assignmentId, unassigned: true };
  }

  /**
   * Get a single assignment by ID
   */
  private async getAssignmentById(assignmentId: number, gymId: number) {
    const assignment = await this.tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT wa.*, w.title as workout_title, w.type as workout_type, w.category as workout_category,
                w.difficulty as workout_difficulty, w.duration as workout_duration,
                u.id as user_id, u.name as user_name, u.email as user_email
         FROM workout_assignments wa
         JOIN workout_plans w ON w.id = wa.workout_plan_id
         JOIN users u ON u.id = wa.user_id
         WHERE wa.id = $1`,
          [assignmentId],
        );
        return result.rows[0];
      },
    );

    if (!assignment) {
      throw new NotFoundException(
        `Workout assignment with ID ${assignmentId} not found`,
      );
    }

    // Get assigned by name from public schema
    const pool = this.tenantService.getPool();
    const assignedByResult = await pool.query(
      `SELECT name FROM users WHERE id = $1`,
      [assignment.assigned_by],
    );
    const assignedByName = assignedByResult.rows[0]?.name || 'Unknown';

    return {
      id: assignment.id,
      workoutPlanId: assignment.workout_plan_id,
      workoutTitle: assignment.workout_title,
      workoutType: assignment.workout_type,
      workoutCategory: assignment.workout_category,
      workoutDifficulty: assignment.workout_difficulty,
      workoutDuration: assignment.workout_duration,
      userId: assignment.user_id,
      userName: assignment.user_name,
      userEmail: assignment.user_email,
      assignedBy: assignment.assigned_by,
      assignedByName,
      assignedAt: assignment.assigned_at,
      status: assignment.status,
      progressPercentage: assignment.progress_percentage,
      notes: assignment.notes,
    };
  }

  private formatWorkoutPlan(w: any) {
    return {
      id: w.id,
      branchId: w.branch_id,
      title: w.title,
      type: w.type,
      description: w.description,
      category: w.category,
      difficulty: w.difficulty,
      duration: w.duration,
      sessionsPerWeek: w.sessions_per_week,
      estimatedSessionDuration: w.estimated_session_duration,
      exercises:
        typeof w.exercises === 'string'
          ? JSON.parse(w.exercises)
          : w.exercises || [],
      status: w.status,
      createdBy: w.created_by,
      createdAt: w.created_at,
      updatedAt: w.updated_at,
    };
  }

  private formatWorkoutAssignment(
    assignment: any,
    workout: any,
    user: any,
    assignedByUser: any,
  ) {
    return {
      id: assignment.id,
      branchId: assignment.branch_id,
      workoutPlanId: workout.id,
      workoutTitle: workout.title,
      workoutType: workout.type,
      workoutCategory: workout.category,
      workoutDifficulty: workout.difficulty,
      workoutDuration: workout.duration,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      assignedBy: assignment.assigned_by,
      assignedByName: assignedByUser?.name || 'Unknown',
      assignedAt: assignment.assigned_at,
      status: assignment.status,
      progressPercentage: assignment.progress_percentage,
      notes: assignment.notes,
    };
  }
}
