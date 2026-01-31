/**
 * Attendance Code Utility Functions
 * Centralized attendance code generation
 */
import { ATTENDANCE_CODE_CONFIG } from '../constants';
import { TenantService } from '../../tenant/tenant.service';

/**
 * Generate a unique 4-digit attendance code for a gym
 * @param gymId - Gym ID to generate code for
 * @param tenantService - TenantService instance for database queries
 * @returns Unique attendance code
 */
export async function generateUniqueAttendanceCode(
  gymId: number,
  tenantService: TenantService,
): Promise<string> {
  const { BATCH_SIZE, MAX_ATTEMPTS, LENGTH, FALLBACK_LENGTH } =
    ATTENDANCE_CODE_CONFIG;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    /* Generate batch of random codes */
    const candidates: string[] = [];
    const min = Math.pow(10, LENGTH - 1);
    const max = Math.pow(10, LENGTH) - 1;

    for (let i = 0; i < BATCH_SIZE; i++) {
      const code = String(Math.floor(min + Math.random() * (max - min + 1)));
      candidates.push(code);
    }

    /* Check which codes already exist in tenant schema */
    const existing = await tenantService.executeInTenant(
      gymId,
      async (client) => {
        const result = await client.query(
          `SELECT attendance_code FROM users WHERE attendance_code = ANY($1)`,
          [candidates],
        );
        return result.rows.map((r: any) => r.attendance_code);
      },
    );

    const existingCodes = new Set(existing);

    /* Return first available code */
    for (const code of candidates) {
      if (!existingCodes.has(code)) {
        return code;
      }
    }
  }

  /* Fallback: generate longer code if space is exhausted */
  const fallbackMin = Math.pow(10, FALLBACK_LENGTH - 1);
  const fallbackMax = Math.pow(10, FALLBACK_LENGTH) - 1;
  return String(
    Math.floor(fallbackMin + Math.random() * (fallbackMax - fallbackMin + 1)),
  );
}
