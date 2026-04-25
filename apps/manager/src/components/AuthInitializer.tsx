"use client";
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * 인증 초기화 컴포넌트.
 *
 * 이전엔 setupAuthListener를 통해 매 토큰 갱신마다 users 테이블을
 * 조회해 역할 캐시를 갱신했으나, 무거운 DB 호출로 다른 작업(폼 입력 등)을
 * 차단하고 일시적 네트워크 오류 시 강제 로그아웃을 유발했음.
 *
 * 인증 상태 동기화는 ManagerLayout의 onAuthStateChange와 각 페이지의
 * useAuth가 직접 처리하도록 위임하고, 여기서는 의도적으로 아무 일도 하지 않는다.
 */
export default function AuthInitializer() {
    const _pathname = usePathname();
    useEffect(() => {
        // no-op
    }, [_pathname]);
    return null;
}
