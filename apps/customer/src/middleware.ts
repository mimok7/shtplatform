import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // /mypage/direct-booking/{service}/1 또는 /2 경로를 단일 페이지로 리다이렉트
    const directBookingRedirect = pathname.match(/^\/mypage\/direct-booking\/(airport|hotel|rentcar|tour)\/(1|2)$/);

    if (directBookingRedirect) {
        const service = directBookingRedirect[1];
        const url = request.nextUrl.clone();
        url.pathname = `/mypage/direct-booking/${service}`;
        // 쿼리 파라미터 유지 (quoteId 등)
        return NextResponse.redirect(url);
    }

    const response = NextResponse.next();

    // 인증이 필요한 페이지는 캐시 방지 (세션 상태가 오래된 채로 남는 것을 방지)
    const isAuthPage = pathname.startsWith('/mypage') ||
        pathname.startsWith('/login') ||
        pathname.startsWith('/signup');

    if (isAuthPage) {
        response.headers.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
        response.headers.set('Pragma', 'no-cache');
    }

    return response;
}

export const config = {
    matcher: [
        '/mypage/:path*',
        '/mypage/direct-booking/:service/:step',
        '/login',
        '/signup',
    ],
};
