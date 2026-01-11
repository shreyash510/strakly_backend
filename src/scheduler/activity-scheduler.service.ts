import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { DatabaseService } from '../database/database.service';
import { PostsService } from '../posts/posts.service';
import { seedUsers } from '../database/data/seed-data';

const postCategories = [
  'achievement',
  'milestone',
  'motivation',
  'reflection',
  'challenge',
] as const;

const postPrompts = [
  "Share a motivational thought about building good habits",
  "Celebrate a small win you achieved today",
  "Reflect on your personal growth journey",
  "Share a tip for staying consistent with goals",
  "Talk about overcoming a challenge",
  "Share your morning routine success",
  "Motivate others to keep pushing forward",
  "Share a lesson learned from a recent failure",
  "Celebrate reaching a streak milestone",
  "Share advice for maintaining work-life balance",
];

@Injectable()
export class ActivitySchedulerService {
  private readonly logger = new Logger(ActivitySchedulerService.name);
  private openai: OpenAI | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
    private readonly postsService: PostsService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
      this.logger.log('OpenAI initialized');
    } else {
      this.logger.warn('OPENAI_API_KEY not found - will use fallback posts');
    }
  }

  // Run every hour
  @Cron('0 * * * *')
  async handleHourlyActivity() {
    this.logger.log('Running hourly activity simulation...');

    try {
      // Pick a random seed user
      const randomUser = seedUsers[Math.floor(Math.random() * seedUsers.length)];
      this.logger.log(`Selected user: ${randomUser.email}`);

      // Find user in database
      const dbUser = await this.databaseService.findUserByEmail(randomUser.email);

      if (!dbUser) {
        this.logger.warn(`User ${randomUser.email} not found in database`);
        return;
      }

      const userId = dbUser.id;
      this.logger.log(`User ID: ${userId}`);

      // Create a post
      const postContent = await this.generatePostContent();
      const category = postCategories[Math.floor(Math.random() * postCategories.length)];

      const newPost = await this.postsService.createPost(userId, {
        content: postContent,
        category,
      });
      this.logger.log(`Created post: ${newPost.id}`);

      // Like a random post
      await this.likeRandomPost(userId);

      this.logger.log(`Activity simulation completed for ${randomUser.name}`);
    } catch (error) {
      this.logger.error('Error during activity simulation:', error);
    }
  }

  private async generatePostContent(): Promise<string> {
    // Try OpenAI first
    if (this.openai) {
      try {
        const prompt = postPrompts[Math.floor(Math.random() * postPrompts.length)];

        const completion = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are a user of a habit tracking and personal growth app called Strakly. Write short, authentic social media posts (1-3 sentences) about personal growth, habits, and self-improvement. Be casual and relatable. Do not use hashtags.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: 100,
          temperature: 0.8,
        });

        const content = completion.choices[0]?.message?.content?.trim();
        if (content) {
          return content;
        }
      } catch (error) {
        this.logger.warn('OpenAI error, using fallback:', error.message);
      }
    }

    // Fallback posts if OpenAI fails or is not configured
    return this.getFallbackPost();
  }

  private getFallbackPost(): string {
    const fallbackPosts = [
      "Just completed my morning routine! Starting the day with intention makes all the difference.",
      "Day 30 of my reading habit. Small steps lead to big changes!",
      "Missed a day on my streak but getting right back on track. Progress, not perfection!",
      "Feeling grateful for this community. Your posts keep me motivated!",
      "New week, new goals. Let's crush it together!",
      "Finally hit my goal of 10,000 steps daily for a whole week!",
      "The secret to building habits? Start so small you can't say no.",
      "Reflecting on how far I've come. 3 months ago, I couldn't imagine being here.",
      "Remember: consistency beats intensity every single time.",
      "Just meditated for 15 minutes. My mind feels so clear now!",
      "Celebrated a small win today - kept my streak alive even on a busy day!",
      "Learning that rest is part of the process, not the opposite of it.",
      "Started tracking my water intake. Game changer for energy levels!",
      "The best time to start was yesterday. The second best time is now.",
      "Grateful for another day to work on becoming better.",
    ];

    return fallbackPosts[Math.floor(Math.random() * fallbackPosts.length)];
  }

  private async likeRandomPost(userId: string): Promise<void> {
    try {
      // Get all posts
      const allPosts = await this.databaseService.getAllPosts(20);

      if (allPosts.length === 0) {
        this.logger.log('No posts available to like');
        return;
      }

      // Filter out user's own posts and already liked posts
      const postsToLike = allPosts.filter(
        (post) => post.userId !== userId &&
        !post.reactions.some((r) => r.userId === userId)
      );

      if (postsToLike.length === 0) {
        this.logger.log('No new posts to like');
        return;
      }

      // Pick a random post to like
      const randomPost = postsToLike[Math.floor(Math.random() * postsToLike.length)];

      // Like with a random reaction type
      const reactionTypes = ['like', 'love', 'celebrate', 'support', 'insightful'] as const;
      const randomReaction = reactionTypes[Math.floor(Math.random() * reactionTypes.length)];

      await this.postsService.toggleReaction(userId, randomPost.id, randomReaction);
      this.logger.log(`Liked post ${randomPost.id} with ${randomReaction}`);
    } catch (error) {
      this.logger.warn('Error liking random post:', error.message);
    }
  }

  // Manual trigger for testing
  async triggerActivitySimulation(): Promise<{ success: boolean; message: string }> {
    this.logger.log('Manually triggering activity simulation...');
    await this.handleHourlyActivity();
    return { success: true, message: 'Activity simulation completed' };
  }
}
