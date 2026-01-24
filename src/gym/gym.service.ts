import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { CreateGymDto, UpdateGymDto } from './dto/gym.dto';
import {
  PaginationParams,
  PaginatedResponse,
  getPaginationParams,
  createPaginationMeta,
} from '../common/pagination.util';

export interface GymFilters extends PaginationParams {
  status?: string;
  includeInactive?: boolean;
  gymId?: number;
}

@Injectable()
export class GymService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
  ) {}

  async findAll(filters: GymFilters = {}): Promise<PaginatedResponse<any>> {
    const { page, limit, skip, take, noPagination } = getPaginationParams(filters);

    const where: any = {};

    /* Filter by gymId if provided (non-superadmin users only see their own gym) */
    if (filters.gymId) {
      where.id = filters.gymId;
    }

    // Handle status filter
    if (filters.status && filters.status !== 'all') {
      where.isActive = filters.status === 'active';
    } else if (!filters.includeInactive) {
      where.isActive = true;
    }

    // Apply search filter
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
        { phone: { contains: filters.search, mode: 'insensitive' } },
        { city: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    // Get total count
    const total = await this.prisma.gym.count({ where });

    // Get paginated data
    const gyms = await this.prisma.gym.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });

    // Get admin owners for each gym from user_tenant_mappings
    const gymIds = gyms.map(g => g.id);
    const adminMappings = await this.prisma.userTenantMapping.findMany({
      where: {
        gymId: { in: gymIds },
        role: 'admin',
        isActive: true,
      },
    });

    // Create a map of gymId -> admin info
    const ownerMap = new Map<number, any>();
    for (const mapping of adminMappings) {
      if (!ownerMap.has(mapping.gymId)) {
        try {
          const adminUser = await this.tenantService.executeInTenant(mapping.gymId, async (client) => {
            const result = await client.query(
              `SELECT id, name, email FROM users WHERE id = $1`,
              [mapping.tenantUserId]
            );
            return result.rows[0];
          });
          if (adminUser) {
            ownerMap.set(mapping.gymId, {
              id: adminUser.id,
              name: adminUser.name,
              email: adminUser.email,
            });
          }
        } catch (e) {
          // Tenant schema might not exist yet
        }
      }
    }

    // Format response with owner info
    const formattedGyms = gyms.map((gym) => ({
      ...gym,
      owner: ownerMap.get(gym.id) || null,
    }));

    return {
      data: formattedGyms,
      pagination: createPaginationMeta(total, page, limit, noPagination),
    };
  }

  async findOne(id: number) {
    const gym = await this.prisma.gym.findUnique({
      where: { id },
    });

    if (!gym) {
      throw new NotFoundException(`Gym with ID ${id} not found`);
    }

    // Get admin owner from user_tenant_mappings
    let owner: { id: number; name: string; email: string } | null = null;
    const adminMapping = await this.prisma.userTenantMapping.findFirst({
      where: {
        gymId: id,
        role: 'admin',
        isActive: true,
      },
    });

    if (adminMapping) {
      try {
        const adminUser = await this.tenantService.executeInTenant(id, async (client) => {
          const result = await client.query(
            `SELECT id, name, email FROM users WHERE id = $1`,
            [adminMapping.tenantUserId]
          );
          return result.rows[0];
        });
        if (adminUser) {
          owner = {
            id: adminUser.id,
            name: adminUser.name,
            email: adminUser.email,
          };
        }
      } catch (e) {
        // Tenant schema might not exist yet
      }
    }

    return {
      ...gym,
      owner,
    };
  }

  async create(dto: CreateGymDto) {
    // Generate tenant schema name
    const schemaName = `tenant_${Date.now()}`;

    // Create the gym with tenant schema name
    const gym = await this.prisma.gym.create({
      data: {
        tenantSchemaName: schemaName,
        name: dto.name,
        description: dto.description,
        logo: dto.logo,
        phone: dto.phone,
        email: dto.email,
        website: dto.website,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        zipCode: dto.zipCode,
        country: dto.country || 'India',
        openingTime: dto.openingTime,
        closingTime: dto.closingTime,
        capacity: dto.capacity,
        amenities: dto.amenities || [],
        isActive: dto.isActive ?? true,
      },
    });

    // Create the tenant schema
    await this.tenantService.createTenantSchema(gym.id);

    return this.findOne(gym.id);
  }

  async update(id: number, dto: UpdateGymDto) {
    await this.findOne(id);

    return this.prisma.gym.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number) {
    const gym = await this.findOne(id);

    // Check if gym has any linked users in user_tenant_mappings
    const usersCount = await this.prisma.userTenantMapping.count({
      where: { gymId: id, isActive: true },
    });

    if (usersCount > 0) {
      throw new BadRequestException(
        `Cannot delete gym. ${usersCount} user(s) are linked to this gym. Please reassign or remove users first.`,
      );
    }

    // Check if gym has any active memberships in tenant schema
    try {
      const activeMemberships = await this.tenantService.executeInTenant(id, async (client) => {
        const result = await client.query(
          `SELECT COUNT(*) as count FROM memberships WHERE status IN ('active', 'pending')`
        );
        return parseInt(result.rows[0].count, 10);
      });

      if (activeMemberships > 0) {
        throw new BadRequestException(
          `Cannot delete gym. ${activeMemberships} active membership(s) exist at this gym.`,
        );
      }
    } catch (e) {
      // Tenant schema might not exist, which is fine
      if (e instanceof BadRequestException) {
        throw e;
      }
    }

    // Delete the gym (cascade will handle user_tenant_mappings, support_tickets, etc.)
    await this.prisma.gym.delete({
      where: { id },
    });

    // Note: Tenant schema deletion should be handled separately (manual or background job)

    return { success: true, message: 'Gym deleted successfully' };
  }

  async toggleStatus(id: number) {
    const gym = await this.findOne(id);

    return this.prisma.gym.update({
      where: { id },
      data: { isActive: !gym.isActive },
    });
  }
}
