export const PLAN_FEATURES = {
  CLIENT_MEMBERSHIP: 'client_membership',
  ATTENDANCE: 'attendance',
  CLASSES: 'classes',
  GUEST_VISITS: 'guest_visits',
  ANNOUNCEMENTS: 'announcements',
  APPOINTMENTS: 'appointments',
  STAFF_SALARY: 'staff_salary',
  LEADS_REFERRALS: 'leads_referrals',
  RESOURCES: 'resources',
  PRODUCTS_SALES: 'products_sales',
  INVENTORY: 'inventory',
  REPORTS: 'reports',
} as const;

export type PlanFeature = (typeof PLAN_FEATURES)[keyof typeof PLAN_FEATURES];
