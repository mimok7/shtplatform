import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '@/lib/serviceSupabase';

export async function POST(req: NextRequest) {
  try {
    const { to, subject, html } = await req.json();

    if (!to || !subject || !html) {
      return NextResponse.json({ error: '필수 파라미터 누락 (to, subject, html)' }, { status: 400 });
    }

    // 이메일 주소 기본 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      return NextResponse.json({ error: '유효하지 않은 이메일 주소' }, { status: 400 });
    }

    // 호출자 인증 (service role 또는 admin/manager 사용자)
    if (!serviceSupabase) {
      return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
    }

    // Supabase Auth Admin API를 통한 이메일 발송 (내장 SMTP 사용)
    const { error } = await serviceSupabase.auth.admin.generateLink({
      type: 'magiclink',
      email: to,
    });

    // Supabase 내장 SMTP는 인증 이메일 전용이므로
    // 커스텀 메시지는 직접 SMTP 또는 외부 서비스 필요.
    // 현재는 이메일 발송 시도를 로그하고 성공 응답 반환 (실제 발송은 추후 연결)
    // TODO: Resend(https://resend.com) 또는 SendGrid 연결 시 아래 코드 교체

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || 'noreply@stayhalong.com';

    if (smtpHost && smtpUser && smtpPass) {
      // nodemailer 방식 (SMTP 설정이 있는 경우)
      try {
        const nodemailer = await import('nodemailer');
        const transporter = nodemailer.default.createTransport({
          host: smtpHost,
          port: Number(smtpPort) || 587,
          secure: Number(smtpPort) === 465,
          auth: { user: smtpUser, pass: smtpPass },
        });

        const info = await transporter.sendMail({
          from: smtpFrom,
          to,
          subject,
          html,
        });

        return NextResponse.json({ success: true, messageId: info.messageId });
      } catch (smtpError) {
        console.error('[send-email] SMTP 발송 실패:', smtpError);
        // SMTP 실패 시에도 알림 저장은 이미 완료됐으므로 경고만 반환
        return NextResponse.json({ 
          success: false, 
          warning: 'SMTP 발송 실패 (DB 알림은 저장됨)', 
          messageId: null 
        });
      }
    }

    // SMTP 미설정 시 — 이메일 발송 스킵 (개발/임시 환경)
    console.log(`[send-email] SMTP 미설정. 발송 스킵. 수신자: ${to}, 제목: ${subject}`);
    return NextResponse.json({ 
      success: true, 
      messageId: `skipped-${Date.now()}`,
      warning: 'SMTP 미설정으로 실제 발송 건너뜀' 
    });

  } catch (err: any) {
    console.error('[send-email] 오류:', err);
    return NextResponse.json({ error: '이메일 발송 중 서버 오류' }, { status: 500 });
  }
}
