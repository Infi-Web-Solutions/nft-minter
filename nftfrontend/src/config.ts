// Centralized frontend configuration
export const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL;

// Helper to build full API URLs safely
export function apiUrl(path: string): string {
  const base = API_BASE_URL.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}


