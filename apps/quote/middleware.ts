import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    const response = NextResponse.next();

    // 인증이 필요한 페이지는 캐시 방지
    const isAuthPage = pathname.startsWith('/mypage') ||
        pathname.startsWith('/login') ||
        pathname.startsWith('/signup') ||
        pathname.startsWith('/quote');

    if (isAuthPage) {
        response.headers.set('Cache-Control', 'private, no-store, no-cache, must-revalidate');
        response.headers.set('Pragma', 'no-cache');
    }

    return response;
}

export const config = {
    matcher: [
        '/mypage/:path*',
        '/login',
        '/signup',
        '/quote/:path*',
    ],
};
