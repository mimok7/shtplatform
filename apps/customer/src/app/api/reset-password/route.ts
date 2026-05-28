import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { randomBytes } from 'crypto';
import serviceSupabase from '@/lib/serviceSupabase';

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

async function sendTempPasswordEmail(to: string, name: string, tempPassword: string) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        throw new Error('SMTP_USER / SMTP_PASS 환경변수가 설정되지 않았습니다.');
    }
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const loginUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://staycruise.kr';
    const profileUrl = `${loginUrl}/mypage/profile`;

    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #333;">
            <h2 style="color: #1d4ed8;">[Stay Halong] 임시 비밀번호 안내</h2>
            <p>${name} 님, 요청하신 임시 비밀번호를 안내드립니다.</p>
            <div style="background:#f4f4f4; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <p style="margin: 0 0 8px 0; font-size: 13px; color: #666;">임시 비밀번호</p>
                <p style="margin: 0; font-size: 22px; font-weight: bold; letter-spacing: 2px; font-family: monospace;">
                    ${tempPassword}
                </p>
            </div>
            <p style="font-size: 13px; color: #555; line-height: 1.6;">
                위 임시 비밀번호로 로그인하신 후,<br/>
                보안을 위해 <strong>내 정보 &gt; 비밀번호 변경</strong>에서 새 비밀번호로 변경해 주세요.
            </p>
            <div style="margin: 20px 0;">
                <a href="${loginUrl}/login" style="display: inline-block; background: #1d4ed8; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: bold;">
                    로그인하기
                </a>
                &nbsp;&nbsp;
                <a href="${profileUrl}" style="display: inline-block; background: #ea580c; color: white; padding: 10px 24px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: bold;">
                    비밀번호 변경하기
                </a>
            </div>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;"/>
            <p style="font-size: 12px; color: #999;">
                본인이 요청하지 않은 경우 이 이메일을 무시하셔도 됩니다.<br/>
                계정 보안이 걱정되신다면 비밀번호를 즉시 변경해 주세요.
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
        const { name, email } = await req.json();
        const trimmedName = String(name || '').trim();
        const trimmedEmail = String(email || '').trim().toLowerCase();
        if (!trimmedName || !trimmedEmail) {
            return NextResponse.json({ error: '이름과 이메일이 필요합니다.' }, { status: 400 });
        }
        if (!serviceSupabase) {
            return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
        }

        // 이름+이메일 매칭
        const { data: users, error: userErr } = await serviceSupabase
            .from('users')
            .select('id, name, email')
            .ilike('email', trimmedEmail);
        if (userErr) throw userErr;

        const matched = (users || []).find(
            (u: any) => (u.name || '').trim() === trimmedName,
        );
        if (!matched) {
            // 보안상 일치 여부 노출하지 않음
            return NextResponse.json({ ok: true });
        }

        const tempPassword = generateTempPassword();

        const { error: updErr } = await serviceSupabase.auth.admin.updateUserById(matched.id, {
            password: tempPassword,
        });
        if (updErr) throw updErr;

        try {
            await sendTempPasswordEmail(trimmedEmail, trimmedName, tempPassword);
        } catch (mailErr: any) {
            console.error('[reset-password] 이메일 발송 실패', mailErr);
            return NextResponse.json(
                { error: '이메일 발송에 실패했습니다. 관리자에게 문의해 주세요.' },
                { status: 500 },
            );
        }

        return NextResponse.json({ ok: true });
    } catch (err: any) {
        console.error('[reset-password] 실패', err);
        return NextResponse.json({ error: err?.message || '서버 오류' }, { status: 500 });
    }
}
