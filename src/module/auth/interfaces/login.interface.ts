export interface AccessTokenResponse {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  user: {
    id: number;
    name: string;
    email: string;
    username: string;
  };
}

export interface RequiresTwoFactorResponse {
  requires2FA: true;
  preAuthToken: string;
  message: string;
}
