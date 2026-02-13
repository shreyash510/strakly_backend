import {
  BaseWearableProvider,
  WearableDataPoint,
  OAuthTokenResult,
  RefreshTokenResult,
} from './base.provider';

export class GoogleFitProvider extends BaseWearableProvider {
  readonly providerName = 'google_fit';

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly authBaseUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  private readonly tokenUrl = 'https://oauth2.googleapis.com/token';
  private readonly fitnessApiUrl = 'https://www.googleapis.com/fitness/v1';

  // Google Fit data source types
  private readonly DATA_SOURCES = {
    steps: 'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps',
    calories:
      'derived:com.google.calories.expended:com.google.android.gms:merge_calories_expended',
    activeMinutes:
      'derived:com.google.active_minutes:com.google.android.gms:merge_active_minutes',
    distance:
      'derived:com.google.distance.delta:com.google.android.gms:merge_distance_delta',
  };

  constructor() {
    super();
    this.clientId = process.env.GOOGLE_FIT_CLIENT_ID || '';
    this.clientSecret = process.env.GOOGLE_FIT_CLIENT_SECRET || '';
  }

  getAuthUrl(redirectUri: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope: [
        'https://www.googleapis.com/auth/fitness.activity.read',
        'https://www.googleapis.com/auth/fitness.body.read',
        'https://www.googleapis.com/auth/fitness.location.read',
        'openid',
        'profile',
      ].join(' '),
      access_type: 'offline',
      prompt: 'consent',
    });
    return `${this.authBaseUrl}?${params.toString()}`;
  }

  async handleCallback(
    code: string,
    redirectUri: string,
  ): Promise<OAuthTokenResult> {
    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }).toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Google Fit token exchange failed (${response.status}): ${errorBody}`,
      );
    }

    const data = await response.json();

    // Get user profile to retrieve provider user ID
    let providerUserId = 'unknown';
    try {
      const profileRes = await fetch(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        {
          headers: { Authorization: `Bearer ${data.access_token}` },
        },
      );
      if (profileRes.ok) {
        const profile = await profileRes.json();
        providerUserId = profile.id || 'unknown';
      }
    } catch {
      // Use fallback
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      providerUserId,
    };
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<RefreshTokenResult> {
    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }).toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Google Fit token refresh failed (${response.status}): ${errorBody}`,
      );
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      // Google may not always return a new refresh token
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  async fetchData(
    accessToken: string,
    startDate: Date,
    endDate: Date,
  ): Promise<WearableDataPoint[]> {
    const startTimeNanos = startDate.getTime() * 1_000_000;
    const endTimeNanos = endDate.getTime() * 1_000_000;
    const dataPoints: WearableDataPoint[] = [];

    // Build the aggregate request body
    const aggregateBody = {
      aggregateBy: [
        { dataSourceId: this.DATA_SOURCES.steps },
        { dataSourceId: this.DATA_SOURCES.calories },
        { dataSourceId: this.DATA_SOURCES.activeMinutes },
        { dataSourceId: this.DATA_SOURCES.distance },
      ],
      bucketByTime: { durationMillis: 86400000 }, // 1 day
      startTimeMillis: startDate.getTime(),
      endTimeMillis: endDate.getTime(),
    };

    try {
      const response = await fetch(
        `${this.fitnessApiUrl}/users/me/dataset:aggregate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(aggregateBody),
        },
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Google Fit aggregate request failed (${response.status}): ${errorBody}`,
        );
      }

      const data = await response.json();
      const buckets = data.bucket || [];

      for (const bucket of buckets) {
        const bucketStartMs = parseInt(bucket.startTimeMillis, 10);
        const recordedDate = this.formatDate(new Date(bucketStartMs));
        const recordedAt = new Date(bucketStartMs);

        for (const dataset of bucket.dataset || []) {
          const dataSourceId: string = dataset.dataSourceId || '';
          for (const point of dataset.point || []) {
            const values = point.value || [];
            if (values.length === 0) continue;

            const intVal = values[0].intVal;
            const fpVal = values[0].fpVal;
            const numericValue =
              intVal !== undefined && intVal !== null
                ? intVal
                : fpVal !== undefined && fpVal !== null
                  ? fpVal
                  : 0;

            if (numericValue <= 0) continue;

            if (dataSourceId.includes('step_count')) {
              dataPoints.push({
                dataType: 'steps',
                value: Math.round(numericValue),
                unit: 'steps',
                recordedAt,
                recordedDate,
              });
            } else if (dataSourceId.includes('calories.expended')) {
              dataPoints.push({
                dataType: 'calories_burned',
                value: Math.round(numericValue * 100) / 100,
                unit: 'kcal',
                recordedAt,
                recordedDate,
              });
            } else if (dataSourceId.includes('active_minutes')) {
              dataPoints.push({
                dataType: 'active_minutes',
                value: Math.round(numericValue),
                unit: 'minutes',
                recordedAt,
                recordedDate,
              });
            } else if (dataSourceId.includes('distance.delta')) {
              const km = Math.round((numericValue / 1000) * 100) / 100;
              dataPoints.push({
                dataType: 'distance_km',
                value: km,
                unit: 'km',
                recordedAt,
                recordedDate,
              });
            }
          }
        }
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('Google Fit aggregate request failed')
      ) {
        throw error;
      }
      // Silently skip other errors
    }

    return dataPoints;
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
