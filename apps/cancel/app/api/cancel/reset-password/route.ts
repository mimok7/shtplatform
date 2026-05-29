import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { randomBytes } from 'crypto';
import { getServiceSupabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function generateTempPassword(): string {
    // 12자: 영문 대소문자 + 숫자 + 기호 (헷갈리는 문자 제외)
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    const bytes = randomBytes(12);
    let pw = '';
    for (let i = 0; i < 12; i++) pw += alphabet[bytes[i] % alphabet.length];
    return pw;
}

async function sendTempPasswordEmail(to: string, displayName: string, tempPassword: string) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        throw new Error('SMTP_USER / SMTP_PASS 환경변수가 설정되지 않았습니다.');
    }
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const loginUrl = process.env.CUSTOMER_APP_URL || 'https://staycruise.kr';
    const cancelUrl = process.env.CANCEL_APP_BASE_URL || 'https://cancel.stayhalong.com';

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
            <h2 style="color: #d33;">[Stay Halong] 임시 비밀번호 안내</h2>
            <p>${displayName} 님, 요청하신 임시 비밀번호를 안내드립니다.</p>
            <p style="background:#f4f4f4; padding: 16px; font-size: 18px; font-weight: bold; letter-spacing: 1px;">
                ${tempPassword}
            </p>
            <p style="font-size: 13px; color: #555;">
                보안을 위해 로그인 후 즉시 비밀번호를 변경해 주세요.<br/>
                이 비밀번호는 본인이 직접 요청한 경우에만 사용해 주시기 바랍니다.
            </p>
            <hr/>
            <p style="font-size: 13px;">
                • 일반 로그인: <a href="${loginUrl}">${loginUrl}</a><br/>
                • 취소 신청 페이지: <a href="${cancelUrl}">${cancelUrl}</a>
            </p>
        </div>
    `;

    await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        subject: '[Stay Halong] 임시 비밀번호 안내',
        html,
    });
}

export async function POST(req: NextRequest) {
    try {
        const { email } = await req.json();
        const trimmedEmail = String(email || '').trim().toLowerCase();
        if (!trimmedEmail) {
            return NextResponse.json({ error: '이메일이 필요합니다.' }, { status: 400 });
        }

        const supabase = getServiceSupabase();

        // 이메일 매칭
        const { data: users, error: userErr } = await supabase
            .from('users')
            .select('id, name, email')
            .ilike('email', trimmedEmail);
        if (userErr) throw userErr;

        const matched = (users || [])[0];
        if (!matched) {
            // 보안상 일치 여부 노출하지 않음
            return NextResponse.json({ ok: true });
        }

        const tempPassword = generateTempPassword();

        const { error: updErr } = await supabase.auth.admin.updateUserById(matched.id, {
            password: tempPassword,
        });
        if (updErr) throw updErr;

        try {
            await sendTempPasswordEmail(trimmedEmail, matched.name || trimmedEmail, tempPassword);
        } catch (mailErr: any) {
            console.error('[cancel/reset-password] 이메일 발송 실패', mailErr);
            return NextResponse.json({ error: '이메일 발송에 실패했습니다. 관리자에게 문의해 주세요.' }, { status: 500 });
        }

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('[cancel/reset-password] 실패', err);
        return NextResponse.json({ error: err?.message || '서버 오류' }, { status: 500 });
    }
}
