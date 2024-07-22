export interface AccessTokenResponse {
  accessToken: string;
  user: {
    id: number;
    name: string;
    email: string;
    username: string;
  };
}
