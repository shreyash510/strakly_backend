import { registerAs } from '@nestjs/config';

export type DatabaseType = 'firebase' | 'mongodb';

export default registerAs('database', () => ({
  type: (process.env.DATABASE_TYPE || 'firebase') as DatabaseType,
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/strakly',
  },
}));

export const isFirebase = () => process.env.DATABASE_TYPE === 'firebase';
export const isMongoDB = () => process.env.DATABASE_TYPE === 'mongodb';
