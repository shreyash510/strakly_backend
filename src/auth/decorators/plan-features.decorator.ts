import { SetMetadata } from '@nestjs/common';
import type { PlanFeature } from '../../common/constants/features';

export const PLAN_FEATURES_KEY = 'plan_features';
export const PlanFeatures = (...features: PlanFeature[]) =>
  SetMetadata(PLAN_FEATURES_KEY, features);
