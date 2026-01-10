import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import * as admin from 'firebase-admin';

export interface DashboardStats {
  // Goals
  totalGoals: number;
  completedGoals: number;
  inProgressGoals: number;
  goalsProgress: number; // Average progress percentage

  // Habits
  totalHabits: number;
  activeHabits: number;
  goodHabits: number;
  badHabits: number;

  // Tasks
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  todayTasks: number;

  // Streaks
  totalCurrentStreak: number;
  longestStreak: number;
  activeStreaks: number;

  // Challenges
  activeChallenges: number;
  challengesWon: number;
  challengesLost: number;
  upcomingChallenges: number;

  // Social
  totalFriends: number;
  pendingFriendRequests: number;

  // Mistakes
  totalMistakes: number;
  unresolvedMistakes: number;

  // Rewards & Punishments
  totalRewards: number;
  claimedRewards: number;
  pendingPunishments: number;
}

export interface RecentActivity {
  type: 'goal' | 'habit' | 'task' | 'challenge' | 'mistake' | 'reward' | 'punishment';
  title: string;
  action: string;
  timestamp: string;
}

export interface DashboardData {
  stats: DashboardStats;
  recentActivity: RecentActivity[];
  streakSummary: {
    itemId: string;
    itemName: string;
    itemType: string;
    streak: number;
    longestStreak: number;
  }[];
}

@Injectable()
export class DashboardService {
  constructor(private readonly firebaseService: FirebaseService) {}

  private getDb(): admin.firestore.Firestore {
    return this.firebaseService.getFirestore();
  }

  async getDashboardData(userId: string): Promise<DashboardData> {
    const [stats, recentActivity, streakSummary] = await Promise.all([
      this.getStats(userId),
      this.getRecentActivity(userId),
      this.getStreakSummary(userId),
    ]);

    return {
      stats,
      recentActivity,
      streakSummary,
    };
  }

  async getStats(userId: string): Promise<DashboardStats> {
    const db = this.getDb();
    const userRef = db.collection('users').doc(userId);

    // Fetch all data in parallel
    const [
      goalsSnapshot,
      habitsSnapshot,
      tasksSnapshot,
      streaksDoc,
      challengesSnapshot,
      friendsSnapshot,
      friendRequestsSnapshot,
      mistakesSnapshot,
      rewardsSnapshot,
      punishmentsSnapshot,
    ] = await Promise.all([
      userRef.collection('goals').get(),
      userRef.collection('habits').get(),
      userRef.collection('tasks').get(),
      userRef.collection('current-streaks').doc('user-streaks').get(),
      db.collection('challenges').where('participantIds', 'array-contains', userId).get(),
      userRef.collection('friends').get(),
      db.collection('friendRequests').where('toUserId', '==', userId).where('status', '==', 'pending').get(),
      userRef.collection('mistakes').get(),
      userRef.collection('rewards').get(),
      userRef.collection('punishments').get(),
    ]);

    // Process goals
    const goals = goalsSnapshot.docs.map((d) => d.data());
    const totalGoals = goals.length;
    const completedGoals = goals.filter((g) => g.status === 'completed').length;
    const inProgressGoals = goals.filter((g) => g.status === 'in_progress').length;
    const goalsProgress = totalGoals > 0
      ? Math.round(goals.reduce((sum, g) => sum + (g.progress || 0), 0) / totalGoals)
      : 0;

    // Process habits
    const habits = habitsSnapshot.docs.map((d) => d.data());
    const totalHabits = habits.length;
    const activeHabits = habits.filter((h) => h.isActive).length;
    const goodHabits = habits.filter((h) => h.isGoodHabit).length;
    const badHabits = habits.filter((h) => !h.isGoodHabit).length;

    // Process tasks
    const tasks = tasksSnapshot.docs.map((d) => d.data());
    const today = new Date().toISOString().split('T')[0];
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'completed').length;
    const pendingTasks = tasks.filter((t) => t.status === 'pending').length;
    const todayTasks = tasks.filter((t) => t.dueDate?.startsWith(today)).length;

    // Process streaks
    let totalCurrentStreak = 0;
    let longestStreak = 0;
    let activeStreaks = 0;

    if (streaksDoc.exists) {
      const streaksData = streaksDoc.data();
      if (streaksData?.items) {
        const items = Object.values(streaksData.items as Record<string, any>);
        items.forEach((item) => {
          totalCurrentStreak += item.streak || 0;
          if ((item.streak || 0) > 0) activeStreaks++;
          if ((item.longestStreak || 0) > longestStreak) {
            longestStreak = item.longestStreak;
          }
        });
      }
    }

    // Process challenges
    const challenges = challengesSnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    const activeChallenges = challenges.filter((c: any) => c.status === 'active').length;
    const upcomingChallenges = challenges.filter((c: any) => c.status === 'upcoming').length;
    const completedChallenges = challenges.filter((c: any) => c.status === 'completed');
    const challengesWon = completedChallenges.filter((c: any) => c.winnerId === userId).length;
    const challengesLost = completedChallenges.filter((c: any) => c.winnerId && c.winnerId !== userId).length;

    // Process friends
    const totalFriends = friendsSnapshot.size;
    const pendingFriendRequests = friendRequestsSnapshot.size;

    // Process mistakes
    const mistakes = mistakesSnapshot.docs.map((d) => d.data());
    const totalMistakes = mistakes.length;
    const unresolvedMistakes = mistakes.filter((m) => !m.isResolved).length;

    // Process rewards
    const rewards = rewardsSnapshot.docs.map((d) => d.data());
    const totalRewards = rewards.length;
    const claimedRewards = rewards.filter((r) => r.status === 'claimed').length;

    // Process punishments
    const punishments = punishmentsSnapshot.docs.map((d) => d.data());
    const pendingPunishments = punishments.filter((p) => p.status === 'pending').length;

    return {
      totalGoals,
      completedGoals,
      inProgressGoals,
      goalsProgress,
      totalHabits,
      activeHabits,
      goodHabits,
      badHabits,
      totalTasks,
      completedTasks,
      pendingTasks,
      todayTasks,
      totalCurrentStreak,
      longestStreak,
      activeStreaks,
      activeChallenges,
      challengesWon,
      challengesLost,
      upcomingChallenges,
      totalFriends,
      pendingFriendRequests,
      totalMistakes,
      unresolvedMistakes,
      totalRewards,
      claimedRewards,
      pendingPunishments,
    };
  }

  async getRecentActivity(userId: string, limit = 10): Promise<RecentActivity[]> {
    const db = this.getDb();
    const userRef = db.collection('users').doc(userId);

    // Fetch recent items from each collection
    const [
      goalsSnapshot,
      habitsSnapshot,
      tasksSnapshot,
      mistakesSnapshot,
      rewardsSnapshot,
    ] = await Promise.all([
      userRef.collection('goals').orderBy('updatedAt', 'desc').limit(5).get(),
      userRef.collection('habits').orderBy('updatedAt', 'desc').limit(5).get(),
      userRef.collection('tasks').orderBy('updatedAt', 'desc').limit(5).get(),
      userRef.collection('mistakes').orderBy('updatedAt', 'desc').limit(5).get(),
      userRef.collection('rewards').orderBy('updatedAt', 'desc').limit(5).get(),
    ]);

    const activities: RecentActivity[] = [];

    // Process goals
    goalsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      activities.push({
        type: 'goal',
        title: data.title,
        action: data.status === 'completed' ? 'completed' : 'updated',
        timestamp: data.updatedAt,
      });
    });

    // Process habits
    habitsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      activities.push({
        type: 'habit',
        title: data.title,
        action: 'tracked',
        timestamp: data.updatedAt,
      });
    });

    // Process tasks
    tasksSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      activities.push({
        type: 'task',
        title: data.title,
        action: data.status === 'completed' ? 'completed' : 'updated',
        timestamp: data.updatedAt,
      });
    });

    // Process mistakes
    mistakesSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      activities.push({
        type: 'mistake',
        title: data.title,
        action: data.isResolved ? 'resolved' : 'logged',
        timestamp: data.updatedAt,
      });
    });

    // Process rewards
    rewardsSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      activities.push({
        type: 'reward',
        title: data.reward,
        action: data.status === 'claimed' ? 'claimed' : 'progress',
        timestamp: data.updatedAt,
      });
    });

    // Sort by timestamp and limit
    activities.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return activities.slice(0, limit);
  }

  async getStreakSummary(userId: string): Promise<{
    itemId: string;
    itemName: string;
    itemType: string;
    streak: number;
    longestStreak: number;
  }[]> {
    const db = this.getDb();
    const streaksDoc = await db
      .collection('users')
      .doc(userId)
      .collection('current-streaks')
      .doc('user-streaks')
      .get();

    if (!streaksDoc.exists) {
      return [];
    }

    const streaksData = streaksDoc.data();
    if (!streaksData?.items) {
      return [];
    }

    const items = Object.entries(streaksData.items as Record<string, any>).map(
      ([itemId, item]) => ({
        itemId,
        itemName: item.itemName || 'Unknown',
        itemType: item.itemType || 'unknown',
        streak: item.streak || 0,
        longestStreak: item.longestStreak || 0,
      }),
    );

    // Sort by current streak descending
    items.sort((a, b) => b.streak - a.streak);

    return items.slice(0, 10); // Top 10 streaks
  }
}
