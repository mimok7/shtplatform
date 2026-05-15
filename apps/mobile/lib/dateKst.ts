const KST_TIME_ZONE = 'Asia/Seoul';

const HAS_TIMEZONE_REGEX = /[zZ]$|[+-]\d{2}:?\d{2}$/;

const DATE_ONLY_REGEX = /^(\d{4})-(\d{1,2})-(\d{1,2})/;
const DATE_DOT_REGEX = /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/;
const DATE_SLASH_REGEX = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/;
const TIME_REGEX = /(?:T|\s)(\d{1,2}):(\d{2})/;

const pad2 = (value: string | number) => String(value).padStart(2, '0');

const toNormalizedDateKey = (year: string | number, month: string | number, day: string | number): string => {
  return `${String(year)}-${pad2(month)}-${pad2(day)}`;
};

const extractRawDateKey = (raw: string): string => {
  const iso = raw.match(DATE_ONLY_REGEX);
  if (iso) return toNormalizedDateKey(iso[1], iso[2], iso[3]);

  const dot = raw.match(DATE_DOT_REGEX);
  if (dot) return toNormalizedDateKey(dot[1], dot[2], dot[3]);

  const slash = raw.match(DATE_SLASH_REGEX);
  if (slash) return toNormalizedDateKey(slash[3], slash[1], slash[2]);

  return '';
};

const getKstDateParts = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  if (!year || !month || !day) return '';
  return toNormalizedDateKey(year, month, day);
};

const parseDateValue = (value: string): Date | null => {
  const parsed = new Date(value.replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toAmPmTime = (hour24: number, minute: string) => {
  const ampm = hour24 >= 12 ? '오후' : '오전';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${ampm} ${pad2(hour12)}:${minute}`;
};

export const toLocalDateKey = (date: Date): string => {
  return toNormalizedDateKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
};

export const toKstDateKey = (value: string | Date | null | undefined): string => {
  if (!value) return '';

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : getKstDateParts(value);
  }

  const raw = String(value).trim();
  if (!raw) return '';

  if (!HAS_TIMEZONE_REGEX.test(raw)) {
    const rawKey = extractRawDateKey(raw);
    if (rawKey) return rawKey;
  }

  const parsed = parseDateValue(raw);
  if (!parsed) return '';

  return getKstDateParts(parsed);
};

export const toKstDateLabel = (value: string | Date | null | undefined, fallback = '-'): string => {
  const key = toKstDateKey(value);
  if (!key) return fallback;
  const [year, month, day] = key.split('-');
  return `${year}. ${month}. ${day}.`;
};

export const toKstTimeLabel = (value: string | Date | null | undefined, fallback = ''): string => {
  if (!value) return fallback;

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return fallback;
    return value.toLocaleTimeString('ko-KR', {
      timeZone: KST_TIME_ZONE,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }

  const raw = String(value).trim();
  if (!raw) return fallback;

  if (!HAS_TIMEZONE_REGEX.test(raw)) {
    const match = raw.replace(' ', 'T').match(TIME_REGEX);
    if (match) {
      return toAmPmTime(Number(match[1]), match[2]);
    }
    return fallback;
  }

  const parsed = parseDateValue(raw);
  if (!parsed) return fallback;

  return parsed.toLocaleTimeString('ko-KR', {
    timeZone: KST_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

export const toKstDateTimeParts = (value: string | Date | null | undefined) => {
  return {
    date: toKstDateKey(value),
    time: toKstTimeLabel(value),
  };
};
