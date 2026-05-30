import { NextRequest, NextResponse } from 'next/server';
import serviceSupabase from '../../../../lib/serviceSupabase';

const ACTIVE_STATUSES = ['reserved', 'confirmed'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest) {
  try {
    if (!serviceSupabase) {
      return jsonResponse({ claimed: false, reason: 'service_unavailable' }, 500);
    }

    // 토큰이 있으면 검증하여 사용자 식별. 만료/누락 시에도 예약/견적 소유자
    // 기준으로 안전하게 처리하여 401로 예약 흐름이 막히지 않도록 한다.
    const authHeader = request.headers.get('authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    let tokenUserId: string | null = null;
    if (token) {
      const { data: authData } = await serviceSupabase.auth.getUser(token);
      tokenUserId = authData.user?.id || null;
    }

    const body = await request.json();
    const promotionCode = typeof body.promotionCode === 'string' ? body.promotionCode.trim() : '';
    const quoteId = isUuid(body.quoteId) ? body.quoteId : null;
    const reservationId = isUuid(body.reservationId) ? body.reservationId : null;
    const reservationCruiseId = isUuid(body.reservationCruiseId) ? body.reservationCruiseId : null;
    const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
      ? body.metadata
      : {};

    if (!promotionCode || (!quoteId && !reservationId)) {
      return jsonResponse({ claimed: false, reason: 'invalid_request' }, 400);
    }

    // 실제 사용량을 기록할 사용자. 토큰이 유효하면 우선 사용하고,
    // 그렇지 않으면 예약/견적 소유자를 사용한다.
    let userId: string | null = tokenUserId;

    if (reservationId) {
      const { data: reservation, error: reservationError } = await serviceSupabase
        .from('reservation')
        .select('re_id, re_user_id, re_quote_id')
        .eq('re_id', reservationId)
        .maybeSingle();

      if (reservationError || !reservation) {
        return jsonResponse({ claimed: false, reason: 'reservation_not_found' }, 404);
      }
      // 토큰 사용자와 예약 소유자가 다르면 차단
      if (tokenUserId && reservation.re_user_id && reservation.re_user_id !== tokenUserId) {
        return jsonResponse({ claimed: false, reason: 'forbidden' }, 403);
      }
      if (!userId) userId = reservation.re_user_id || null;
    }

    if (quoteId) {
      const { data: quote, error: quoteError } = await serviceSupabase
        .from('quote')
        .select('id, user_id')
        .eq('id', quoteId)
        .maybeSingle();

      if (quoteError || !quote) {
        return jsonResponse({ claimed: false, reason: 'quote_not_found' }, 404);
      }
      if (tokenUserId && quote.user_id && quote.user_id !== tokenUserId) {
        return jsonResponse({ claimed: false, reason: 'forbidden' }, 403);
      }
      if (!userId) userId = quote.user_id || null;
    }

    if (!userId) {
      return jsonResponse({ claimed: false, reason: 'unauthorized' }, 401);
    }

    const { data: promotion, error: promotionError } = await serviceSupabase
      .from('cruise_promotion')
      .select('id, quota_total')
      .eq('code', promotionCode)
      .eq('is_active', true)
      .maybeSingle();

    if (promotionError || !promotion) {
      return jsonResponse({ claimed: false, reason: 'promotion_not_found' }, 404);
    }

    const findExisting = async () => {
      if (reservationId) {
        const { data } = await serviceSupabase
          .from('cruise_promotion_usage')
          .select('*')
          .eq('promotion_id', promotion.id)
          .eq('reservation_id', reservationId)
          .in('status', ACTIVE_STATUSES)
          .maybeSingle();
        if (data) return data;
      }

      if (quoteId) {
        const { data } = await serviceSupabase
          .from('cruise_promotion_usage')
          .select('*')
          .eq('promotion_id', promotion.id)
          .eq('quote_id', quoteId)
          .in('status', ACTIVE_STATUSES)
          .maybeSingle();
        if (data) return data;
      }

      return null;
    };

    const existing = await findExisting();
    if (existing) {
      if (reservationId && (!existing.reservation_id || existing.status !== 'confirmed')) {
        await serviceSupabase
          .from('cruise_promotion_usage')
          .update({
            reservation_id: reservationId,
            reservation_cruise_id: reservationCruiseId || existing.reservation_cruise_id || null,
            status: 'confirmed',
            metadata: { ...(existing.metadata || {}), ...metadata },
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      }

      const { count } = await serviceSupabase
        .from('cruise_promotion_usage')
        .select('id', { count: 'exact', head: true })
        .eq('promotion_id', promotion.id)
        .in('status', ACTIVE_STATUSES);

      return jsonResponse({
        claimed: true,
        reason: reservationId ? 'confirmed_existing_claim' : 'already_claimed',
        promotion_id: promotion.id,
        quota_total: promotion.quota_total,
        used_count: count || 0,
        remaining_count: Math.max(Number(promotion.quota_total) - Number(count || 0), 0),
      });
    }

    const { count } = await serviceSupabase
      .from('cruise_promotion_usage')
      .select('id', { count: 'exact', head: true })
      .eq('promotion_id', promotion.id)
      .in('status', ACTIVE_STATUSES);

    const usedCount = Number(count || 0);
    const quotaTotal = Number(promotion.quota_total || 0);
    if (usedCount >= quotaTotal) {
      return jsonResponse({
        claimed: false,
        reason: 'quota_exhausted',
        promotion_id: promotion.id,
        quota_total: quotaTotal,
        used_count: usedCount,
        remaining_count: 0,
      });
    }

    const { error: insertError } = await serviceSupabase
      .from('cruise_promotion_usage')
      .insert({
        promotion_id: promotion.id,
        quote_id: quoteId,
        reservation_id: reservationId,
        reservation_cruise_id: reservationCruiseId,
        user_id: userId,
        status: reservationId ? 'confirmed' : 'reserved',
        metadata,
      });

    if (insertError) {
      if (insertError.code === '23505') {
        const duplicate = await findExisting();
        if (duplicate) {
          return jsonResponse({
            claimed: true,
            reason: 'already_claimed',
            promotion_id: promotion.id,
            quota_total: quotaTotal,
            used_count: usedCount,
            remaining_count: Math.max(quotaTotal - usedCount, 0),
          });
        }
      }

      console.error('[cruise-promotion/claim] insert failed:', insertError);
      return jsonResponse({ claimed: false, reason: 'insert_failed' }, 500);
    }

    const nextUsedCount = usedCount + 1;
    return jsonResponse({
      claimed: true,
      reason: 'claimed',
      promotion_id: promotion.id,
      quota_total: quotaTotal,
      used_count: nextUsedCount,
      remaining_count: Math.max(quotaTotal - nextUsedCount, 0),
    });
  } catch (error) {
    console.error('[cruise-promotion/claim] error:', error);
    return jsonResponse({ claimed: false, reason: 'server_error' }, 500);
  }
}
