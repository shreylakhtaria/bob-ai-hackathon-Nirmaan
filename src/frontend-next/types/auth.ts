export interface User {
  id: number;
  /** Backend defaults this to "Operator" when signup doesn't supply one. */
  display_name?: string;
  email: string;
  role: 'operator' | 'admin' | 'crew';
  status?: 'pending' | 'approved' | 'rejected';
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
  role?: 'operator' | 'crew';
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

export interface AdminStats {
  total_users: number;
  admins_count: number;
  operators_count: number;
  crews_count: number;
  active_sessions_count: number;
  failed_logins_24h: number;
  signups_7d: number;
  pending_requests_count?: number;
  security_status: string;
}

export interface AdminUser {
  id: number;
  email: string;
  display_name: string;
  role: 'admin' | 'operator' | 'crew';
  status?: 'pending' | 'approved' | 'rejected';
  created_at: string;
  active_sessions: number;
  last_activity?: string | null;
  is_self: boolean;
}

export interface AccessRequest {
  id: number;
  email: string;
  display_name: string;
  role: 'operator' | 'admin' | 'crew';
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

export interface AdminAuditEntry {
  id: number;
  ts: string;
  actor: string;
  action: string;
  category: 'security' | 'operations' | 'admin';
  detail: any;
}

