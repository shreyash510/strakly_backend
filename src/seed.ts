import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  }),
});

const db = admin.firestore();

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function seed() {
  console.log('Seeding database...');

  const email = 'shreyash@gmail.com';
  const password = 'shreyash@510';
  const name = 'Shreyash';

  // Check if user already exists
  const existingUser = await db
    .collection('users')
    .where('email', '==', email)
    .get();

  if (!existingUser.empty) {
    console.log(`User ${email} already exists. Skipping...`);
    process.exit(0);
  }

  // Create user
  const userData = {
    name,
    email,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const userRef = await db.collection('users').add(userData);
  console.log(`User created with ID: ${userRef.id}`);
  console.log(`Email: ${email}`);
  console.log(`Password: ${password}`);

  console.log('Seeding completed!');
  process.exit(0);
}

seed().catch((error) => {
  console.error('Seeding failed:', error);
  process.exit(1);
});
