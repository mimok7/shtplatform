import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Supabase Admin 클라이언트 생성 (서버 측에서만 사용)
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // Service Role Key 필요
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

export async function POST(request: NextRequest) {
    try {
        const { userIds } = await request.json();

        if (!Array.isArray(userIds)) {
            return NextResponse.json({ error: 'userIds must be an array' }, { status: 400 });
        }

        const results: Record<string, boolean> = {};

        // 10개씩 병렬로 처리하여 속도 향상 및 부하 조절
        const BATCH_SIZE = 10;
        for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
            const batch = userIds.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (userId) => {
                try {
                    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
                    results[userId] = !error && !!data?.user;
                } catch (err) {
                    console.error(`❌ 인증 확인 실패 (${userId}):`, err);
                    results[userId] = false;
                }
            }));
        }

        return NextResponse.json({ results });
    } catch (error) {
        console.error('❌ 인증 확인 API 오류:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
