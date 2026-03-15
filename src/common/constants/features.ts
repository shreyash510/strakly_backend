export const PLAN_FEATURES = {
  AI_CHAT: 'ai_chat',
  DIET_PLANNING: 'diet_planning',
  BODY_METRICS: 'body_metrics',
  SALARY_MANAGEMENT: 'salary_management',
  ACTIVITY_LOGS: 'activity_logs',
  ANNOUNCEMENTS: 'announcements',
  OFFERS: 'offers',
  PAYMENT_GATEWAY: 'payment_gateway',
  ADVANCED_REPORTS: 'advanced_reports',
  TRAINER_ASSIGNMENT: 'trainer_assignment',
  AMENITIES_MANAGEMENT: 'amenities_management',
  POS_RETAIL: 'pos_retail',

  EQUIPMENT_TRACKING: 'equipment_tracking',
  // Operations
  CLASS_SCHEDULING: 'class_scheduling',
  APPOINTMENT_BOOKING: 'appointment_booking',
  GUEST_DAY_PASS: 'guest_day_pass',
  LEAD_CRM: 'lead_crm',
  REFERRAL_TRACKING: 'referral_tracking',
  DIGITAL_WAIVERS: 'digital_waivers',
} as const;

export type PlanFeature = (typeof PLAN_FEATURES)[keyof typeof PLAN_FEATURES];
