import { Client } from 'pg';

export async function up(client: Client, schemaName: string): Promise<void> {
  // ─── 1. Seed cancellation reasons ───────────────────────────────────────────
  const cancellationReasons = [
    { code: 'cost', label: 'Too Expensive', display_order: 1 },
    { code: 'relocation', label: 'Relocating / Moving', display_order: 2 },
    { code: 'injury', label: 'Injury / Health Issue', display_order: 3 },
    { code: 'dissatisfied', label: 'Dissatisfied with Service', display_order: 4 },
    { code: 'schedule_conflict', label: 'Schedule Conflict', display_order: 5 },
    { code: 'switching_gym', label: 'Switching to Another Gym', display_order: 6 },
    { code: 'personal', label: 'Personal Reasons', display_order: 7 },
    { code: 'other', label: 'Other', display_order: 8 },
  ];

  for (const reason of cancellationReasons) {
    await client.query(
      `INSERT INTO "${schemaName}"."cancellation_reasons" (code, label, display_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (code) DO NOTHING`,
      [reason.code, reason.label, reason.display_order],
    );
  }

  // ─── 2. Seed lead sources ──────────────────────────────────────────────────
  const leadSources = [
    { code: 'walk_in', name: 'Walk-in' },
    { code: 'website', name: 'Website' },
    { code: 'social_media', name: 'Social Media' },
    { code: 'referral', name: 'Referral' },
    { code: 'ad_campaign', name: 'Ad Campaign' },
    { code: 'google', name: 'Google' },
    { code: 'instagram', name: 'Instagram' },
    { code: 'other', name: 'Other' },
  ];

  for (const source of leadSources) {
    await client.query(
      `INSERT INTO "${schemaName}"."lead_sources" (code, name)
       VALUES ($1, $2)
       ON CONFLICT (code) DO NOTHING`,
      [source.code, source.name],
    );
  }

  // ─── 3. Seed product categories ────────────────────────────────────────────
  const existingCategories = await client.query(
    `SELECT COUNT(*) as count FROM "${schemaName}"."product_categories" WHERE is_deleted = FALSE`,
  );

  if (parseInt(existingCategories.rows[0].count) === 0) {
    const productCategories = [
      { name: 'Supplements', description: 'Protein, pre-workout, vitamins', display_order: 1 },
      { name: 'Beverages', description: 'Water, energy drinks, shakes', display_order: 2 },
      { name: 'Apparel', description: 'T-shirts, shorts, gym wear', display_order: 3 },
      { name: 'Accessories', description: 'Gloves, bands, bottles', display_order: 4 },
      { name: 'Snacks', description: 'Protein bars, healthy snacks', display_order: 5 },
    ];

    for (const cat of productCategories) {
      await client.query(
        `INSERT INTO "${schemaName}"."product_categories" (name, description, display_order)
         VALUES ($1, $2, $3)`,
        [cat.name, cat.description, cat.display_order],
      );
    }
  }

  // ─── 4. Seed loyalty tiers ─────────────────────────────────────────────────
  const existingTiers = await client.query(
    `SELECT COUNT(*) as count FROM "${schemaName}"."loyalty_tiers"`,
  );

  if (parseInt(existingTiers.rows[0].count) === 0) {
    const loyaltyTiers = [
      { name: 'Bronze', min_points: 0, multiplier: 1.00, color: '#CD7F32', display_order: 1, benefits: '{"discount_pct":0}' },
      { name: 'Silver', min_points: 500, multiplier: 1.25, color: '#C0C0C0', display_order: 2, benefits: '{"discount_pct":5}' },
      { name: 'Gold', min_points: 2000, multiplier: 1.50, color: '#FFD700', display_order: 3, benefits: '{"discount_pct":10,"priority_booking":true}' },
      { name: 'Platinum', min_points: 5000, multiplier: 2.00, color: '#E5E4E2', display_order: 4, benefits: '{"discount_pct":15,"priority_booking":true,"free_guest_passes":2}' },
    ];

    for (const tier of loyaltyTiers) {
      await client.query(
        `INSERT INTO "${schemaName}"."loyalty_tiers" (name, min_points, multiplier, color, display_order, benefits)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [tier.name, tier.min_points, tier.multiplier, tier.color, tier.display_order, tier.benefits],
      );
    }
  }

  // ─── 5. Seed default plans ─────────────────────────────────────────────────
  const existingPlans = await client.query(
    `SELECT COUNT(*) as count FROM "${schemaName}"."plans"`,
  );

  if (parseInt(existingPlans.rows[0].count) === 0) {
    const defaultPlans = [
      {
        code: 'monthly',
        name: 'Monthly Plan',
        description: 'Perfect for getting started with your fitness journey',
        duration_value: 30,
        duration_type: 'days',
        price: 999,
        features: JSON.stringify([
          'Full gym access',
          'Basic equipment usage',
          'Locker room access',
          'Fitness assessment',
        ]),
        display_order: 1,
        is_featured: false,
      },
      {
        code: 'quarterly',
        name: 'Quarterly Plan',
        description: 'Our most popular plan with great value for committed members',
        duration_value: 90,
        duration_type: 'days',
        price: 2499,
        features: JSON.stringify([
          'Full gym access',
          'All equipment usage',
          'Locker room access',
          'Fitness assessment',
          '1 Personal training session',
          'Diet consultation',
        ]),
        display_order: 2,
        is_featured: true,
      },
      {
        code: 'annual',
        name: 'Annual Plan',
        description: 'Best value for long-term fitness commitment',
        duration_value: 365,
        duration_type: 'days',
        price: 7999,
        features: JSON.stringify([
          'Full gym access',
          'All equipment usage',
          'Locker room access',
          'Monthly fitness assessment',
          '4 Personal training sessions',
          'Diet consultation',
          'Priority booking',
          'Guest passes (2/month)',
        ]),
        display_order: 3,
        is_featured: false,
      },
    ];

    for (const plan of defaultPlans) {
      await client.query(
        `INSERT INTO "${schemaName}"."plans"
         (code, name, description, duration_value, duration_type, price, features, display_order, is_featured, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true)
         ON CONFLICT (code) DO NOTHING`,
        [
          plan.code,
          plan.name,
          plan.description,
          plan.duration_value,
          plan.duration_type,
          plan.price,
          plan.features,
          plan.display_order,
          plan.is_featured,
        ],
      );
    }
  }
}
