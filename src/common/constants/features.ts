export const PLAN_FEATURES = {
  AI_CHAT: 'ai_chat',
  ADVANCED_AI_CHAT: 'advanced_ai_chat',
  DIET_PLANNING: 'diet_planning',
  BODY_METRICS: 'body_metrics',
  SALARY_MANAGEMENT: 'salary_management',
  DATA_MIGRATION: 'data_migration',
  ACTIVITY_LOGS: 'activity_logs',
  ANNOUNCEMENTS: 'announcements',
  OFFERS: 'offers',
  PAYMENT_GATEWAY: 'payment_gateway',
  ADVANCED_REPORTS: 'advanced_reports',
  TRAINER_ASSIGNMENT: 'trainer_assignment',
  AMENITIES_MANAGEMENT: 'amenities_management',
} as const;

export type PlanFeature = (typeof PLAN_FEATURES)[keyof typeof PLAN_FEATURES];
