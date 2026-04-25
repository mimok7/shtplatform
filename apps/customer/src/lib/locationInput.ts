export const LOCATION_ALLOWED_PATTERN = /[^A-Z0-9\s,./\-()]/g;

export function normalizeLocationEnglishUpper(value: string): string {
  return (value || '').toUpperCase().replace(LOCATION_ALLOWED_PATTERN, '');
}

export function hasInvalidLocationChars(value: string): boolean {
  return normalizeLocationEnglishUpper(value) !== (value || '').toUpperCase();
}

export function isLocationFieldKey(field: string): boolean {
  const key = field.toLowerCase();
  return (
    key.includes('location') ||
    key.includes('pickup') ||
    key.includes('dropoff') ||
    key.includes('destination') ||
    key.includes('stopover') ||
    key.includes('accommodation')
  );
}
