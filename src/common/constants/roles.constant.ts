export enum SystemRoles {
  SUPER_ADMIN = 'SUPER_ADMIN',
}

export enum GymRoles {
  ADMIN = 'ADMIN',
  TRAINER = 'TRAINER',
  USER = 'USER',
}

export const AllRoles = { ...SystemRoles, ...GymRoles };

export type RoleType = SystemRoles | GymRoles;
