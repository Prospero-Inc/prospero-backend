export interface PayloadType {
  email: string;
  userId: number;
  pending2FA?: boolean;
}

export type Enable2FAType = {
  secret: string;
  qr: string;
};
