import { Request } from 'express';
import { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

/**
 * Express Request with JWT-authenticated user attached.
 * Use in controllers: @Request() req: AuthenticatedRequest
 */
export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

/**
 * Valid types for raw SQL parameterized query values.
 * Use instead of any[]: const values: SqlValue[] = []
 */
export type SqlValue = string | number | boolean | Date | null | undefined | number[] | string[];
