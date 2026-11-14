export function sriImageUrl(fileName?: string | null): string {
  if (!fileName) return '';
  const base = import.meta.env.BASE_URL || './';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}sri_images/${encodeURIComponent(fileName)}`;
}
