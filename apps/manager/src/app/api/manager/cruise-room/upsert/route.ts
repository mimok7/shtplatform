import { NextResponse } from 'next/server';
import serviceSupabase from '../../../../../lib/serviceSupabase';

type UpsertBody = {
  id?: string | null;
  cruise_name?: string | null;
  room_name?: string | null;
  description?: string | null;
  room_description?: string | null;
  room_image?: string | null;
  images?: string[] | string | null;
};

function toNullableText(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text ? text : null;
}

function normalizeImages(images: UpsertBody['images']): string[] {
  if (Array.isArray(images)) {
    return Array.from(new Set(images.map((v) => String(v || '').trim()).filter(Boolean)));
  }

  if (typeof images === 'string') {
    return Array.from(
      new Set(
        images
          .split(/\r?\n|,/) 
          .map((v) => v.trim())
          .filter(Boolean)
      )
    );
  }

  return [];
}

export async function POST(request: Request) {
  try {
    if (!serviceSupabase) {
      return NextResponse.json(
        { success: false, error: 'SUPABASE_SERVICE_ROLE_KEY 환경변수를 확인하세요.' },
        { status: 500 }
      );
    }

    const body = (await request.json()) as UpsertBody;

    const payload = {
      cruise_name: toNullableText(body.cruise_name),
      room_name: toNullableText(body.room_name),
      description: toNullableText(body.description),
      room_description: toNullableText(body.room_description),
      room_image: toNullableText(body.room_image),
      images: normalizeImages(body.images),
      updated_at: new Date().toISOString(),
    };

    const targetId = toNullableText(body.id);

    if (targetId) {
      const { data, error } = await serviceSupabase
        .from('cruise_info')
        .update(payload)
        .eq('id', targetId)
        .select('id')
        .single();

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true, mode: 'update', id: data?.id || targetId });
    }

    const cruiseName = payload.cruise_name;
    const roomName = payload.room_name;

    if (cruiseName && roomName) {
      const { data: existing, error: lookupError } = await serviceSupabase
        .from('cruise_info')
        .select('id')
        .eq('cruise_name', cruiseName)
        .eq('room_name', roomName)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lookupError) {
        return NextResponse.json({ success: false, error: lookupError.message }, { status: 500 });
      }

      if (existing?.id) {
        const { data, error } = await serviceSupabase
          .from('cruise_info')
          .update(payload)
          .eq('id', existing.id)
          .select('id')
          .single();

        if (error) {
          return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, mode: 'matched-update', id: data?.id || existing.id });
      }
    }

    const { data: inserted, error: insertError } = await serviceSupabase
      .from('cruise_info')
      .insert(payload)
      .select('id')
      .single();

    if (insertError) {
      return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, mode: 'insert', id: inserted?.id });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
