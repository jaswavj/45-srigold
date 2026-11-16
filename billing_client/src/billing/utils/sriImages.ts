import billingConfig from '../../billingConfig';

export function sriImageUrl(fileName?: string | null): string {
  if (!fileName) return '';
  const api = String(billingConfig.apiBaseName || '').replace(/\/$/, '');
  if (api) {
    return `${api}/sri_images/${encodeURIComponent(fileName)}`;
  }
  const base = import.meta.env.BASE_URL || './';
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return `${prefix}sri_images/${encodeURIComponent(fileName)}`;
}
