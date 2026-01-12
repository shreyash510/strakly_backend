import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role, RoleDocument } from '../database/schemas/role.schema';
import { Permission, PermissionDocument } from '../database/schemas/permission.schema';
import { RolePermission, RolePermissionDocument } from '../database/schemas/role-permission.schema';
import { CreateRoleDto } from './dto/create-role.dto';

@Injectable()
export class RolesService {
  constructor(
    @InjectModel(Role.name) private roleModel: Model<RoleDocument>,
    @InjectModel(Permission.name) private permissionModel: Model<PermissionDocument>,
    @InjectModel(RolePermission.name) private rolePermissionModel: Model<RolePermissionDocument>,
  ) {}

  async create(createRoleDto: CreateRoleDto, createdBy: string): Promise<Role> {
    const role = new this.roleModel({
      ...createRoleDto,
      createdBy: new Types.ObjectId(createdBy),
    });
    return role.save();
  }

  async findAll(): Promise<Role[]> {
    return this.roleModel.find({ isArchived: false }).sort({ sortOrder: 1 }).exec();
  }

  async findOne(id: string): Promise<Role> {
    const role = await this.roleModel.findById(id).exec();
    if (!role) {
      throw new NotFoundException(`Role with ID ${id} not found`);
    }
    return role;
  }

  async findByName(name: string): Promise<Role> {
    const role = await this.roleModel.findOne({ name }).exec();
    if (!role) {
      throw new NotFoundException(`Role with name ${name} not found`);
    }
    return role;
  }

  async getRolePermissions(roleId: string): Promise<Permission[]> {
    const rolePermissions = await this.rolePermissionModel
      .find({ roleId: new Types.ObjectId(roleId) })
      .populate('permissionId')
      .exec();
    return rolePermissions.map((rp) => rp.permissionId as unknown as Permission);
  }

  async getUserPermissions(userId: string, roleId: string): Promise<string[]> {
    const rolePermissions = await this.rolePermissionModel
      .find({ roleId: new Types.ObjectId(roleId) })
      .populate('permissionId')
      .exec();
    return rolePermissions.map((rp) => (rp.permissionId as any).name);
  }

  async assignPermissionToRole(
    roleId: string,
    permissionId: string,
    createdBy: string,
  ): Promise<RolePermission> {
    return this.rolePermissionModel.create({
      roleId: new Types.ObjectId(roleId),
      permissionId: new Types.ObjectId(permissionId),
      createdBy: new Types.ObjectId(createdBy),
    });
  }

  async removePermissionFromRole(roleId: string, permissionId: string): Promise<void> {
    await this.rolePermissionModel.deleteOne({
      roleId: new Types.ObjectId(roleId),
      permissionId: new Types.ObjectId(permissionId),
    });
  }

  // Permissions CRUD
  async createPermission(data: {
    name: string;
    label: string;
    description?: string;
    module?: string;
    level: string;
    sortOrder?: number;
  }, createdBy: string): Promise<Permission> {
    const permission = new this.permissionModel({
      ...data,
      createdBy: new Types.ObjectId(createdBy),
    });
    return permission.save();
  }

  async findAllPermissions(): Promise<Permission[]> {
    return this.permissionModel.find({ isArchived: false }).sort({ sortOrder: 1 }).exec();
  }

  async findPermissionsByLevel(level: string): Promise<Permission[]> {
    return this.permissionModel.find({ level, isArchived: false }).sort({ sortOrder: 1 }).exec();
  }

  // Seed default roles and permissions
  async seedDefaultRolesAndPermissions(): Promise<void> {
    // Check if roles already exist
    const existingRoles = await this.roleModel.countDocuments();
    if (existingRoles > 0) {
      return;
    }

    // Create default roles
    const roles = [
      { name: 'SUPER_ADMIN', label: 'Super Admin', level: 'system', sortOrder: 1, isSystem: true },
      { name: 'ADMIN', label: 'Gym Admin', level: 'gym', sortOrder: 2, isSystem: true },
      { name: 'TRAINER', label: 'Trainer', level: 'gym', sortOrder: 3, isSystem: true },
      { name: 'USER', label: 'User', level: 'gym', sortOrder: 4, isSystem: true },
    ];

    await this.roleModel.insertMany(roles);

    // Create default permissions
    const systemPermissions = [
      { name: 'ADMIN_CREATE', label: 'Create Admin', module: 'admin', level: 'system', sortOrder: 1, isSystem: true },
      { name: 'ADMIN_READ', label: 'View Admin', module: 'admin', level: 'system', sortOrder: 2, isSystem: true },
      { name: 'ADMIN_UPDATE', label: 'Update Admin', module: 'admin', level: 'system', sortOrder: 3, isSystem: true },
      { name: 'ADMIN_DELETE', label: 'Delete Admin', module: 'admin', level: 'system', sortOrder: 4, isSystem: true },
      { name: 'GYM_READ_ALL', label: 'View All Gyms', module: 'gym', level: 'system', sortOrder: 5, isSystem: true },
      { name: 'GYM_UPDATE_ANY', label: 'Update Any Gym', module: 'gym', level: 'system', sortOrder: 6, isSystem: true },
      { name: 'GYM_DELETE_ANY', label: 'Delete Any Gym', module: 'gym', level: 'system', sortOrder: 7, isSystem: true },
    ];

    const gymPermissions = [
      { name: 'GYM_MANAGE', label: 'Manage Gym', module: 'gym', level: 'gym', sortOrder: 10, isSystem: true },
      { name: 'TRAINER_CREATE', label: 'Create Trainer', module: 'trainer', level: 'gym', sortOrder: 11, isSystem: true },
      { name: 'TRAINER_READ', label: 'View Trainer', module: 'trainer', level: 'gym', sortOrder: 12, isSystem: true },
      { name: 'TRAINER_UPDATE', label: 'Update Trainer', module: 'trainer', level: 'gym', sortOrder: 13, isSystem: true },
      { name: 'TRAINER_DELETE', label: 'Delete Trainer', module: 'trainer', level: 'gym', sortOrder: 14, isSystem: true },
      { name: 'TRAINER_ASSIGN', label: 'Assign Trainer', module: 'trainer', level: 'gym', sortOrder: 15, isSystem: true },
      { name: 'USER_CREATE', label: 'Create User', module: 'user', level: 'gym', sortOrder: 20, isSystem: true },
      { name: 'USER_READ', label: 'View User', module: 'user', level: 'gym', sortOrder: 21, isSystem: true },
      { name: 'USER_UPDATE', label: 'Update User', module: 'user', level: 'gym', sortOrder: 22, isSystem: true },
      { name: 'USER_DELETE', label: 'Delete User', module: 'user', level: 'gym', sortOrder: 23, isSystem: true },
      { name: 'DIET_PLAN_CREATE', label: 'Create Diet Plan', module: 'diet', level: 'gym', sortOrder: 30, isSystem: true },
      { name: 'DIET_PLAN_READ', label: 'View Diet Plan', module: 'diet', level: 'gym', sortOrder: 31, isSystem: true },
      { name: 'DIET_PLAN_UPDATE', label: 'Update Diet Plan', module: 'diet', level: 'gym', sortOrder: 32, isSystem: true },
      { name: 'DIET_PLAN_DELETE', label: 'Delete Diet Plan', module: 'diet', level: 'gym', sortOrder: 33, isSystem: true },
      { name: 'EXERCISE_PLAN_CREATE', label: 'Create Exercise Plan', module: 'exercise', level: 'gym', sortOrder: 40, isSystem: true },
      { name: 'EXERCISE_PLAN_READ', label: 'View Exercise Plan', module: 'exercise', level: 'gym', sortOrder: 41, isSystem: true },
      { name: 'EXERCISE_PLAN_UPDATE', label: 'Update Exercise Plan', module: 'exercise', level: 'gym', sortOrder: 42, isSystem: true },
      { name: 'EXERCISE_PLAN_DELETE', label: 'Delete Exercise Plan', module: 'exercise', level: 'gym', sortOrder: 43, isSystem: true },
      { name: 'PROGRESS_READ', label: 'View Progress', module: 'progress', level: 'gym', sortOrder: 50, isSystem: true },
      { name: 'PROGRESS_UPDATE', label: 'Update Progress', module: 'progress', level: 'gym', sortOrder: 51, isSystem: true },
      { name: 'ANNOUNCEMENT_CREATE', label: 'Create Announcement', module: 'announcement', level: 'gym', sortOrder: 60, isSystem: true },
      { name: 'ANNOUNCEMENT_READ', label: 'View Announcement', module: 'announcement', level: 'gym', sortOrder: 61, isSystem: true },
      { name: 'ANNOUNCEMENT_UPDATE', label: 'Update Announcement', module: 'announcement', level: 'gym', sortOrder: 62, isSystem: true },
      { name: 'ANNOUNCEMENT_DELETE', label: 'Delete Announcement', module: 'announcement', level: 'gym', sortOrder: 63, isSystem: true },
      { name: 'REWARD_CREATE', label: 'Create Reward', module: 'reward', level: 'gym', sortOrder: 70, isSystem: true },
      { name: 'REWARD_READ', label: 'View Reward', module: 'reward', level: 'gym', sortOrder: 71, isSystem: true },
      { name: 'REWARD_UPDATE', label: 'Update Reward', module: 'reward', level: 'gym', sortOrder: 72, isSystem: true },
      { name: 'REWARD_DELETE', label: 'Delete Reward', module: 'reward', level: 'gym', sortOrder: 73, isSystem: true },
      { name: 'SUCCESS_STORY_CREATE', label: 'Create Success Story', module: 'story', level: 'gym', sortOrder: 80, isSystem: true },
      { name: 'SUCCESS_STORY_READ', label: 'View Success Story', module: 'story', level: 'gym', sortOrder: 81, isSystem: true },
      { name: 'SUCCESS_STORY_APPROVE', label: 'Approve Success Story', module: 'story', level: 'gym', sortOrder: 82, isSystem: true },
      { name: 'SUBSCRIPTION_READ', label: 'View Subscription', module: 'subscription', level: 'gym', sortOrder: 90, isSystem: true },
      { name: 'SUBSCRIPTION_MANAGE', label: 'Manage Subscription', module: 'subscription', level: 'gym', sortOrder: 91, isSystem: true },
      { name: 'GOAL_CRUD', label: 'Manage Goals', module: 'goal', level: 'gym', sortOrder: 100, isSystem: true },
      { name: 'HABIT_CRUD', label: 'Manage Habits', module: 'habit', level: 'gym', sortOrder: 101, isSystem: true },
      { name: 'TASK_CRUD', label: 'Manage Tasks', module: 'task', level: 'gym', sortOrder: 102, isSystem: true },
      { name: 'EXERCISE_LOG', label: 'Log Exercise', module: 'exercise', level: 'gym', sortOrder: 103, isSystem: true },
      { name: 'DIET_LOG', label: 'Log Diet', module: 'diet', level: 'gym', sortOrder: 104, isSystem: true },
      { name: 'FRIEND_MANAGE', label: 'Manage Friends', module: 'social', level: 'gym', sortOrder: 105, isSystem: true },
      { name: 'CHALLENGE_MANAGE', label: 'Manage Challenges', module: 'social', level: 'gym', sortOrder: 106, isSystem: true },
    ];

    await this.permissionModel.insertMany([...systemPermissions, ...gymPermissions]);

    // Assign permissions to roles
    const savedRoles = await this.roleModel.find();
    const savedPermissions = await this.permissionModel.find();

    const roleMap = new Map(savedRoles.map((r) => [r.name, r._id]));
    const permMap = new Map(savedPermissions.map((p) => [p.name, p._id]));

    const rolePermissionMappings = [];

    // Super Admin - all system permissions
    const superAdminPerms = savedPermissions.filter((p) => p.level === 'system');
    for (const perm of superAdminPerms) {
      rolePermissionMappings.push({
        roleId: roleMap.get('SUPER_ADMIN'),
        permissionId: perm._id,
      });
    }

    // Admin permissions
    const adminPermNames = [
      'GYM_MANAGE', 'TRAINER_CREATE', 'TRAINER_READ', 'TRAINER_UPDATE', 'TRAINER_DELETE', 'TRAINER_ASSIGN',
      'USER_CREATE', 'USER_READ', 'USER_UPDATE', 'USER_DELETE',
      'DIET_PLAN_CREATE', 'DIET_PLAN_READ', 'DIET_PLAN_UPDATE', 'DIET_PLAN_DELETE',
      'EXERCISE_PLAN_CREATE', 'EXERCISE_PLAN_READ', 'EXERCISE_PLAN_UPDATE', 'EXERCISE_PLAN_DELETE',
      'PROGRESS_READ', 'PROGRESS_UPDATE',
      'ANNOUNCEMENT_CREATE', 'ANNOUNCEMENT_READ', 'ANNOUNCEMENT_UPDATE', 'ANNOUNCEMENT_DELETE',
      'REWARD_CREATE', 'REWARD_READ', 'REWARD_UPDATE', 'REWARD_DELETE',
      'SUCCESS_STORY_CREATE', 'SUCCESS_STORY_READ', 'SUCCESS_STORY_APPROVE',
      'SUBSCRIPTION_READ', 'SUBSCRIPTION_MANAGE',
    ];
    for (const name of adminPermNames) {
      if (permMap.has(name)) {
        rolePermissionMappings.push({
          roleId: roleMap.get('ADMIN'),
          permissionId: permMap.get(name),
        });
      }
    }

    // Trainer permissions
    const trainerPermNames = [
      'TRAINER_READ', 'USER_CREATE', 'USER_READ', 'USER_UPDATE',
      'DIET_PLAN_CREATE', 'DIET_PLAN_READ', 'DIET_PLAN_UPDATE', 'DIET_PLAN_DELETE',
      'EXERCISE_PLAN_CREATE', 'EXERCISE_PLAN_READ', 'EXERCISE_PLAN_UPDATE', 'EXERCISE_PLAN_DELETE',
      'PROGRESS_READ', 'PROGRESS_UPDATE', 'ANNOUNCEMENT_READ', 'REWARD_READ', 'SUCCESS_STORY_READ',
    ];
    for (const name of trainerPermNames) {
      if (permMap.has(name)) {
        rolePermissionMappings.push({
          roleId: roleMap.get('TRAINER'),
          permissionId: permMap.get(name),
        });
      }
    }

    // User permissions
    const userPermNames = [
      'DIET_PLAN_READ', 'EXERCISE_PLAN_READ', 'PROGRESS_READ', 'PROGRESS_UPDATE',
      'ANNOUNCEMENT_READ', 'REWARD_READ', 'SUCCESS_STORY_CREATE', 'SUCCESS_STORY_READ',
      'SUBSCRIPTION_READ', 'GOAL_CRUD', 'HABIT_CRUD', 'TASK_CRUD',
      'EXERCISE_LOG', 'DIET_LOG', 'FRIEND_MANAGE', 'CHALLENGE_MANAGE',
    ];
    for (const name of userPermNames) {
      if (permMap.has(name)) {
        rolePermissionMappings.push({
          roleId: roleMap.get('USER'),
          permissionId: permMap.get(name),
        });
      }
    }

    await this.rolePermissionModel.insertMany(rolePermissionMappings);
  }
}
