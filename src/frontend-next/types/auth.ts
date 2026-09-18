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
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
