export interface User {
  id: number;
  email: string;
  role: 'operator' | 'admin';
  display_name?: string;
  title?: string;
  department?: string;
  phone?: string;
  created_at: string;
}

export interface ProfileUpdateRequest {
  display_name?: string;
  title?: string;
  department?: string;
  phone?: string;
  current_password?: string;
  new_password?: string;
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
