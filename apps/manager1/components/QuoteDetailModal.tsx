"use client";

import React, { useState, useEffect, useMemo } from 'react';
import supabase from '@/lib/supabase';
import { updateQuoteItemPrices } from '@/lib/updateQuoteItemPrices';

/* ─────────── 보조 유틸 ─────────── */
const fmt = (v: any) => (v === null || v === undefined || v === '' ? '-' : Number(v).toLocaleString());
const fmtDate = (v: any) => {
  if (!v) return '-';
  try {
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('ko-KR');
  } catch { return String(v); }
};
const fmtDateTime = (v: any) => {
  if (!v) return '-';
  try {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return String(v); }
};

/* ─────────── 단가 × 수량 = 합계 표시 ─────────── */
function PriceLine({ unit, qty, total, currency = '동' }: { unit?: number; qty?: number; total?: number; currency?: string }) {
  const u = Number(unit || 0);
  const q = Number(qty || 1);
  const calc = u * q;
  const t = Number(total ?? calc);
  const mismatch = total !== undefined && Math.abs(calc - t) > 1;
  return (
    <div className="mt-3 border-t border-gray-200 pt-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-700">단가</span>
        <span className="font-medium text-gray-900">{fmt(u)} {currency}</span>
      </div>
      <div className="flex items-center justify-between text-sm mt-1">
        <span className="text-gray-700">수량</span>
        <span className="font-medium text-gray-900">× {q}</span>
      </div>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-dashed border-gray-200">
        <span className="text-sm font-semibold text-gray-800">합계 (단가×수량)</span>
        <span className="text-base font-bold text-blue-600">{fmt(calc)} {currency}</span>
      </div>
      {mismatch && (
        <div className="flex items-center justify-between mt-1 text-xs">
          <span className="text-orange-600">DB 저장 총액</span>
          <span className="text-orange-600 font-medium">{fmt(t)} {currency} <span className="ml-1 text-orange-500">(불일치)</span></span>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: any }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <p className="text-sm text-gray-700">
      <span className="text-gray-500">{label}:</span> <span className="font-medium text-gray-900">{value}</span>
    </p>
  );
}

function QuoteDetailModal({ quoteId, onClose }: { quoteId: string; onClose: () => void }) {
  const [user, setUser] = useState<any>(null);
  const [calculating, setCalculating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<any>(null);
  const [detailedServices, setDetailedServices] = useState<any>({ rooms: [], cars: [], airports: [], hotels: [], rentcars: [], tours: [] });
  const [approvalNote, setApprovalNote] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);

  useEffect(() => { checkAuth(); }, []);

  useEffect(() => {
    if (user && quoteId) {
      loadQuoteDetail();
      loadDetailedServices();
    }
  }, [user, quoteId]);

  const checkAuth = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) { alert('로그인이 필요합니다.'); onClose(); return; }
      const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
      if (!profile || (profile.role !== 'manager' && profile.role !== 'admin')) {
        alert('매니저 권한이 필요합니다.'); onClose(); return;
      }
      setUser(user);
    } catch (error) { console.error('권한 확인 오류:', error); onClose(); }
  };

  const loadQuoteDetail = async () => {
    try {
      setLoading(true);
      const { data: quoteData, error: quoteError } = await supabase.from('quote').select('*').eq('id', quoteId).single();
      if (quoteError) throw quoteError;

      let userData = null;
      try {
        const { data: userResult } = await supabase.from('users').select('id, name, email, phone_number').eq('id', quoteData.user_id).single();
        userData = userResult;
      } catch (e) { console.warn('사용자 조회 실패:', e); }

      setQuote({ ...quoteData, users: userData || { name: '알 수 없음', email: '미확인' } });
    } catch (error) {
      console.error('견적 상세 정보 로딩 실패:', error);
      alert('견적을 불러오는 중 오류가 발생했습니다.');
      onClose();
    } finally { setLoading(false); }
  };

  const loadDetailedServices = async () => {
    try {
      const { data: quoteItems, error } = await supabase.from('quote_item').select('*').eq('quote_id', quoteId);
      if (error) throw error;

      const detailed: any = { rooms: [], cars: [], airports: [], hotels: [], rentcars: [], tours: [] };

      for (const item of quoteItems || []) {
        try {
          if (item.service_type === 'room') {
            const { data: roomData } = await supabase.from('room').select('*').eq('id', item.service_ref_id).single();
            if (roomData) {
              const { data: priceData } = await supabase.from('cruise_rate_card').select('*').eq('id', roomData.room_code);
              detailed.rooms.push({ ...item, roomInfo: roomData, priceInfo: priceData || [] });
            }
          } else if (item.service_type === 'car') {
            const { data: carData } = await supabase.from('car').select('*').eq('id', item.service_ref_id).single();
            if (carData) {
              const { data: priceData } = await supabase.from('rentcar_price').select('*').eq('rent_code', carData.car_code || '');
              detailed.cars.push({ ...item, carInfo: carData, priceInfo: priceData || [] });
            }
          } else if (item.service_type === 'airport') {
            const { data: airportData } = await supabase.from('airport').select('*').eq('id', item.service_ref_id).single();
            if (airportData) {
              const { data: priceData } = await supabase.from('airport_price').select('*').eq('airport_code', airportData.airport_code);
              detailed.airports.push({ ...item, airportInfo: airportData, priceInfo: priceData || [] });
            }
          } else if (item.service_type === 'hotel') {
            const { data: hotelData } = await supabase.from('hotel').select('*').eq('id', item.service_ref_id).single();
            if (hotelData) {
              // ✅ FIX: hotel_price 매칭 컬럼은 hotel_code (이전 hotel_price_code 오류)
              const { data: priceData } = await supabase.from('hotel_price').select('*').eq('hotel_code', hotelData.hotel_code);
              detailed.hotels.push({ ...item, hotelInfo: hotelData, priceInfo: priceData || [] });
            }
          } else if (item.service_type === 'rentcar') {
            const { data: rentcarData } = await supabase.from('rentcar').select('*').eq('id', item.service_ref_id).single();
            if (rentcarData) {
              const { data: priceData } = await supabase.from('rentcar_price').select('*').eq('rent_code', rentcarData.rentcar_code);
              detailed.rentcars.push({ ...item, rentcarInfo: rentcarData, priceInfo: priceData || [] });
            }
          } else if (item.service_type === 'tour') {
            // tour 는 tour_code 또는 tour_id 둘 다 가능
            let tourData: any = null;
            const r1 = await supabase.from('tour').select('*').eq('tour_code', item.service_ref_id).maybeSingle();
            if (r1.data) tourData = r1.data;
            else {
              const r2 = await supabase.from('tour').select('*').eq('tour_id', item.service_ref_id).maybeSingle();
              tourData = r2.data;
            }
            if (tourData) {
              const { data: priceData } = await supabase
                .from('tour_pricing')
                .select('*')
                .eq('tour_id', tourData.tour_id)
                .eq('is_active', true);
              detailed.tours.push({ ...item, tourInfo: tourData, priceInfo: priceData || [] });
            }
          }
        } catch (serviceError) {
          console.warn('서비스 로드 중 일부 실패:', serviceError);
        }
      }

      setDetailedServices(detailed);
    } catch (error) { console.error('상세 서비스 정보 로드 실패:', error); }
  };

  /* ─────────── 합계 계산 ─────────── */
  const allItems = useMemo(() => ([
    ...detailedServices.rooms,
    ...detailedServices.cars,
    ...detailedServices.airports,
    ...detailedServices.hotels,
    ...detailedServices.rentcars,
    ...detailedServices.tours,
  ]), [detailedServices]);

  const grandTotal = useMemo(() => {
    return allItems.reduce((sum: number, it: any) => {
      const u = Number(it.unit_price || 0);
      const q = Number(it.quantity || 1);
      const t = Number(it.total_price ?? (u * q));
      return sum + t;
    }, 0);
  }, [allItems]);

  const calcByItem = useMemo(() => {
    return allItems.reduce((sum: number, it: any) => {
      const u = Number(it.unit_price || 0);
      const q = Number(it.quantity || 1);
      return sum + u * q;
    }, 0);
  }, [allItems]);

  const getStatusBadge = (status: string) => {
    const badges: any = {
      pending: 'bg-yellow-100 text-yellow-800', submitted: 'bg-yellow-100 text-yellow-800',
      draft: 'bg-gray-100 text-gray-800', confirmed: 'bg-blue-100 text-blue-800',
      approved: 'bg-blue-100 text-blue-800', rejected: 'bg-red-100 text-red-800',
    };
    const labels: any = {
      pending: '검토 대기', submitted: '제출됨', draft: '임시저장',
      confirmed: '확정됨 (예약)', approved: '승인됨', rejected: '거절됨',
    };
    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${badges[status] || 'bg-gray-100 text-gray-800'}`}>
        {labels[status] || status}
      </span>
    );
  };

  const handleCalculatePrices = async () => {
    try {
      setCalculating(true);
      const success = await updateQuoteItemPrices(quoteId);
      if (success) {
        alert('가격 계산이 완료되었습니다.');
        await Promise.all([loadQuoteDetail(), loadDetailedServices()]);
      } else { alert('가격 계산에 실패했습니다.'); }
    } catch (error) { console.error('가격 계산 오류:', error); alert('가격 계산 중 오류가 발생했습니다.'); }
    finally { setCalculating(false); }
  };

  const handleApproval = async () => {
    try {
      const updateData: any = { status: 'approved', updated_at: new Date().toISOString() };
      if (approvalNote.trim()) updateData.manager_note = approvalNote.trim();
      const { error } = await supabase.from('quote').update(updateData).eq('id', quoteId).select();
      if (error) throw error;
      alert('견적이 승인되었습니다.');
      setShowApprovalModal(false); setApprovalNote(''); await loadQuoteDetail();
    } catch (error: any) { console.error('승인 처리 실패:', error); alert(`승인 실패: ${error?.message || '알 수 없는 오류'}`); }
  };

  const handleRejection = async () => {
    try {
      const updateData: any = { status: 'rejected', updated_at: new Date().toISOString(), manager_note: rejectionReason.trim() };
      const { error } = await supabase.from('quote').update(updateData).eq('id', quoteId).select();
      if (error) throw error;
      alert('견적이 거절되었습니다.');
      setShowRejectionModal(false); setRejectionReason(''); await loadQuoteDetail();
    } catch (error: any) { console.error('거절 처리 실패:', error); alert(`거절 실패: ${error?.message || '알 수 없는 오류'}`); }
  };

  if (loading || !quote) {
    return (
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
        <div className="fixed inset-0 bg-black opacity-40" onClick={onClose} />
        <div className="bg-white w-full max-w-4xl rounded shadow-lg z-50 overflow-auto max-h-[80vh] p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <div className="text-gray-600">견적 정보를 불러오는 중...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="min-h-screen flex items-start justify-center pt-10 px-4">
        <div className="fixed inset-0 bg-black opacity-40" onClick={onClose} />

        <div className="relative bg-white w-full max-w-6xl rounded shadow-lg z-50 overflow-y-auto max-h-[85vh]">
          {/* Header */}
          <div className="bg-white shadow">
            <div className="px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
              <div className="flex items-center space-x-4">
                <h1 className="text-xl font-bold text-gray-900">📋 견적 상세 (모달)</h1>
                {getStatusBadge(quote.status)}
                <button onClick={handleCalculatePrices} disabled={calculating} className={`ml-4 px-3 py-1 rounded text-sm font-medium ${calculating ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                  {calculating ? '계산 중...' : '💰 가격 계산'}
                </button>
                <button onClick={() => { window.location.href = `/manager/quotes/${quoteId}/edit`; }} className="px-3 py-1 bg-green-600 text-white rounded text-sm">✏️ 견적 수정</button>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-sm text-gray-500">매니저: {user?.email}</div>
                <button onClick={onClose} aria-label="모달 닫기" className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">닫기</button>
              </div>
            </div>
          </div>

          <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* 견적 기본 정보 */}
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">📑 견적 기본 정보</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="제목" value={quote.title} />
                  <Field label="상태" value={quote.status} />
                  <Field label="신청일" value={fmtDateTime(quote.created_at)} />
                  <Field label="제출일" value={fmtDateTime(quote.submitted_at)} />
                  <Field label="승인일" value={fmtDateTime(quote.approved_at)} />
                  <Field label="결제 상태" value={quote.payment_status} />
                  <Field label="견적 ID" value={<span className="font-mono text-xs">{quote.id}</span>} />
                  <Field label="DB 총액" value={`${fmt(quote.total_price)} 동`} />
                </div>
                {quote.description && (
                  <div className="mt-3 text-sm text-gray-700 bg-gray-50 rounded p-3 whitespace-pre-wrap">{quote.description}</div>
                )}
              </div>

              {/* 고객 정보 */}
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">👤 고객 정보</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="고객명" value={quote.users?.name} />
                  <Field label="이메일" value={quote.users?.email} />
                  <Field label="연락처" value={quote.users?.phone_number} />
                </div>
              </div>

              {/* 객실 (room) */}
              {detailedServices.rooms.length > 0 && (
                <div className="bg-white shadow rounded-lg p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">🛏 객실 정보 ({detailedServices.rooms.length})</h2>
                  <div className="space-y-4">
                    {detailedServices.rooms.map((room: any, index: number) => {
                      const p = room.priceInfo?.[0];
                      return (
                        <div key={index} className="border border-gray-200 rounded-lg p-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <h3 className="font-medium text-gray-900 mb-2">객실 정보</h3>
                              <Field label="크루즈" value={p?.cruise_name} />
                              <Field label="객실 타입" value={p?.room_type} />
                              <Field label="일정" value={p?.schedule_type} />
                              <Field label="객실 코드" value={<span className="font-mono text-xs">{room.roomInfo?.room_code}</span>} />
                              <Field label="사용일" value={fmtDate(room.usage_date)} />
                              <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                                <span className="text-gray-600">성인: <b>{room.roomInfo?.adult_count || 0}</b></span>
                                <span className="text-gray-600">아동: <b>{room.roomInfo?.child_count || 0}</b></span>
                                <span className="text-gray-600">아동(엑베): <b>{room.roomInfo?.child_extra_bed_count || 0}</b></span>
                                <span className="text-gray-600">유아: <b>{room.roomInfo?.infant_count || 0}</b></span>
                                <span className="text-gray-600">엑스트라베드: <b>{room.roomInfo?.extra_bed_count || 0}</b></span>
                                <span className="text-gray-600">싱글차지: <b>{room.roomInfo?.single_count || 0}</b></span>
                                <span className="text-gray-600">총 인원: <b>{room.roomInfo?.person_count || 0}</b></span>
                              </div>
                            </div>
                            <div>
                              <h3 className="font-medium text-gray-900 mb-2">단가 × 인원 = 소계</h3>
                              {p ? (() => {
                                const rows: Array<{ label: string; price: number; count: number }> = [
                                  { label: '성인', price: Number(p.price_adult || 0), count: Number(room.roomInfo?.adult_count || 0) },
                                  { label: '아동', price: Number(p.price_child || 0), count: Number(room.roomInfo?.child_count || 0) },
                                  { label: '아동(엑베)', price: Number(p.price_child_extra_bed || 0), count: Number(room.roomInfo?.child_extra_bed_count || 0) },
                                  { label: '유아', price: Number(p.price_infant || 0), count: Number(room.roomInfo?.infant_count || 0) },
                                  { label: '엑스트라베드', price: Number(p.price_extra_bed || 0), count: Number(room.roomInfo?.extra_bed_count || 0) },
                                  { label: '싱글', price: Number(p.price_single || 0), count: Number(room.roomInfo?.single_count || 0) },
                                ];
                                const subtotalSum = rows.reduce((s, r) => s + r.price * r.count, 0);
                                return (
                                  <div className="bg-gray-50 p-2 rounded text-xs">
                                    <div className="grid grid-cols-12 gap-1 font-medium text-green-800 border-b border-gray-200 pb-1 mb-1">
                                      <span className="col-span-3">구분</span>
                                      <span className="col-span-4 text-right">단가</span>
                                      <span className="col-span-1 text-center">×</span>
                                      <span className="col-span-1 text-center">인원</span>
                                      <span className="col-span-3 text-right">소계</span>
                                    </div>
                                    {rows.map((r) => (
                                      <div key={r.label} className={`grid grid-cols-12 gap-1 py-0.5 ${r.count === 0 ? 'text-gray-400' : 'text-gray-800'}`}>
                                        <span className="col-span-3">{r.label}</span>
                                        <span className="col-span-4 text-right">{fmt(r.price)}</span>
                                        <span className="col-span-1 text-center">×</span>
                                        <span className="col-span-1 text-center">{r.count}</span>
                                        <span className="col-span-3 text-right font-medium">{fmt(r.price * r.count)}</span>
                                      </div>
                                    ))}
                                    <div className="grid grid-cols-12 gap-1 mt-1 pt-1 border-t border-dashed border-gray-300">
                                      <span className="col-span-9 text-right text-gray-700">인원별 합계</span>
                                      <span className="col-span-3 text-right font-bold text-blue-600">{fmt(subtotalSum)}</span>
                                    </div>
                                  </div>
                                );
                              })() : (
                                <p className="text-sm text-red-600">가격 정보 없음</p>
                              )}
                              <PriceLine unit={room.unit_price} qty={room.quantity} total={room.total_price} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 차량 (car) */}
              {detailedServices.cars.length > 0 && (
                <div className="bg-white shadow rounded-lg p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">🚗 크루즈 차량 ({detailedServices.cars.length})</h2>
                  <div className="space-y-4">
                    {detailedServices.cars.map((car: any, index: number) => {
                      const p = car.priceInfo?.[0];
                      return (
                        <div key={index} className="border border-gray-200 rounded-lg p-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <h3 className="font-medium text-gray-900 mb-2">차량 정보</h3>
                              <Field label="차종" value={p?.vehicle_type} />
                              <Field label="경로" value={p?.route} />
                              <Field label="대여 타입" value={p?.rental_type} />
                              <Field label="차량 수" value={car.carInfo?.car_count || 1} />
                              <Field label="차량 코드" value={<span className="font-mono text-xs">{car.carInfo?.car_code}</span>} />
                              <Field label="사용일" value={fmtDate(car.usage_date)} />
                              {car.carInfo?.special_requests && <Field label="요청사항" value={car.carInfo.special_requests} />}
                            </div>
                            <div>
                              <h3 className="font-medium text-gray-900 mb-2">단가</h3>
                              {p ? (
                                <div className="bg-gray-50 p-2 rounded text-xs">
                                  <div>기본 가격: <b>{fmt(p.price)}</b> 동</div>
                                </div>
                              ) : (
                                <p className="text-sm text-red-600">가격 정보 없음</p>
                              )}
                              <PriceLine unit={car.unit_price} qty={car.quantity} total={car.total_price} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 공항 (airport) */}
              {detailedServices.airports.length > 0 && (
                <div className="bg-white shadow rounded-lg p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">✈️ 공항 차량 ({detailedServices.airports.length})</h2>
                  <div className="space-y-4">
                    {detailedServices.airports.map((airport: any, index: number) => {
                      const p = airport.priceInfo?.[0];
                      return (
                        <div key={index} className="border border-gray-200 rounded-lg p-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <h3 className="font-medium text-gray-900 mb-2">공항 서비스 정보</h3>
                              <Field label="구분" value={p?.service_type} />
                              <Field label="경로" value={p?.route} />
                              <Field label="차종" value={p?.vehicle_type} />
                              <Field label="공항 코드" value={<span className="font-mono text-xs">{airport.airportInfo?.airport_code}</span>} />
                              <Field label="승객 수" value={airport.airportInfo?.passenger_count} />
                              <Field label="사용일" value={fmtDate(airport.usage_date)} />
                              {airport.airportInfo?.special_requests && <Field label="요청사항" value={airport.airportInfo.special_requests} />}
                            </div>
                            <div>
                              <h3 className="font-medium text-gray-900 mb-2">단가</h3>
                              {p ? (
                                <div className="bg-gray-50 p-2 rounded text-xs">
                                  <div>기본 가격: <b>{fmt(p.price)}</b> 동</div>
                                  {p.duration && <div>소요 시간: {p.duration}</div>}
                                </div>
                              ) : (
                                <p className="text-sm text-red-600">가격 정보 없음</p>
                              )}
                              <PriceLine unit={airport.unit_price} qty={airport.quantity} total={airport.total_price} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 호텔 (hotel) */}
              {detailedServices.hotels.length > 0 && (
                <div className="bg-white shadow rounded-lg p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">🏨 호텔 ({detailedServices.hotels.length})</h2>
                  <div className="space-y-4">
                    {detailedServices.hotels.map((hotel: any, index: number) => {
                      const p = hotel.priceInfo?.[0];
                      const checkin = hotel.hotelInfo?.checkin_date;
                      const checkout = hotel.hotelInfo?.checkout_date;
                      let nights: number | undefined;
                      if (checkin && checkout) {
                        const d1 = new Date(checkin); const d2 = new Date(checkout);
                        if (!Number.isNaN(d1.getTime()) && !Number.isNaN(d2.getTime())) {
                          nights = Math.max(0, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
                        }
                      }
                      return (
                        <div key={index} className="border border-gray-200 rounded-lg p-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <h3 className="font-medium text-gray-900 mb-2">호텔 정보</h3>
                              <Field label="호텔명" value={p?.hotel_name} />
                              <Field label="룸 타입" value={p?.room_type} />
                              <Field label="룸 이름" value={p?.room_name} />
                              <Field label="객실 카테고리" value={p?.room_category} />
                              <Field label="조식 포함" value={p?.include_breakfast === undefined ? undefined : (p.include_breakfast ? '예' : '아니오')} />
                              <Field label="체크인" value={fmtDate(checkin)} />
                              <Field label="체크아웃" value={fmtDate(checkout)} />
                              {nights !== undefined && <Field label="박수" value={`${nights}박`} />}
                              <Field label="호텔 코드" value={<span className="font-mono text-xs">{hotel.hotelInfo?.hotel_code}</span>} />
                              {hotel.hotelInfo?.special_requests && <Field label="요청사항" value={hotel.hotelInfo.special_requests} />}
                            </div>
                            <div>
                              <h3 className="font-medium text-gray-900 mb-2">단가</h3>
                              {p ? (
                                <div className="bg-gray-50 p-2 rounded text-xs space-y-0.5">
                                  <div>1박 기본가: <b>{fmt(p.base_price)}</b> 동</div>
                                  {p.extra_person_price ? <div>추가 인원당: <b>{fmt(p.extra_person_price)}</b> 동</div> : null}
                                  {p.season_name ? <div>시즌: {p.season_name}</div> : null}
                                </div>
                              ) : (
                                <p className="text-sm text-red-600">가격 정보 없음</p>
                              )}
                              <PriceLine unit={hotel.unit_price} qty={hotel.quantity} total={hotel.total_price} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 렌터카 (rentcar) */}
              {detailedServices.rentcars.length > 0 && (
                <div className="bg-white shadow rounded-lg p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">🚙 렌터카 ({detailedServices.rentcars.length})</h2>
                  <div className="space-y-4">
                    {detailedServices.rentcars.map((rentcar: any, index: number) => {
                      const p = rentcar.priceInfo?.[0];
                      return (
                        <div key={index} className="border border-gray-200 rounded-lg p-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <h3 className="font-medium text-gray-900 mb-2">렌터카 정보</h3>
                              <Field label="차종" value={p?.vehicle_type} />
                              <Field label="경로" value={p?.route} />
                              <Field label="대여 타입" value={p?.rental_type} />
                              <Field label="이용 시간" value={p?.duration_hours ? `${p.duration_hours}시간` : undefined} />
                              <Field label="렌터카 코드" value={<span className="font-mono text-xs">{rentcar.rentcarInfo?.rentcar_code}</span>} />
                              <Field label="사용일" value={fmtDate(rentcar.usage_date)} />
                              {rentcar.rentcarInfo?.special_requests && <Field label="요청사항" value={rentcar.rentcarInfo.special_requests} />}
                            </div>
                            <div>
                              <h3 className="font-medium text-gray-900 mb-2">단가</h3>
                              {p ? (
                                <div className="bg-gray-50 p-2 rounded text-xs">
                                  <div>기본 가격: <b>{fmt(p.price)}</b> 동</div>
                                </div>
                              ) : (
                                <p className="text-sm text-red-600">가격 정보 없음</p>
                              )}
                              <PriceLine unit={rentcar.unit_price} qty={rentcar.quantity} total={rentcar.total_price} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 투어 (tour) */}
              {detailedServices.tours.length > 0 && (
                <div className="bg-white shadow rounded-lg p-6">
                  <h2 className="text-lg font-medium text-gray-900 mb-4">🎯 투어 ({detailedServices.tours.length})</h2>
                  <div className="space-y-4">
                    {detailedServices.tours.map((tour: any, index: number) => {
                      const p = tour.priceInfo?.[0];
                      return (
                        <div key={index} className="border border-gray-200 rounded-lg p-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <h3 className="font-medium text-gray-900 mb-2">투어 정보</h3>
                              <Field label="투어명" value={tour.tourInfo?.tour_name} />
                              <Field label="카테고리" value={tour.tourInfo?.category} />
                              <Field label="장소" value={tour.tourInfo?.location} />
                              <Field label="소요 시간" value={tour.tourInfo?.duration} />
                              <Field label="그룹 타입" value={tour.tourInfo?.group_type} />
                              <Field label="투어 코드" value={<span className="font-mono text-xs">{tour.tourInfo?.tour_code}</span>} />
                              <Field label="사용일" value={fmtDate(tour.usage_date)} />
                            </div>
                            <div>
                              <h3 className="font-medium text-gray-900 mb-2">단가</h3>
                              {p ? (
                                <div className="bg-gray-50 p-2 rounded text-xs space-y-0.5">
                                  <div>1인 가격: <b>{fmt(p.price_per_person)}</b> 동</div>
                                  {(p.min_guests || p.max_guests) && <div>인원: {p.min_guests}~{p.max_guests}명</div>}
                                  {p.vehicle_type && <div>차종: {p.vehicle_type}</div>}
                                </div>
                              ) : (
                                <p className="text-sm text-red-600">가격 정보 없음</p>
                              )}
                              <PriceLine unit={tour.unit_price} qty={tour.quantity} total={tour.total_price} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 사이드바: 요약 + 승인 */}
            <div className="space-y-6">
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">💰 견적 요약</h2>
                <div className="space-y-2 text-sm">
                  {detailedServices.rooms.length > 0 && <div className="flex justify-between"><span className="text-gray-600">🛏 객실</span><span>{detailedServices.rooms.length}건</span></div>}
                  {detailedServices.cars.length > 0 && <div className="flex justify-between"><span className="text-gray-600">🚗 크루즈 차량</span><span>{detailedServices.cars.length}건</span></div>}
                  {detailedServices.airports.length > 0 && <div className="flex justify-between"><span className="text-gray-600">✈️ 공항 차량</span><span>{detailedServices.airports.length}건</span></div>}
                  {detailedServices.hotels.length > 0 && <div className="flex justify-between"><span className="text-gray-600">🏨 호텔</span><span>{detailedServices.hotels.length}건</span></div>}
                  {detailedServices.rentcars.length > 0 && <div className="flex justify-between"><span className="text-gray-600">🚙 렌터카</span><span>{detailedServices.rentcars.length}건</span></div>}
                  {detailedServices.tours.length > 0 && <div className="flex justify-between"><span className="text-gray-600">🎯 투어</span><span>{detailedServices.tours.length}건</span></div>}

                  <div className="border-t border-gray-200 my-2" />

                  <div className="flex justify-between">
                    <span className="text-gray-600">단가×수량 합계</span>
                    <span className="font-medium text-gray-900">{fmt(calcByItem)} 동</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">아이템 합계 (DB)</span>
                    <span className="font-medium text-gray-900">{fmt(grandTotal)} 동</span>
                  </div>

                  <div className="border-t-2 border-blue-200 my-2" />

                  <div className="flex justify-between items-center">
                    <span className="text-base font-semibold text-gray-800">총 견적가</span>
                    <span className="text-xl font-bold text-blue-600">{fmt(quote.total_price)} 동</span>
                  </div>

                  {Math.abs(Number(quote.total_price || 0) - grandTotal) > 1 && (
                    <div className="text-xs text-orange-600 bg-orange-50 rounded p-2 mt-1">
                      ⚠️ DB 총액과 아이템 합계가 다릅니다. "💰 가격 계산"을 다시 실행하세요.
                    </div>
                  )}

                  <div className="flex justify-between text-xs text-gray-500 mt-2">
                    <span>신청일</span>
                    <span>{fmtDate(quote.created_at)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">🔍 승인 관리</h2>
                <div className="mb-4 p-3 bg-gray-50 rounded-md">
                  <span className="text-sm text-gray-600">현재 상태: </span>
                  {getStatusBadge(quote.status)}
                  <div className="text-xs text-gray-500 mt-1">실제 DB 값: "{quote.status}"</div>
                </div>

                {(quote.status === 'pending' || quote.status === 'submitted' || quote.status === 'draft') && (
                  <div className="space-y-3">
                    <button onClick={() => setShowApprovalModal(true)} className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-4 rounded-md">✅ 승인하기</button>
                    <button onClick={() => setShowRejectionModal(true)} className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-4 rounded-md">❌ 거절하기</button>
                    <p className="text-xs text-gray-500 text-center">승인 후 고객이 예약 신청을 할 수 있습니다.</p>
                  </div>
                )}

                {quote.status === 'approved' && (
                  <div className="text-center py-4">
                    <div className="text-green-600 font-medium">✅ 견적 승인됨</div>
                    <p className="text-sm text-gray-500 mt-1">고객이 예약 신청을 할 수 있습니다.</p>
                  </div>
                )}

                {quote.status === 'rejected' && (
                  <div className="text-center py-4">
                    <div className="text-red-600 font-medium">❌ 거절됨</div>
                    <p className="text-sm text-gray-500 mt-1">이 견적은 거절되었습니다.</p>
                    {quote.manager_note && <p className="text-sm text-red-600 mt-2 bg-red-50 p-2 rounded">사유: {quote.manager_note}</p>}
                  </div>
                )}
              </div>

              {quote.manager_note && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-yellow-800 mb-2">📝 매니저 노트</h3>
                  <p className="text-sm text-yellow-700">{quote.manager_note}</p>
                </div>
              )}
            </div>
          </div>

          {/* 승인 모달 */}
          {showApprovalModal && (
            <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
              <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                <div className="mt-3">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">견적 승인</h3>
                  <p className="text-sm text-gray-600 mb-4">이 견적을 승인하시겠습니까? 승인 후 고객이 예약 신청을 할 수 있습니다.</p>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">승인 메모 (선택)</label>
                    <textarea value={approvalNote} onChange={(e) => setApprovalNote(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" rows={3} placeholder="고객에게 전달할 추가 안내사항을 입력하세요..." />
                  </div>
                  <div className="flex space-x-3">
                    <button onClick={handleApproval} className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md">승인하기</button>
                    <button onClick={() => setShowApprovalModal(false)} className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-medium py-2 px-4 rounded-md">취소</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 거절 모달 */}
          {showRejectionModal && (
            <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
              <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                <div className="mt-3">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">견적 거절</h3>
                  <p className="text-sm text-gray-600 mb-4">이 견적을 거절하시겠습니까? 거절 사유를 입력해주세요.</p>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">거절 사유 <span className="text-red-500">*</span></label>
                    <textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" rows={3} placeholder="거절 사유를 구체적으로 입력해주세요..." required />
                  </div>
                  <div className="flex space-x-3">
                    <button onClick={handleRejection} disabled={!rejectionReason.trim()} className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-300 text-white font-medium py-2 px-4 rounded-md">거절하기</button>
                    <button onClick={() => setShowRejectionModal(false)} className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-700 font-medium py-2 px-4 rounded-md">취소</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default QuoteDetailModal;
