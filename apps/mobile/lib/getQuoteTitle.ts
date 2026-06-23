import supabase from './supabase';

export type QuoteLike = {
    title?: string;
    quote_id?: string;
    id?: string;
    quote?: { title?: string } | null;
    quote_info?: { title?: string } | null;
    reservation?: { re_quote_id?: string } | null;
};

const titleCache = new Map<string, string>();

// 우선 로컬 객체에서 타이틀 추출
export function resolveLocalQuoteTitle(q?: QuoteLike | null): string | undefined {
    if (!q) return undefined;
    return q.title || q.quote?.title || q.quote_info?.title;
}

// DB에서 타이틀 조회 (quote_id 우선, 없으면 id)
export async function fetchQuoteTitle(opts: { quote_id?: string; id?: string }): Promise<string | undefined> {
    try {
        const { quote_id, id } = opts;
        if (!quote_id && !id) return undefined;

        // 캐시 확인 (quote_id 또는 id로)
        const cacheKey = quote_id || id;
        if (cacheKey && titleCache.has(cacheKey)) {
            return titleCache.get(cacheKey);
        }


        let query = supabase.from('quote').select('title, quote_id, id').limit(1);
        if (quote_id) {
            query = query.eq('quote_id', quote_id);
        } else if (id) {
            query = query.eq('id', id);
        }

        const { data, error } = await query.single();

        if (error) {
            return undefined;
        }


        const title = data?.title;
        const resultQuoteId = data?.quote_id;
        const resultId = data?.id;

        if (title && title.trim()) {
            // 캐시에 저장 (quote_id 우선, 없으면 id로)
            const key = resultQuoteId || resultId;
            if (key) {
                titleCache.set(key, title);
            }
            return title;
        } else {
            return undefined;
        }
    } catch (err) {
        console.error('❌ 견적 타이틀 조회 예외:', err);
        return undefined;
    }
}

// 타이틀 확보: 로컬 → 원격 조회 순서로 확보
export async function ensureQuoteTitle(input: QuoteLike): Promise<string | undefined> {
    const local = resolveLocalQuoteTitle(input);
    if (local) return local;
    const quote_id = input?.quote_id || input?.reservation?.re_quote_id;
    const id = input?.id;
    return await fetchQuoteTitle({ quote_id, id });
}
