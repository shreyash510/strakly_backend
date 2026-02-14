import {
  BaseWearableProvider,
  WearableDataPoint,
  OAuthTokenResult,
  RefreshTokenResult,
} from './base.provider';

export class FitbitProvider extends BaseWearableProvider {
  readonly providerName = 'fitbit';

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly authBaseUrl = 'https://www.fitbit.com/oauth2/authorize';
  private readonly tokenUrl = 'https://api.fitbit.com/oauth2/token';
  private readonly apiBaseUrl = 'https://api.fitbit.com';

  constructor() {
    super();
    this.clientId = process.env.FITBIT_CLIENT_ID || '';
    this.clientSecret = process.env.FITBIT_CLIENT_SECRET || '';
  }

  private getBasicAuthHeader(): string {
    const credentials = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString('base64');
    return `Basic ${credentials}`;
  }

  getAuthUrl(redirectUri: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope:
        'activity heartrate sleep profile settings',
      expires_in: '604800',
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
        Authorization: this.getBasicAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Fitbit token exchange failed (${response.status}): ${errorBody}`,
      );
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      providerUserId: data.user_id,
    };
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<RefreshTokenResult> {
    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: this.getBasicAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Fitbit token refresh failed (${response.status}): ${errorBody}`,
      );
    }

    const data = await response.json();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  }

  async fetchData(
    accessToken: string,
    startDate: Date,
    endDate: Date,
  ): Promise<WearableDataPoint[]> {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    };

    const startStr = this.formatDate(startDate);
    const endStr = this.formatDate(endDate);
    const dataPoints: WearableDataPoint[] = [];

    // Fetch steps
    try {
      const stepsRes = await fetch(
        `${this.apiBaseUrl}/1/user/-/activities/steps/date/${startStr}/${endStr}.json`,
        { headers },
      );
      if (stepsRes.ok) {
        const stepsData = await stepsRes.json();
        const steps = stepsData['activities-steps'] || [];
        for (const entry of steps) {
          const value = parseInt(entry.value, 10);
          if (value > 0) {
            dataPoints.push({
              dataType: 'steps',
              value,
              unit: 'steps',
              recordedAt: new Date(entry.dateTime),
              recordedDate: entry.dateTime,
            });
          }
        }
      }
    } catch {
      // Skip on error
    }

    // Fetch heart rate
    try {
      const hrRes = await fetch(
        `${this.apiBaseUrl}/1/user/-/activities/heart/date/${startStr}/${endStr}.json`,
        { headers },
      );
      if (hrRes.ok) {
        const hrData = await hrRes.json();
        const heartRates = hrData['activities-heart'] || [];
        for (const entry of heartRates) {
          const restingHr = entry.value?.restingHeartRate;
          if (restingHr) {
            dataPoints.push({
              dataType: 'heart_rate',
              value: restingHr,
              unit: 'bpm',
              recordedAt: new Date(entry.dateTime),
              recordedDate: entry.dateTime,
              metadata: { zones: entry.value?.heartRateZones },
            });
          }
        }
      }
    } catch {
      // Skip on error
    }

    // Fetch calories burned
    try {
      const calRes = await fetch(
        `${this.apiBaseUrl}/1/user/-/activities/calories/date/${startStr}/${endStr}.json`,
        { headers },
      );
      if (calRes.ok) {
        const calData = await calRes.json();
        const calories = calData['activities-calories'] || [];
        for (const entry of calories) {
          const value = parseFloat(entry.value);
          if (value > 0) {
            dataPoints.push({
              dataType: 'calories_burned',
              value,
              unit: 'kcal',
              recordedAt: new Date(entry.dateTime),
              recordedDate: entry.dateTime,
            });
          }
        }
      }
    } catch {
      // Skip on error
    }

    // Fetch sleep
    try {
      const sleepRes = await fetch(
        `${this.apiBaseUrl}/1.2/user/-/sleep/date/${startStr}/${endStr}.json`,
        { headers },
      );
      if (sleepRes.ok) {
        const sleepData = await sleepRes.json();
        const sleepLogs = sleepData.sleep || [];
        // Group sleep by date
        const sleepByDate: Record<string, number> = {};
        for (const log of sleepLogs) {
          const date = log.dateOfSleep;
          const minutes = log.minutesAsleep || 0;
          sleepByDate[date] = (sleepByDate[date] || 0) + minutes;
        }
        for (const [date, minutes] of Object.entries(sleepByDate)) {
          const hours = Math.round((minutes / 60) * 100) / 100;
          if (hours > 0) {
            dataPoints.push({
              dataType: 'sleep_hours',
              value: hours,
              unit: 'hours',
              recordedAt: new Date(date),
              recordedDate: date,
              metadata: { totalMinutes: minutes },
            });
          }
        }
      }
    } catch {
      // Skip on error
    }

    // Fetch active minutes (fairly active + very active)
    try {
      const fairlyRes = await fetch(
        `${this.apiBaseUrl}/1/user/-/activities/minutesFairlyActive/date/${startStr}/${endStr}.json`,
        { headers },
      );
      const veryRes = await fetch(
        `${this.apiBaseUrl}/1/user/-/activities/minutesVeryActive/date/${startStr}/${endStr}.json`,
        { headers },
      );

      if (fairlyRes.ok && veryRes.ok) {
        const fairlyData = await fairlyRes.json();
        const veryData = await veryRes.json();
        const fairlyMinutes =
          fairlyData['activities-minutesFairlyActive'] || [];
        const veryMinutes = veryData['activities-minutesVeryActive'] || [];

        const minutesByDate: Record<string, { fairly: number; very: number }> =
          {};
        for (const entry of fairlyMinutes) {
          minutesByDate[entry.dateTime] = {
            fairly: parseInt(entry.value, 10),
            very: 0,
          };
        }
        for (const entry of veryMinutes) {
          if (!minutesByDate[entry.dateTime]) {
            minutesByDate[entry.dateTime] = { fairly: 0, very: 0 };
          }
          minutesByDate[entry.dateTime].very = parseInt(entry.value, 10);
        }

        for (const [date, mins] of Object.entries(minutesByDate)) {
          const total = mins.fairly + mins.very;
          if (total > 0) {
            dataPoints.push({
              dataType: 'active_minutes',
              value: total,
              unit: 'minutes',
              recordedAt: new Date(date),
              recordedDate: date,
              metadata: {
                fairlyActive: mins.fairly,
                veryActive: mins.very,
              },
            });
          }
        }
      }
    } catch {
      // Skip on error
    }

    return dataPoints;
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
