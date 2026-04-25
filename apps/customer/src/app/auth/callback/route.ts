import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(request: NextRequest) {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');
    const error = requestUrl.searchParams.get('error');
    const error_description = requestUrl.searchParams.get('error_description');

    // 에러가 있는 경우
    if (error) {
        console.error('OAuth 에러:', error, error_description);
        return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error_description || error)}`, requestUrl.origin));
    }

    if (code) {
        const supabase = createClient(supabaseUrl, supabaseAnonKey);

        try {
            // 인증 코드를 세션으로 교환
            const { data: { user }, error: authError } = await supabase.auth.exchangeCodeForSession(code);

            if (authError) {
                console.error('세션 교환 실패:', authError);
                return NextResponse.redirect(new URL('/login?error=auth_failed', requestUrl.origin));
            }

            if (!user) {
                console.error('사용자 정보 없음');
                return NextResponse.redirect(new URL('/login?error=no_user', requestUrl.origin));
            }

            console.log('✅ OAuth 로그인 성공:', user.id, user.email);

            // users 테이블에 사용자 프로필 확인/생성
            const { data: existingUser, error: fetchError } = await supabase
                .from('users')
                .select('id, role, status')
                .eq('id', user.id)
                .single();

            if (fetchError && fetchError.code === 'PGRST116') {
                // 프로필이 없으면 생성
                console.log('ℹ️ 신규 사용자, 프로필 생성');

                const { error: insertError } = await supabase
                    .from('users')
                    .insert({
                        id: user.id,
                        email: user.email,
                        name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || '사용자',
                        role: 'guest',
                        status: 'active',
                        created_at: new Date().toISOString(),
                    });

                if (insertError) {
                    console.error('프로필 생성 실패:', insertError);
                    // 에러가 있어도 로그인은 성공했으므로 홈으로 리다이렉트
                } else {
                    console.log('✅ 프로필 생성 완료');
                }
            } else if (existingUser) {
                console.log('✅ 기존 프로필 확인:', existingUser.role);
            }

            // 로그인 성공, 마이페이지로 리다이렉트
            return NextResponse.redirect(new URL('/mypage', requestUrl.origin));

        } catch (error) {
            console.error('OAuth 콜백 처리 오류:', error);
            return NextResponse.redirect(new URL('/login?error=callback_failed', requestUrl.origin));
        }
    }

    // code가 없으면 로그인 페이지로
    return NextResponse.redirect(new URL('/login', requestUrl.origin));
}
