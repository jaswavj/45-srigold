export function sriImageUrl(fileName?: string | null): string {
  if (!fileName) return '';
  const api = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
  if (api && !import.meta.env.DEV) {
    return `${api}/sri_images/${encodeURIComponent(fileName)}`;
  }
  const base = import.meta.env.BASE_URL || './';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}sri_images/${encodeURIComponent(fileName)}`;
}
