import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateLookupTypeDto, UpdateLookupTypeDto } from './dto/create-lookup-type.dto';
import { CreateLookupDto, UpdateLookupDto } from './dto/create-lookup.dto';

@Injectable()
export class LookupsService {
  constructor(private readonly prisma: PrismaService) {}

  // ============ LOOKUP TYPES ============

  async findAllLookupTypes() {
    return this.prisma.lookupType.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        lookups: {
          where: { isActive: true },
          orderBy: { displayOrder: 'asc' },
        },
      },
    });
  }

  async findLookupTypeByCode(code: string) {
    const lookupType = await this.prisma.lookupType.findUnique({
      where: { code },
      include: {
        lookups: {
          where: { isActive: true },
          orderBy: { displayOrder: 'asc' },
        },
      },
    });

    if (!lookupType) {
      throw new NotFoundException(`LookupType with code ${code} not found`);
    }

    return lookupType;
  }

  async createLookupType(dto: CreateLookupTypeDto) {
    const existing = await this.prisma.lookupType.findUnique({
      where: { code: dto.code },
    });

    if (existing) {
      throw new ConflictException(`LookupType with code ${dto.code} already exists`);
    }

    return this.prisma.lookupType.create({
      data: dto,
    });
  }

  async updateLookupType(code: string, dto: UpdateLookupTypeDto) {
    await this.findLookupTypeByCode(code);

    return this.prisma.lookupType.update({
      where: { code },
      data: dto,
    });
  }

  async deleteLookupType(code: string) {
    await this.findLookupTypeByCode(code);

    // Soft delete by setting isActive to false
    return this.prisma.lookupType.update({
      where: { code },
      data: { isActive: false },
    });
  }

  // ============ LOOKUPS ============

  async findLookupsByType(typeCode: string) {
    const lookupType = await this.findLookupTypeByCode(typeCode);

    return this.prisma.lookup.findMany({
      where: {
        lookupTypeId: lookupType.id,
        isActive: true,
      },
      orderBy: { displayOrder: 'asc' },
    });
  }

  async findLookupById(id: string) {
    const lookup = await this.prisma.lookup.findUnique({
      where: { id },
      include: { lookupType: true },
    });

    if (!lookup) {
      throw new NotFoundException(`Lookup with id ${id} not found`);
    }

    return lookup;
  }

  async createLookup(typeCode: string, dto: CreateLookupDto) {
    const lookupType = await this.findLookupTypeByCode(typeCode);

    // Check if lookup with same code exists for this type
    const existing = await this.prisma.lookup.findUnique({
      where: {
        lookupTypeId_code: {
          lookupTypeId: lookupType.id,
          code: dto.code,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Lookup with code ${dto.code} already exists for type ${typeCode}`,
      );
    }

    return this.prisma.lookup.create({
      data: {
        ...dto,
        lookupTypeId: lookupType.id,
      },
    });
  }

  async updateLookup(id: string, dto: UpdateLookupDto) {
    await this.findLookupById(id);

    return this.prisma.lookup.update({
      where: { id },
      data: dto,
    });
  }

  async deleteLookup(id: string) {
    await this.findLookupById(id);

    // Soft delete by setting isActive to false
    return this.prisma.lookup.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ============ BULK OPERATIONS ============

  async createBulkLookups(typeCode: string, lookups: CreateLookupDto[]) {
    const lookupType = await this.findLookupTypeByCode(typeCode);

    const results: any[] = [];
    for (const dto of lookups) {
      try {
        const created = await this.prisma.lookup.create({
          data: {
            ...dto,
            lookupTypeId: lookupType.id,
          },
        });
        results.push(created);
      } catch (error) {
        // Skip duplicates
        console.log(`Skipping duplicate lookup: ${dto.code}`);
      }
    }

    return results;
  }
}
