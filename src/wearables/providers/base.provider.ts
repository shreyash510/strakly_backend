export interface WearableDataPoint {
  dataType: string;
  value: number;
  unit: string;
  recordedAt: Date;
  recordedDate: string;
  metadata?: any;
}

export interface OAuthTokenResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  providerUserId: string;
}

export interface RefreshTokenResult {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export abstract class BaseWearableProvider {
  abstract readonly providerName: string;

  abstract getAuthUrl(redirectUri: string): string;

  abstract handleCallback(
    code: string,
    redirectUri: string,
  ): Promise<OAuthTokenResult>;

  abstract refreshAccessToken(
    refreshToken: string,
  ): Promise<RefreshTokenResult>;

  abstract fetchData(
    accessToken: string,
    startDate: Date,
    endDate: Date,
  ): Promise<WearableDataPoint[]>;
}
