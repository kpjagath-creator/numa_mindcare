// API calls for /api/v1/auth.

import api from "./api";

export interface AuthUser {
  id: number;
  username: string;
  name: string;
  role: string;
  permissions: string[];
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const res = await api.post("/auth/login", { username, password });
  return res.data.data.user;
}

export async function logout(): Promise<void> {
  await api.post("/auth/logout");
}

export async function fetchCurrentUser(): Promise<AuthUser> {
  const res = await api.get("/auth/me");
  return res.data.data.user;
}

export async function changePassword(currentPassword: string, newPassword: string, confirmPassword: string): Promise<void> {
  await api.post("/auth/change-password", {
    current_password: currentPassword,
    new_password: newPassword,
    confirm_password: confirmPassword,
  });
}
