const TIMEZONE_SUFFIX_RE = /[zZ]$|[+-]\d{2}:?\d{2}$/;

type DateTimeLike = string | null | undefined;

function hasTimezone(value: string): boolean {
    return TIMEZONE_SUFFIX_RE.test(value);
}

export function toInputDateTime(value?: DateTimeLike): string {
    if (!value) return '';

    const raw = String(value).trim();
    if (!raw) return '';

    if (!hasTimezone(raw)) {
        return raw.replace(' ', 'T').slice(0, 16);
    }

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) {
        return raw.replace(' ', 'T').slice(0, 16);
    }

    const parts = new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Asia/Seoul',
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    }).formatToParts(date);

    const pick = (type: string) => parts.find((part) => part.type === type)?.value || '';
    return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}`;
}

export function toDbDateTimeKst(value?: DateTimeLike): string | null {
    if (!value) return null;

    const raw = String(value).trim();
    if (!raw) return null;

    const normalized = raw.replace(' ', 'T');
    if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$/.test(normalized)) {
        return `${normalized}:00+09:00`;
    }

    return normalized;
}

export function formatKst(value?: DateTimeLike, includeWeekday: boolean = true): string {
    if (!value) return '-';

    const raw = String(value).trim();
    if (!raw) return '-';

    let parsedValue = raw;
    if (!hasTimezone(raw)) {
        const normalized = raw.replace(' ', 'T');

        if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(normalized)) {
            parsedValue = `${normalized}T00:00:00+09:00`;
        } else if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$/.test(normalized)) {
            parsedValue = `${normalized}:00+09:00`;
        } else if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}$/.test(normalized)) {
            parsedValue = `${normalized}+09:00`;
        } else {
            return raw;
        }
    }

    const date = new Date(parsedValue);
    if (Number.isNaN(date.getTime())) return raw;

    return date.toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        ...(includeWeekday ? { weekday: 'short' } : {}),
    });
}