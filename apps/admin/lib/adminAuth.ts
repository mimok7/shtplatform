// 관리자 클라이언트 요청에서 세션 토큰을 빠르게 읽어 API 인증 헤더를 만든다.
import { getSupabase } from '@/lib/supabase';

const SESSION_READ_TIMEOUT_MS = 3_000;

function readPersistedAccessToken() {
  if (typeof window === 'undefined') return '';
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index) || '';
      if (!key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) as { access_token?: unknown; expires_at?: number } : null;
      if (typeof parsed?.access_token === 'string' && parsed.access_token) return parsed.access_token;
    }
  } catch {
    // 저장소 접근 제한 또는 손상된 세션은 API 인증 실패로 처리한다.
  }
  return '';
}

export async function getAdminAuthHeaders(): Promise<Record<string, string>> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('session_read_timeout')), SESSION_READ_TIMEOUT_MS);
    });
    const { data: { session } } = await Promise.race([getSupabase().auth.getSession(), timeout]);
    if (session?.access_token) return { Authorization: `Bearer ${session.access_token}` };
  } catch {
    // 아래 저장 세션 폴백을 사용한다.
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  const accessToken = readPersistedAccessToken();
  return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
}
