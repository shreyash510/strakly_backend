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
import { seedData } from './database/data';

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

  // Check if user exists
  const existingUser = await User.findOne({ email: seedData.user.email });
  if (existingUser) {
    console.log(`User ${seedData.user.email} already exists. Updating password...`);
    existingUser.passwordHash = await hashPassword(seedData.user.password);
    existingUser.updatedAt = new Date().toISOString();
    await existingUser.save();
    console.log('Password updated successfully!');
    console.log(`Email: ${seedData.user.email}`);
    console.log(`Password: ${seedData.user.password}`);
    await mongoose.disconnect();
    return;
  }

  const now = new Date().toISOString();

  // Create user
  const user = await User.create({
    name: seedData.user.name,
    email: seedData.user.email,
    passwordHash: await hashPassword(seedData.user.password),
    createdAt: now,
    updatedAt: now,
  });
  console.log(`User created with ID: ${user._id}`);

  const userId = user._id.toString();

  // Create goals
  for (const goal of seedData.goals) {
    await Goal.create({ ...goal, userId, createdAt: now, updatedAt: now });
  }
  console.log(`Created ${seedData.goals.length} goals`);

  // Create habits
  for (const habit of seedData.habits) {
    await Habit.create({ ...habit, userId, createdAt: now, updatedAt: now });
  }
  console.log(`Created ${seedData.habits.length} habits`);

  // Create tasks
  for (const task of seedData.tasks) {
    await Task.create({ ...task, userId, createdAt: now, updatedAt: now });
  }
  console.log(`Created ${seedData.tasks.length} tasks`);

  // Create rewards
  for (const reward of seedData.rewards) {
    await Reward.create({ ...reward, userId, createdAt: now, updatedAt: now });
  }
  console.log(`Created ${seedData.rewards.length} rewards`);

  // Create punishments
  for (const punishment of seedData.punishments) {
    await Punishment.create({ ...punishment, userId, createdAt: now, updatedAt: now });
  }
  console.log(`Created ${seedData.punishments.length} punishments`);

  console.log('\nMongoDB seeding completed!');
  console.log(`Email: ${seedData.user.email}`);
  console.log(`Password: ${seedData.user.password}`);

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

  // Check if user exists
  const existingUser = await db
    .collection('users')
    .where('email', '==', seedData.user.email)
    .get();

  if (!existingUser.empty) {
    console.log(`User ${seedData.user.email} already exists. Skipping...`);
    return;
  }

  // Create user
  const userRef = await db.collection('users').add({
    name: seedData.user.name,
    email: seedData.user.email,
    passwordHash: await hashPassword(seedData.user.password),
    createdAt: now,
    updatedAt: now,
  });
  console.log(`User created with ID: ${userRef.id}`);

  const userId = userRef.id;

  // Create goals (subcollection)
  for (const goal of seedData.goals) {
    await db.collection('users').doc(userId).collection('goals').add({
      ...goal,
      createdAt: now,
      updatedAt: now,
    });
  }
  console.log(`Created ${seedData.goals.length} goals`);

  // Create habits (subcollection)
  for (const habit of seedData.habits) {
    await db.collection('users').doc(userId).collection('habits').add({
      ...habit,
      createdAt: now,
      updatedAt: now,
    });
  }
  console.log(`Created ${seedData.habits.length} habits`);

  // Create tasks (subcollection)
  for (const task of seedData.tasks) {
    await db.collection('users').doc(userId).collection('tasks').add({
      ...task,
      createdAt: now,
      updatedAt: now,
    });
  }
  console.log(`Created ${seedData.tasks.length} tasks`);

  // Create rewards (subcollection)
  for (const reward of seedData.rewards) {
    await db.collection('users').doc(userId).collection('rewards').add({
      ...reward,
      createdAt: now,
      updatedAt: now,
    });
  }
  console.log(`Created ${seedData.rewards.length} rewards`);

  // Create punishments (subcollection)
  for (const punishment of seedData.punishments) {
    await db.collection('users').doc(userId).collection('punishments').add({
      ...punishment,
      createdAt: now,
      updatedAt: now,
    });
  }
  console.log(`Created ${seedData.punishments.length} punishments`);

  console.log('\nFirebase seeding completed!');
  console.log(`Email: ${seedData.user.email}`);
  console.log(`Password: ${seedData.user.password}`);
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
