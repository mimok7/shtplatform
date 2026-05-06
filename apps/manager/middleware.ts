import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const host = request.headers.get('host') || '';
  if (host === 'manag.stayhalong.com') {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.host = 'manager.stayhalong.com';
    redirectUrl.protocol = 'https';
    return NextResponse.redirect(redirectUrl, 308);
  }

  const response = NextResponse.next();

  // 인증이 필요한 페이지는 캐시 방지 (세션 상태가 오래된 치로 남는 것을 방지)
  const isAuthPage = pathname.startsWith('/manager') ||
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
    '/manager/:path*',
    '/login',
    '/signup',
  ],
};
