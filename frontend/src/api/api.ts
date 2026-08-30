// Base Axios instance used by all API modules.
// Requests go through /api/v1 which Vite proxies to the backend in dev.

import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "/api/v1",
  headers: { "Content-Type": "application/json" },
  withCredentials: true, // session lives in an httpOnly cookie, not a token we read
});

// A 401 means the session cookie is missing/expired/invalid — clear whatever
// the app thinks it knows about the user and send them to /login. Skipping
// this for the login call itself avoids turning "wrong password" into a
// redirect loop.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRequest = error.config?.url?.includes("/auth/login");
    if (error.response?.status === 401 && !isLoginRequest) {
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
    }
    return Promise.reject(error);
  }
);

export default api;
