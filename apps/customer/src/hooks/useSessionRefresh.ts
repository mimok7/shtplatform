/**
 * (Deprecated) 탭/앱 전환 후 세션을 강제 갱신하던 훅.
 *
 * 현재는 Supabase 클라이언트의 `autoRefreshToken: true` 옵션이 백그라운드에서
 * 토큰 갱신을 처리하므로 이 훅에서 추가로 `refreshSession()`을 호출하지 않습니다.
 * 중복 갱신은 경쟁 상태(race condition)를 만들어 오히려 제출 실패를 유발했습니다.
 *
 * 호환성 유지를 위해 export는 남기되, 내부 동작은 no-op 입니다.
 * 신규 코드에서는 import 하지 마세요.
 */
export function useSessionRefresh() {
    // intentionally empty: Supabase autoRefreshToken handles refresh automatically.
}

