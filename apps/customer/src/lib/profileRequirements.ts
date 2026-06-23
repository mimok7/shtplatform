export interface RequiredProfileFields {
  email?: string | null;
  name?: string | null;
  english_name?: string | null;
  phone_number?: string | null;
}

export function hasRequiredProfileFields(profile?: RequiredProfileFields | null): boolean {
  if (!profile) return false;
  if (!profile.email || profile.email.trim() === '') return false;
  if (!profile.name || profile.name.trim() === '') return false;
  if (!profile.english_name || profile.english_name.trim() === '') return false;
  if (!profile.phone_number || profile.phone_number.trim() === '') return false;

  const phoneDigits = profile.phone_number.replace(/\D/g, '');
  return phoneDigits.length >= 10 && phoneDigits.length <= 11;
}

export function buildProfileCompletionPath(redirectTo: string = '/mypage'): string {
  return `/mypage/profile?redirect=${encodeURIComponent(redirectTo)}`;
}

export function getSafeProfileRedirectPath(
  redirectTo: string | null | undefined,
  fallback: string = '/mypage',
): string {
  if (!redirectTo) return fallback;
  if (!redirectTo.startsWith('/')) return fallback;
  if (redirectTo.startsWith('//')) return fallback;
  return redirectTo;
}
