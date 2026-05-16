import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import serviceSupabase from '@/lib/serviceSupabase';

function getTokenFromRequest(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
}

function getAnonClient(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey || !accessToken) return null;

  return createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const { endpoint } = await req.json();
    if (!endpoint) {
      return NextResponse.json({ error: 'endpoint 필수' }, { status: 400 });
    }

    if (serviceSupabase) {
      const { error } = await serviceSupabase
        .from('push_subscriptions')
        .update({ is_active: false })
        .eq('endpoint', endpoint);

      if (error) {
        return NextResponse.json({ error: `DB 업데이트 실패: ${error.message}` }, { status: 500 });
      }
    } else {
      const token = getTokenFromRequest(req);
      const anonClient = getAnonClient(token);
      if (!anonClient) {
        return NextResponse.json({ error: '서버 설정 오류(anon/client 구성 실패)' }, { status: 500 });
      }

      const { error } = await anonClient
        .from('push_subscriptions')
        .update({ is_active: false })
        .eq('endpoint', endpoint);

      if (error) {
        return NextResponse.json({ error: `DB 업데이트 실패: ${error.message}` }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || '서버 오류' }, { status: 500 });
  }
}
