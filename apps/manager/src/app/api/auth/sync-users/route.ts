import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import path from 'path';

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
        const { users, noEmail } = await request.json();

        if (!Array.isArray(users)) {
            return NextResponse.json({ error: 'users must be an array' }, { status: 400 });
        }

        const defaultPassword = process.env.DEFAULT_SYNC_PASSWORD || 'sht123!';

        const results = {
            created: 0,
            updated: 0,
            failed: 0,
            errors: [] as string[]
        };

        const csvErrors: Array<{ id?: string; email?: string; message: string }> = [];

        for (const user of users) {
            if (!user.email) {
                results.failed++;
                const msg = `사용자 ${user.id}: 이메일 없음`;
                results.errors.push(msg);
                csvErrors.push({ id: user.id, email: user.email, message: msg });
                continue;
            }

            try {
                // 기존 인증 확인 (id가 없으면 getUserById 시도하지 않음)
                let existingAuth: any = null;
                if (user.id) {
                    const { data } = await supabaseAdmin.auth.admin.getUserById(user.id);
                    existingAuth = data;
                }

                // 이메일 발송 억제를 위해 email_confirm 플래그를 강제 설정할 수 있음
                const emailConfirmFlag = !!noEmail ? true : true; // 기본적으로 true (안전)

                if (existingAuth?.user) {
                    // 기존 사용자 - 비밀번호는 건드리지 않고 메타데이터만 업데이트
                    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
                        // password 필드 제외 (기존 비밀번호 유지)
                        email_confirm: emailConfirmFlag,
                        user_metadata: {
                            name: user.name || '',
                            phone_number: user.phone_number || ''
                        }
                    });

                    if (updateError) {
                        results.failed++;
                        results.errors.push(`사용자 ${user.email}: ${updateError.message}`);
                        csvErrors.push({ id: user.id, email: user.email, message: updateError.message });
                    } else {
                        results.updated++;
                    }
                } else {
                    // 새 사용자 - 인증 생성
                    const { error } = await supabaseAdmin.auth.admin.createUser({
                        id: user.id,
                        email: user.email,
                        password: defaultPassword,
                        email_confirm: emailConfirmFlag,
                        user_metadata: {
                            name: user.name || '',
                            phone_number: user.phone_number || ''
                        }
                    });

                    if (error) {
                        results.failed++;
                        let errorMessage = error.message;

                        // 특정 오류에 대한 자세한 설명 추가
                        if (error.message.includes('already been registered')) {
                            errorMessage = `이미 다른 ID로 인증 계정이 존재합니다. (이메일 중복)`;
                        } else if (error.message.includes('Password should be')) {
                            errorMessage = `비밀번호 정책 위반: ${error.message}`;
                        }

                        results.errors.push(`사용자 ${user.email}: ${errorMessage}`);
                        csvErrors.push({ id: user.id, email: user.email, message: errorMessage });
                    } else {
                        results.created++;
                    }
                }
            } catch (err: any) {
                results.failed++;
                const msg = err?.message || '알 수 없는 오류';
                results.errors.push(`사용자 ${user.email}: ${msg}`);
                csvErrors.push({ id: user.id, email: user.email, message: msg });
            }

            // API 제한 방지 (50ms 대기)
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        // 실패 로그 CSV 저장 (있을 경우)
        let errorFile: string | null = null;
        if (csvErrors.length > 0) {
            try {
                const outDir = path.join(process.cwd(), 'exports');
                await fs.mkdir(outDir, { recursive: true });
                const filename = `sync-errors-${Date.now()}.csv`;
                const filePath = path.join(outDir, filename);
                const header = 'id,email,message\n';
                const lines = csvErrors.map(e => `${e.id || ''},"${(e.email || '').replace(/\"/g, '"')}","${(e.message || '').replace(/\"/g, '"')}"`).join('\n');
                await fs.writeFile(filePath, header + lines, 'utf8');
                errorFile = `/exports/${filename}`;
            } catch (fileErr) {
                console.error('❌ 실패 로그 CSV 저장 실패:', fileErr);
            }
        }

        return NextResponse.json({ results, errorFile });
    } catch (error) {
        console.error('❌ 인증 동기화 API 오류:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
