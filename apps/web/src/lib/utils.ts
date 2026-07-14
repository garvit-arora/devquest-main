import { clsx, type ClassValue } from "clsx";
export { apiBaseUrl } from "./env";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatCredits(value: number) {
  return `${value.toLocaleString()} credits`;
}
