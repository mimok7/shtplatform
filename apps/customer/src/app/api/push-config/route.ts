import { NextResponse } from 'next/server';

const resolveVapidPublicKey = () => {
  const candidates = [
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PUBLIC_KEY,
    process.env.WEB_PUSH_VAPID_PUBLIC_KEY,
  ];

  return candidates.map((value) => String(value || '').trim()).find(Boolean) || '';
};

export async function GET() {
  const vapidPublicKey = resolveVapidPublicKey();
  return NextResponse.json({
    vapidPublicKey,
    configured: Boolean(vapidPublicKey),
  });
}