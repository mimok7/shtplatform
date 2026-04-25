import supabase from './supabase';

interface AuthUserSafeResult {
  user: any | null;
  error: Error | null;
  timedOut: boolean;
}

function extractUserFromStoredValue(raw: string): any | null {
  try {
    const parsed = JSON.parse(raw);
    const candidates = [
      parsed,
      parsed?.currentSession,
      parsed?.session,
      parsed?.data?.session,
      parsed?.value?.session,
      parsed?.value,
    ];

    for (const candidate of candidates) {
      const user = candidate?.user;
      if (user?.id) return user;
    }
  } catch {
    // ignore malformed storage
  }

  return null;
}

function getStoredSessionUser(): any | null {
  if (typeof window === 'undefined') return null;

  try {
    const authCache = sessionStorage.getItem('app:auth:cache');
    if (authCache) {
      const parsed = JSON.parse(authCache);
      if (parsed?.user?.id) return parsed.user;
    }
  } catch {
    // ignore
  }

  try {
    const sessionCache = sessionStorage.getItem('app:session:cache');
    if (sessionCache) {
      const parsed = JSON.parse(sessionCache);
      if (parsed?.user?.id) return parsed.user;
    }
  } catch {
    // ignore
  }

  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const user = extractUserFromStoredValue(raw);
      if (user?.id) return user;
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * 안전한 사용자 조회 (인증/세션 최소화 원칙).
 *
 *  - supabase.auth.getSession()은 로컬 캐시만 읽음 → 네트워크 호출 없음
 *  - getUser() 같은 네트워크 호출은 사용하지 않음 (느린 네트워크에서 8초 타임아웃 위험 제거)
 *  - 실패 시 sessionStorage / localStorage 백업에서 복구
 *  - timeoutMs/retries 인자는 하위 호환을 위해 유지하지만 실제로 사용하지 않음
 *  - timedOut 플래그는 항상 false (네트워크 의존이 없으므로 타임아웃 자체가 없음)
 */
export async function getAuthUserSafe(_options?: {
  timeoutMs?: number;
  retries?: number;
}): Promise<AuthUserSafeResult> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (session?.user) {
      return { user: session.user, error: null, timedOut: false };
    }

    const fallbackUser = getStoredSessionUser();
    if (fallbackUser) {
      return { user: fallbackUser, error: null, timedOut: false };
    }

    return { user: null, error: (sessionError as Error) ?? null, timedOut: false };
  } catch (err) {
    const fallbackUser = getStoredSessionUser();
    if (fallbackUser) {
      return { user: fallbackUser, error: null, timedOut: false };
    }
    return { user: null, error: err as Error, timedOut: false };
  }
}
