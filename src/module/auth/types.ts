/**
 * Every JWT signed with SECRET declares what it is for in its `typ` claim, and
 * each consumer accepts only its own type: JwtStrategy only `access`,
 * verifyLoginTwoFactor only `pre_auth`, the Gmail OAuth callback only
 * `oauth_state`. A token without the expected `typ` is rejected.
 */
export const TOKEN_TYPE = {
  Access: 'access',
  PreAuth: 'pre_auth',
  OAuthState: 'oauth_state',
} as const;

export type TokenType = (typeof TOKEN_TYPE)[keyof typeof TOKEN_TYPE];

export interface PayloadType {
  email: string;
  userId: number;
  typ: typeof TOKEN_TYPE.Access | typeof TOKEN_TYPE.PreAuth;
}

export type Enable2FAType = {
  secret: string;
  qr: string;
};
