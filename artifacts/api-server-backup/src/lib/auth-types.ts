export interface LoginResult {
  success: boolean;
  userId?: string;
  username?: string;
  fullName?: string;
  profilePicUrl?: string;
  isVerified?: boolean;
  error?: string;
  errorType?: string;
  checkpointUrl?: string;
}
