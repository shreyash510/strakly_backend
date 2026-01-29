import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { TenantService } from '../tenant/tenant.service';
import { CreateDietDto, UpdateDietDto, AssignDietDto, UpdateDietAssignmentDto } from './dto/diet.dto';

@Injectable()
export class DietsService {
  constructor(private readonly tenantService: TenantService) {}

  /**
   * Ensure diets tables exist in the tenant schema
   */
  async ensureTablesExist(gymId: number): Promise<void> {
    await this.tenantService.executeInTenant(gymId, async (client, schemaName) => {
      // Create diets table
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."diets" (
          id SERIAL PRIMARY KEY,
          branch_id INTEGER,
          title VARCHAR(255) NOT NULL,
          type VARCHAR(50) NOT NULL,
          description TEXT,
          category VARCHAR(100) NOT NULL,
          content TEXT NOT NULL,
          status VARCHAR(50) DEFAULT 'draft',
          created_by INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Add branch_id column if it doesn't exist (for existing tables)
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${schemaName}' AND table_name = 'diets' AND column_name = 'branch_id') THEN
            ALTER TABLE "${schemaName}"."diets" ADD COLUMN branch_id INTEGER;
          END IF;
        END $$;
      `);

      // Create diet_assignments (xref) table
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"."diet_assignments" (
          id SERIAL PRIMARY KEY,
          branch_id INTEGER,
          diet_id INTEGER NOT NULL REFERENCES "${schemaName}"."diets"(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES "${schemaName}"."users"(id) ON DELETE CASCADE,
          assigned_by INTEGER NOT NULL,
          assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          status VARCHAR(50) DEFAULT 'active',
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Add branch_id column to diet_assignments if it doesn't exist (for existing tables)
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${schemaName}' AND table_name = 'diet_assignments' AND column_name = 'branch_id') THEN
            ALTER TABLE "${schemaName}"."diet_assignments" ADD COLUMN branch_id INTEGER;
          END IF;
        END $$;
      `);

      // Create indexes
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_diets_status" ON "${schemaName}"."diets"(status)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_diets_type" ON "${schemaName}"."diets"(type)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_diets_category" ON "${schemaName}"."diets"(category)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_diet_assignments_diet" ON "${schemaName}"."diet_assignments"(diet_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_diet_assignments_user" ON "${schemaName}"."diet_assignments"(user_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS "idx_${schemaName}_diet_assignments_status" ON "${schemaName}"."diet_assignments"(status)`);
    });
  }

  /**
   * Find all diets with optional filters
   */
  async findAll(gymId: number, filters?: {
    status?: string;
    type?: string;
    category?: string;
    search?: string;
    page?: number;
    limit?: number;
    branchId?: number | null;
  }) {
    await this.ensureTablesExist(gymId);

    const page = filters?.page || 1;
    const limit = filters?.limit || 15;
    const skip = (page - 1) * limit;

    const { diets, total } = await this.tenantService.executeInTenant(gymId, async (client) => {
      let whereClause = '1=1';
      const values: any[] = [];
      let paramIndex = 1;

      // Branch filtering
      if (filters?.branchId !== undefined && filters.branchId !== null) {
        whereClause += ` AND d.branch_id = $${paramIndex++}`;
        values.push(filters.branchId);
      }

      if (filters?.status && filters.status !== 'all') {
        whereClause += ` AND d.status = $${paramIndex++}`;
        values.push(filters.status);
      }
      if (filters?.type && filters.type !== 'all') {
        whereClause += ` AND d.type = $${paramIndex++}`;
        values.push(filters.type);
      }
      if (filters?.category && filters.category !== 'all') {
        whereClause += ` AND d.category = $${paramIndex++}`;
        values.push(filters.category);
      }
      if (filters?.search) {
        whereClause += ` AND (d.title ILIKE $${paramIndex} OR d.description ILIKE $${paramIndex})`;
        values.push(`%${filters.search}%`);
        paramIndex++;
      }

      const [dietsResult, countResult] = await Promise.all([
        client.query(
          `SELECT d.*
           FROM diets d
           WHERE ${whereClause}
           ORDER BY d.created_at DESC
           LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
          [...values, limit, skip]
        ),
        client.query(
          `SELECT COUNT(*) as count FROM diets d WHERE ${whereClause}`,
          values
        ),
      ]);

      return {
        diets: dietsResult.rows,
        total: parseInt(countResult.rows[0].count, 10),
      };
    });

    return {
      data: diets.map((d: any) => this.formatDiet(d)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Find a single diet by ID
   */
  async findOne(id: number, gymId: number) {
    await this.ensureTablesExist(gymId);

    const diet = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT d.* FROM diets d WHERE d.id = $1`,
        [id]
      );
      return result.rows[0];
    });

    if (!diet) {
      throw new NotFoundException(`Diet with ID ${id} not found`);
    }

    return this.formatDiet(diet);
  }

  /**
   * Create a new diet
   */
  async create(dto: CreateDietDto, gymId: number, userId: number, branchId?: number | null) {
    await this.ensureTablesExist(gymId);

    const diet = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `INSERT INTO diets (branch_id, title, type, description, category, content, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
         RETURNING *`,
        [branchId ?? null, dto.title, dto.type, dto.description || null, dto.category, dto.content, dto.status || 'draft', userId]
      );
      return result.rows[0];
    });

    return this.formatDiet(diet);
  }

  /**
   * Update an existing diet
   */
  async update(id: number, dto: UpdateDietDto, gymId: number) {
    await this.findOne(id, gymId); // Verify exists

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (dto.title) { updates.push(`title = $${paramIndex++}`); values.push(dto.title); }
    if (dto.type) { updates.push(`type = $${paramIndex++}`); values.push(dto.type); }
    if (dto.description !== undefined) { updates.push(`description = $${paramIndex++}`); values.push(dto.description); }
    if (dto.category) { updates.push(`category = $${paramIndex++}`); values.push(dto.category); }
    if (dto.content) { updates.push(`content = $${paramIndex++}`); values.push(dto.content); }
    if (dto.status) { updates.push(`status = $${paramIndex++}`); values.push(dto.status); }

    if (updates.length === 0) {
      return this.findOne(id, gymId);
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE diets SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      );
    });

    return this.findOne(id, gymId);
  }

  /**
   * Delete a diet
   */
  async delete(id: number, gymId: number) {
    await this.findOne(id, gymId); // Verify exists

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(`DELETE FROM diets WHERE id = $1`, [id]);
    });

    return { id, deleted: true };
  }

  /**
   * Assign a diet to a user
   */
  async assignDiet(dto: AssignDietDto, gymId: number, assignedBy: number, branchId?: number | null) {
    await this.ensureTablesExist(gymId);

    // Verify diet exists
    await this.findOne(dto.dietId, gymId);

    // Check if user already has this diet assigned (active)
    const existingAssignment = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT id FROM diet_assignments WHERE diet_id = $1 AND user_id = $2 AND status = 'active'`,
        [dto.dietId, dto.userId]
      );
      return result.rows[0];
    });

    if (existingAssignment) {
      throw new ConflictException('User already has this diet assigned');
    }

    // Get user and diet details for the response
    const { assignment, diet, user, assignedByUser } = await this.tenantService.executeInTenant(gymId, async (client) => {
      // Insert the assignment
      const assignmentResult = await client.query(
        `INSERT INTO diet_assignments (branch_id, diet_id, user_id, assigned_by, assigned_at, status, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), 'active', $5, NOW(), NOW())
         RETURNING *`,
        [branchId ?? null, dto.dietId, dto.userId, assignedBy, dto.notes || null]
      );

      // Get diet details
      const dietResult = await client.query(`SELECT * FROM diets WHERE id = $1`, [dto.dietId]);

      // Get user details (client)
      const userResult = await client.query(`SELECT id, name, email FROM users WHERE id = $1`, [dto.userId]);

      // Get assigned by user from public schema
      const pool = this.tenantService.getPool();
      const assignedByResult = await pool.query(
        `SELECT id, name FROM users WHERE id = $1`,
        [assignedBy]
      );

      return {
        assignment: assignmentResult.rows[0],
        diet: dietResult.rows[0],
        user: userResult.rows[0],
        assignedByUser: assignedByResult.rows[0],
      };
    });

    return this.formatDietAssignment(assignment, diet, user, assignedByUser);
  }

  /**
   * Get all assignments for a specific diet
   */
  async getDietAssignments(dietId: number, gymId: number) {
    await this.ensureTablesExist(gymId);
    await this.findOne(dietId, gymId); // Verify diet exists

    const assignments = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT da.*, d.title as diet_title, d.type as diet_type, d.category as diet_category,
                u.id as user_id, u.name as user_name, u.email as user_email
         FROM diet_assignments da
         JOIN diets d ON d.id = da.diet_id
         JOIN users u ON u.id = da.user_id
         WHERE da.diet_id = $1 AND da.status != 'cancelled'
         ORDER BY da.assigned_at DESC`,
        [dietId]
      );
      return result.rows;
    });

    // Get assigned by names from public schema
    const pool = this.tenantService.getPool();
    const assignedByIds = [...new Set(assignments.map((a: any) => a.assigned_by))];

    let assignedByMap: Record<number, string> = {};
    if (assignedByIds.length > 0) {
      const result = await pool.query(
        `SELECT id, name FROM users WHERE id = ANY($1)`,
        [assignedByIds]
      );
      assignedByMap = Object.fromEntries(result.rows.map((u: any) => [u.id, u.name]));
    }

    return assignments.map((a: any) => ({
      id: a.id,
      dietId: a.diet_id,
      dietTitle: a.diet_title,
      dietType: a.diet_type,
      dietCategory: a.diet_category,
      userId: a.user_id,
      userName: a.user_name,
      userEmail: a.user_email,
      assignedBy: a.assigned_by,
      assignedByName: assignedByMap[a.assigned_by] || 'Unknown',
      assignedAt: a.assigned_at,
      status: a.status,
      notes: a.notes,
    }));
  }

  /**
   * Get all diet assignments for a specific user
   */
  async getUserDietAssignments(userId: number, gymId: number) {
    await this.ensureTablesExist(gymId);

    const assignments = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT da.*, d.title as diet_title, d.type as diet_type, d.category as diet_category,
                u.id as user_id, u.name as user_name, u.email as user_email
         FROM diet_assignments da
         JOIN diets d ON d.id = da.diet_id
         JOIN users u ON u.id = da.user_id
         WHERE da.user_id = $1
         ORDER BY da.assigned_at DESC`,
        [userId]
      );
      return result.rows;
    });

    // Get assigned by names from public schema
    const pool = this.tenantService.getPool();
    const assignedByIds = [...new Set(assignments.map((a: any) => a.assigned_by))];

    let assignedByMap: Record<number, string> = {};
    if (assignedByIds.length > 0) {
      const result = await pool.query(
        `SELECT id, name FROM users WHERE id = ANY($1)`,
        [assignedByIds]
      );
      assignedByMap = Object.fromEntries(result.rows.map((u: any) => [u.id, u.name]));
    }

    return assignments.map((a: any) => ({
      id: a.id,
      dietId: a.diet_id,
      dietTitle: a.diet_title,
      dietType: a.diet_type,
      dietCategory: a.diet_category,
      userId: a.user_id,
      userName: a.user_name,
      userEmail: a.user_email,
      assignedBy: a.assigned_by,
      assignedByName: assignedByMap[a.assigned_by] || 'Unknown',
      assignedAt: a.assigned_at,
      status: a.status,
      notes: a.notes,
    }));
  }

  /**
   * Update a diet assignment status
   */
  async updateAssignment(assignmentId: number, dto: UpdateDietAssignmentDto, gymId: number) {
    await this.ensureTablesExist(gymId);

    const assignment = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT * FROM diet_assignments WHERE id = $1`,
        [assignmentId]
      );
      return result.rows[0];
    });

    if (!assignment) {
      throw new NotFoundException(`Diet assignment with ID ${assignmentId} not found`);
    }

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (dto.status) { updates.push(`status = $${paramIndex++}`); values.push(dto.status); }
    if (dto.notes !== undefined) { updates.push(`notes = $${paramIndex++}`); values.push(dto.notes); }

    if (updates.length === 0) {
      return this.getAssignmentById(assignmentId, gymId);
    }

    updates.push(`updated_at = NOW()`);
    values.push(assignmentId);

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE diet_assignments SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
        values
      );
    });

    return this.getAssignmentById(assignmentId, gymId);
  }

  /**
   * Unassign (cancel) a diet assignment
   */
  async unassignDiet(assignmentId: number, gymId: number) {
    await this.ensureTablesExist(gymId);

    const assignment = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT * FROM diet_assignments WHERE id = $1`,
        [assignmentId]
      );
      return result.rows[0];
    });

    if (!assignment) {
      throw new NotFoundException(`Diet assignment with ID ${assignmentId} not found`);
    }

    await this.tenantService.executeInTenant(gymId, async (client) => {
      await client.query(
        `UPDATE diet_assignments SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
        [assignmentId]
      );
    });

    return { id: assignmentId, unassigned: true };
  }

  /**
   * Get a single assignment by ID
   */
  private async getAssignmentById(assignmentId: number, gymId: number) {
    const assignment = await this.tenantService.executeInTenant(gymId, async (client) => {
      const result = await client.query(
        `SELECT da.*, d.title as diet_title, d.type as diet_type, d.category as diet_category,
                u.id as user_id, u.name as user_name, u.email as user_email
         FROM diet_assignments da
         JOIN diets d ON d.id = da.diet_id
         JOIN users u ON u.id = da.user_id
         WHERE da.id = $1`,
        [assignmentId]
      );
      return result.rows[0];
    });

    if (!assignment) {
      throw new NotFoundException(`Diet assignment with ID ${assignmentId} not found`);
    }

    // Get assigned by name from public schema
    const pool = this.tenantService.getPool();
    const assignedByResult = await pool.query(
      `SELECT name FROM users WHERE id = $1`,
      [assignment.assigned_by]
    );
    const assignedByName = assignedByResult.rows[0]?.name || 'Unknown';

    return {
      id: assignment.id,
      dietId: assignment.diet_id,
      dietTitle: assignment.diet_title,
      dietType: assignment.diet_type,
      dietCategory: assignment.diet_category,
      userId: assignment.user_id,
      userName: assignment.user_name,
      userEmail: assignment.user_email,
      assignedBy: assignment.assigned_by,
      assignedByName,
      assignedAt: assignment.assigned_at,
      status: assignment.status,
      notes: assignment.notes,
    };
  }

  private formatDiet(d: any) {
    return {
      id: d.id,
      branchId: d.branch_id,
      title: d.title,
      type: d.type,
      description: d.description,
      category: d.category,
      content: d.content,
      status: d.status,
      createdBy: d.created_by,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    };
  }

  private formatDietAssignment(assignment: any, diet: any, user: any, assignedByUser: any) {
    return {
      id: assignment.id,
      branchId: assignment.branch_id,
      dietId: diet.id,
      dietTitle: diet.title,
      dietType: diet.type,
      dietCategory: diet.category,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      assignedBy: assignment.assigned_by,
      assignedByName: assignedByUser?.name || 'Unknown',
      assignedAt: assignment.assigned_at,
      status: assignment.status,
      notes: assignment.notes,
    };
  }
}
