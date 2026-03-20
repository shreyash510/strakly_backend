export const PLAN_FEATURES = {
  DIET_PLANNING: 'diet_planning',
  BODY_METRICS: 'body_metrics',
  SALARY_MANAGEMENT: 'salary_management',
  ANNOUNCEMENTS: 'announcements',
  OFFERS: 'offers',
  PAYMENT_GATEWAY: 'payment_gateway',
  AMENITIES_MANAGEMENT: 'amenities_management',
  POS_RETAIL: 'pos_retail',

  EQUIPMENT_TRACKING: 'equipment_tracking',
  // Operations
  CLASS_SCHEDULING: 'class_scheduling',
  APPOINTMENT_BOOKING: 'appointment_booking',
  GUEST_DAY_PASS: 'guest_day_pass',
  REFERRAL_TRACKING: 'referral_tracking',
} as const;

export type PlanFeature = (typeof PLAN_FEATURES)[keyof typeof PLAN_FEATURES];
