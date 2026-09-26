export interface AccessTokenResponse {
  accessToken: string;
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
