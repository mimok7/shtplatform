import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

async function getUserWithTimeout(authClient: any, timeoutMs = 5000) {
    const timeoutPromise = new Promise<never>((_, reject) => {
        const timer = setTimeout(() => {
            clearTimeout(timer);
            reject(new Error('middleware_auth_timeout'));
        }, timeoutMs);
    });

    return Promise.race([authClient.getUser(), timeoutPromise]);
}

export async function middleware(request: NextRequest) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
        return NextResponse.next({ request });
    }

    let response = NextResponse.next({ request });

    const supabase = createServerClient(url, key, {
        cookies: {
            getAll() {
                return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value, options }) => {
                    request.cookies.set(name, value);
                });

                response = NextResponse.next({ request });

                cookiesToSet.forEach(({ name, value, options }) => {
                    response.cookies.set(name, value, options);
                });
            },
        },
    });

    // 요청마다 현재 사용자 확인을 통해 만료 토큰을 자동 갱신한다.
    // 다만 네트워크/토큰 이슈로 무한 대기하지 않도록 타임아웃을 둔다.
    try {
        await getUserWithTimeout(supabase.auth, 5000);
    } catch (error) {
        console.warn('[middleware] auth getUser timeout/failure:', error);
    }

    return response;
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
