export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";
export const PUBLIC_APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
export const PUBLIC_GATEWAY_URL = process.env.NEXT_PUBLIC_DEVQUEST_GATEWAY_URL ?? "https://devquest.garvitarora.xyz/v1";

export function apiBaseUrl() {
  return API_BASE_URL;
}
