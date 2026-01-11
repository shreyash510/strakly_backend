import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

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

  // Rewards & Punishments
  totalRewards: number;
  claimedRewards: number;
  pendingPunishments: number;
}

export interface RecentActivity {
  type: 'goal' | 'habit' | 'task' | 'challenge' | 'reward' | 'punishment';
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
  constructor(private readonly databaseService: DatabaseService) {}

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
    // Fetch all data in parallel
    const [
      goals,
      habits,
      tasks,
      streaksData,
      challenges,
      friends,
      friendRequests,
      rewards,
      punishments,
    ] = await Promise.all([
      this.databaseService.getCollection<any>('goals', userId),
      this.databaseService.getCollection<any>('habits', userId),
      this.databaseService.getCollection<any>('tasks', userId),
      this.databaseService.getDocument<any>('current-streaks', userId, 'user-streaks'),
      this.databaseService.getUserChallenges(userId),
      this.databaseService.getCollection<any>('friends', userId),
      this.databaseService.getPendingFriendRequests(userId),
      this.databaseService.getCollection<any>('rewards', userId),
      this.databaseService.getCollection<any>('punishments', userId),
    ]);

    // Process goals
    const totalGoals = goals.length;
    const completedGoals = goals.filter((g: any) => g.status === 'completed').length;
    const inProgressGoals = goals.filter((g: any) => g.status === 'in_progress').length;
    const goalsProgress = totalGoals > 0
      ? Math.round(goals.reduce((sum: number, g: any) => sum + (g.progress || 0), 0) / totalGoals)
      : 0;

    // Process habits
    const totalHabits = habits.length;
    const activeHabits = habits.filter((h: any) => h.isActive).length;
    const goodHabits = habits.filter((h: any) => h.isGoodHabit).length;
    const badHabits = habits.filter((h: any) => !h.isGoodHabit).length;

    // Process tasks
    const today = new Date().toISOString().split('T')[0];
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t: any) => t.status === 'completed').length;
    const pendingTasks = tasks.filter((t: any) => t.status === 'pending').length;
    const todayTasks = tasks.filter((t: any) => t.dueDate?.startsWith(today)).length;

    // Process streaks
    let totalCurrentStreak = 0;
    let longestStreak = 0;
    let activeStreaks = 0;

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

    // Process challenges
    const activeChallenges = challenges.filter((c: any) => c.status === 'active').length;
    const upcomingChallenges = challenges.filter((c: any) => c.status === 'upcoming').length;
    const completedChallenges = challenges.filter((c: any) => c.status === 'completed');
    const challengesWon = completedChallenges.filter((c: any) => c.winnerId === userId).length;
    const challengesLost = completedChallenges.filter((c: any) => c.winnerId && c.winnerId !== userId).length;

    // Process friends
    const totalFriends = friends.length;
    const pendingFriendRequests = friendRequests.length;

    // Process rewards
    const totalRewards = rewards.length;
    const claimedRewards = rewards.filter((r: any) => r.status === 'claimed').length;

    // Process punishments
    const pendingPunishments = punishments.filter((p: any) => p.status === 'pending').length;

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
      totalRewards,
      claimedRewards,
      pendingPunishments,
    };
  }

  async getRecentActivity(userId: string, limit = 10): Promise<RecentActivity[]> {
    // Fetch recent items from each collection
    const [goals, habits, tasks, rewards] = await Promise.all([
      this.databaseService.getCollection<any>('goals', userId),
      this.databaseService.getCollection<any>('habits', userId),
      this.databaseService.getCollection<any>('tasks', userId),
      this.databaseService.getCollection<any>('rewards', userId),
    ]);

    const activities: RecentActivity[] = [];

    // Process goals (take last 5)
    goals.slice(0, 5).forEach((data: any) => {
      activities.push({
        type: 'goal',
        title: data.title,
        action: data.status === 'completed' ? 'completed' : 'updated',
        timestamp: data.updatedAt,
      });
    });

    // Process habits (take last 5)
    habits.slice(0, 5).forEach((data: any) => {
      activities.push({
        type: 'habit',
        title: data.title,
        action: 'tracked',
        timestamp: data.updatedAt,
      });
    });

    // Process tasks (take last 5)
    tasks.slice(0, 5).forEach((data: any) => {
      activities.push({
        type: 'task',
        title: data.title,
        action: data.status === 'completed' ? 'completed' : 'updated',
        timestamp: data.updatedAt,
      });
    });

    // Process rewards (take last 5)
    rewards.slice(0, 5).forEach((data: any) => {
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
    const streaksData = await this.databaseService.getDocument<any>(
      'current-streaks',
      userId,
      'user-streaks',
    );

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
