// Base Axios instance used by all API modules.
// Requests go through /api/v1 which Vite proxies to the backend in dev.

import axios from "axios";

const api = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
});

export default api;
