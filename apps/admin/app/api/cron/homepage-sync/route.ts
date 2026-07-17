// 매주 홈페이지 상품 카탈로그를 전송하는 Vercel Cron 엔드포인트다.
import { NextRequest, NextResponse } from 'next/server';
import { pushHomepageCatalog } from '@/lib/homepageSync';

function isCronRequest(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`);
}

export async function GET(request: NextRequest) {
  if (!isCronRequest(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await pushHomepageCatalog('scheduled')) });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || '홈페이지 자동 전송에 실패했습니다.' }, { status: 502 });
  }
}
