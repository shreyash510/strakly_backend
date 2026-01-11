import * as admin from 'firebase-admin';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';
import {
  UserSchema,
  GoalSchema,
  HabitSchema,
  TaskSchema,
  RewardSchema,
  PunishmentSchema,
} from './database/schemas';
import { seedData, seedUsers } from './database/data';

dotenv.config();

const DATABASE_TYPE = process.env.DATABASE_TYPE || 'firebase';
const SALT_ROUNDS = 10;

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

async function seedMongoDB() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('Connected to MongoDB');

  const User = mongoose.model('User', UserSchema);
  const Goal = mongoose.model('Goal', GoalSchema);
  const Habit = mongoose.model('Habit', HabitSchema);
  const Task = mongoose.model('Task', TaskSchema);
  const Reward = mongoose.model('Reward', RewardSchema);
  const Punishment = mongoose.model('Punishment', PunishmentSchema);

  const now = new Date().toISOString();
  let primaryUserId: string | null = null;

  // Create all users
  console.log('\nCreating users...');
  for (const userData of seedUsers) {
    const existingUser = await User.findOne({ email: userData.email });
    if (existingUser) {
      console.log(`  User ${userData.email} already exists. Updating password...`);
      existingUser.passwordHash = await hashPassword(userData.password);
      existingUser.updatedAt = new Date().toISOString();
      await existingUser.save();
      if (userData.email === seedData.user.email) {
        primaryUserId = existingUser._id.toString();
      }
    } else {
      const user = await User.create({
        name: userData.name,
        email: userData.email,
        passwordHash: await hashPassword(userData.password),
        createdAt: now,
        updatedAt: now,
      });
      console.log(`  Created user: ${userData.name} (${userData.email})`);
      if (userData.email === seedData.user.email) {
        primaryUserId = user._id.toString();
      }
    }
  }
  console.log(`Created/Updated ${seedUsers.length} users`);

  // Create sample data only for primary user
  if (primaryUserId) {
    const userId = primaryUserId;

    // Check if goals already exist for this user
    const existingGoals = await Goal.findOne({ userId });
    if (!existingGoals) {
      // Create goals
      for (const goal of seedData.goals) {
        await Goal.create({ ...goal, userId, createdAt: now, updatedAt: now });
      }
      console.log(`Created ${seedData.goals.length} goals for primary user`);

      // Create habits
      for (const habit of seedData.habits) {
        await Habit.create({ ...habit, userId, createdAt: now, updatedAt: now });
      }
      console.log(`Created ${seedData.habits.length} habits for primary user`);

      // Create tasks
      for (const task of seedData.tasks) {
        await Task.create({ ...task, userId, createdAt: now, updatedAt: now });
      }
      console.log(`Created ${seedData.tasks.length} tasks for primary user`);

      // Create rewards
      for (const reward of seedData.rewards) {
        await Reward.create({ ...reward, userId, createdAt: now, updatedAt: now });
      }
      console.log(`Created ${seedData.rewards.length} rewards for primary user`);

      // Create punishments
      for (const punishment of seedData.punishments) {
        await Punishment.create({ ...punishment, userId, createdAt: now, updatedAt: now });
      }
      console.log(`Created ${seedData.punishments.length} punishments for primary user`);
    } else {
      console.log('Sample data already exists for primary user');
    }
  }

  console.log('\n========== MongoDB seeding completed! ==========');
  console.log('\nAll users:');
  seedUsers.forEach((u, i) => {
    console.log(`  ${i + 1}. ${u.name} - ${u.email} (password: ${u.password})`);
  });

  await mongoose.disconnect();
}

async function seedFirebase() {
  console.log('Connecting to Firebase...');

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });

  const db = admin.firestore();
  const now = new Date().toISOString();
  let primaryUserId: string | null = null;

  // Create all users
  console.log('\nCreating users...');
  for (const userData of seedUsers) {
    const existingUser = await db
      .collection('users')
      .where('email', '==', userData.email)
      .get();

    if (!existingUser.empty) {
      console.log(`  User ${userData.email} already exists. Skipping...`);
      if (userData.email === seedData.user.email) {
        primaryUserId = existingUser.docs[0].id;
      }
    } else {
      const userRef = await db.collection('users').add({
        name: userData.name,
        email: userData.email,
        passwordHash: await hashPassword(userData.password),
        createdAt: now,
        updatedAt: now,
      });
      console.log(`  Created user: ${userData.name} (${userData.email})`);
      if (userData.email === seedData.user.email) {
        primaryUserId = userRef.id;
      }
    }
  }
  console.log(`Created/Updated ${seedUsers.length} users`);

  // Create sample data only for primary user
  if (primaryUserId) {
    const userId = primaryUserId;

    // Check if goals already exist
    const existingGoals = await db.collection('users').doc(userId).collection('goals').limit(1).get();
    if (existingGoals.empty) {
      // Create goals (subcollection)
      for (const goal of seedData.goals) {
        await db.collection('users').doc(userId).collection('goals').add({
          ...goal,
          createdAt: now,
          updatedAt: now,
        });
      }
      console.log(`Created ${seedData.goals.length} goals for primary user`);

      // Create habits (subcollection)
      for (const habit of seedData.habits) {
        await db.collection('users').doc(userId).collection('habits').add({
          ...habit,
          createdAt: now,
          updatedAt: now,
        });
      }
      console.log(`Created ${seedData.habits.length} habits for primary user`);

      // Create tasks (subcollection)
      for (const task of seedData.tasks) {
        await db.collection('users').doc(userId).collection('tasks').add({
          ...task,
          createdAt: now,
          updatedAt: now,
        });
      }
      console.log(`Created ${seedData.tasks.length} tasks for primary user`);

      // Create rewards (subcollection)
      for (const reward of seedData.rewards) {
        await db.collection('users').doc(userId).collection('rewards').add({
          ...reward,
          createdAt: now,
          updatedAt: now,
        });
      }
      console.log(`Created ${seedData.rewards.length} rewards for primary user`);

      // Create punishments (subcollection)
      for (const punishment of seedData.punishments) {
        await db.collection('users').doc(userId).collection('punishments').add({
          ...punishment,
          createdAt: now,
          updatedAt: now,
        });
      }
      console.log(`Created ${seedData.punishments.length} punishments for primary user`);
    } else {
      console.log('Sample data already exists for primary user');
    }
  }

  console.log('\n========== Firebase seeding completed! ==========');
  console.log('\nAll users:');
  seedUsers.forEach((u, i) => {
    console.log(`  ${i + 1}. ${u.name} - ${u.email} (password: ${u.password})`);
  });
}

async function seed() {
  console.log(`Database type: ${DATABASE_TYPE}`);
  console.log('Starting seed...\n');

  if (DATABASE_TYPE === 'mongodb') {
    await seedMongoDB();
  } else {
    await seedFirebase();
  }

  process.exit(0);
}

seed().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
