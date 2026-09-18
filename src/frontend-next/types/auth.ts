export interface User {
  id: number;
  /** Backend defaults this to "Operator" when signup doesn't supply one. */
  display_name?: string;
  email: string;
  role: 'operator' | 'admin';
  created_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface SignupRequest {
  display_name: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  /** Short-lived bearer token, held in memory only. The long-lived refresh
   *  token arrives as an HttpOnly cookie and is never visible to JS. */
  access_token: string;
  token_type: string;
  expires_in: number;
  csrf_token: string;
  user: User;
}
