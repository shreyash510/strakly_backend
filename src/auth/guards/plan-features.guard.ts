import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PLAN_FEATURES_KEY } from '../decorators/plan-features.decorator';
import { PrismaService } from '../../database/prisma.service';
import type { PlanFeature } from '../../common/constants/features';

@Injectable()
export class PlanFeaturesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeatures = this.reflector.getAllAndOverride<PlanFeature[]>(
      PLAN_FEATURES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredFeatures || requiredFeatures.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Superadmins bypass plan checks
    if (user?.isSuperAdmin) {
      return true;
    }

    const gymId = user?.gymId;
    if (!gymId) {
      throw new ForbiddenException('Gym context required for this feature');
    }

    const subscription = await this.prisma.saasGymSubscription.findUnique({
      where: { gymId },
      include: { plan: true },
    });

    if (!subscription || !subscription.plan) {
      throw new ForbiddenException(
        'No active subscription found. Please subscribe to a plan to access this feature.',
      );
    }

    const planFeatures: string[] = Array.isArray(subscription.plan.features)
      ? (subscription.plan.features as string[])
      : [];

    const hasAllFeatures = requiredFeatures.every((feature) =>
      planFeatures.includes(feature),
    );

    if (!hasAllFeatures) {
      throw new ForbiddenException(
        `This feature is not available on your ${subscription.plan.name} plan. Please upgrade to access it.`,
      );
    }

    return true;
  }
}
