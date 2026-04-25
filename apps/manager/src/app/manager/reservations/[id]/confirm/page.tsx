"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import supabase from "@/lib/supabase";
import ManagerLayout from "@/components/ManagerLayout";
import { Calendar, Mail, Phone, User, MapPin, Clock, Printer, FileDown, Copy } from "lucide-react";

type ServiceType = "cruise" | "airport" | "hotel" | "rentcar" | "tour";

interface ReservationRow {
    re_id: string;
    re_type: ServiceType;
    re_status: string;
    re_created_at: string;
    re_quote_id: string | null;
    re_user_id: string;
}

export default function ReservationConfirmPage() {
    const router = useRouter();
    const params = useParams();
    const reservationId = params?.id as string;
    const printRef = useRef<HTMLDivElement>(null);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [reservation, setReservation] = useState<ReservationRow | null>(null);
    const [customer, setCustomer] = useState<{ id: string; name: string; email: string; phone_number: string } | null>(null);
    const [quote, setQuote] = useState<{ id: string; title: string | null; status: string | null } | null>(null);

    const [cruiseRows, setCruiseRows] = useState<any[]>([]);
    const [cruiseCarRows, setCruiseCarRows] = useState<any[]>([]);
    const [airportRows, setAirportRows] = useState<any[]>([]);
    const [hotelRows, setHotelRows] = useState<any[]>([]);
    const [rentcarRows, setRentcarRows] = useState<any[]>([]);
    const [tourRows, setTourRows] = useState<any[]>([]);

    useEffect(() => {
        if (!reservationId) return;
        (async () => {
            try {
                setLoading(true);
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) { router.push("/login"); return; }

                // 예약 원본
                const { data: r } = await supabase.from("reservation").select("*").eq("re_id", reservationId).maybeSingle();
                if (!r) { setError("예약을 찾을 수 없습니다."); return; }
                setReservation(r as ReservationRow);

                // 고객
                if (r.re_user_id) {
                    const { data: u } = await supabase.from("users").select("id, name, email, phone_number").eq("id", r.re_user_id).maybeSingle();
                    if (u) setCustomer(u as any);
                }

                // 견적
                if (r.re_quote_id) {
                    const { data: q } = await supabase.from("quote").select("id, title, status").eq("id", r.re_quote_id).maybeSingle();
                    if (q) setQuote(q as any);
                }

                // 서비스별 상세
                const rid = reservationId;
                const [cruise, cruiseCar, airport, hotel, rentcar, tour] = await Promise.all([
                    supabase.from("reservation_cruise").select("*").eq("reservation_id", rid),
                    supabase.from("reservation_cruise_car").select("*").eq("reservation_id", rid),
                    supabase.from("reservation_airport").select("*").eq("reservation_id", rid),
                    supabase.from("reservation_hotel").select("*").eq("reservation_id", rid),
                    supabase.from("reservation_rentcar").select("*").eq("reservation_id", rid),
                    supabase.from("reservation_tour").select("*").eq("reservation_id", rid)
                ]);
                setCruiseRows((cruise.data as any[]) || []);
                setCruiseCarRows((cruiseCar.data as any[]) || []);
                setAirportRows((airport.data as any[]) || []);
                setHotelRows((hotel.data as any[]) || []);
                setRentcarRows((rentcar.data as any[]) || []);
                setTourRows((tour.data as any[]) || []);

                setError(null);
            } catch (e: any) {
                console.error(e);
                setError(e?.message || "데이터를 불러오는 중 오류가 발생했습니다.");
            } finally {
                setLoading(false);
            }
        })();
    }, [reservationId]);

    const amounts = useMemo(() => {
        const sum = (arr: any[], key: string) => arr.reduce((s, r) => s + Number(r?.[key] || 0), 0);
        return {
            cruise: sum(cruiseRows, "room_total_price"),
            cruiseCar: sum(cruiseCarRows, "car_total_price"),
            airport: sum(airportRows, "total_price"),
            hotel: sum(hotelRows, "total_price"),
            rentcar: sum(rentcarRows, "total_price"),
            tour: sum(tourRows, "total_price"),
        };
    }, [cruiseRows, cruiseCarRows, airportRows, hotelRows, rentcarRows, tourRows]);

    const grandTotal = useMemo(() => Object.values(amounts).reduce((a, b) => a + b, 0), [amounts]);

    const handlePrint = () => {
        window.print();
    };

    const handleExportPdf = async () => {
        try {
            const el = printRef.current;
            if (!el) return;
            const html2pdf = (await import("html2pdf.js")).default;
            const opt = {
                margin: 10,
                filename: `reservation-${reservation?.re_id?.slice(0, 8) || "confirm"}.pdf`,
                image: { type: "jpeg", quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
            } as any;
            await html2pdf().from(el).set(opt).save();
        } catch (e) {
            console.error("PDF export failed", e);
            alert("PDF 저장 중 오류가 발생했습니다.");
        }
    };

    const handleCopyShare = async () => {
        try {
            const origin = typeof window !== "undefined" ? window.location.origin : "";
            const url = `${origin}/mypage/reservations/${reservationId}/view`;
            await navigator.clipboard.writeText(url);
            alert("공유 링크가 복사되었습니다.");
        } catch (e) {
            alert("클립보드 복사에 실패했습니다.");
        }
    };

    if (loading) {
        return (
            <ManagerLayout title="예약 확인서" activeTab="reservations">
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
                </div>
            </ManagerLayout>
        );
    }

    if (!reservation) {
        return (
            <ManagerLayout title="예약 확인서" activeTab="reservations">
                <div className="text-center py-12 text-gray-600">예약 정보를 찾을 수 없습니다.</div>
            </ManagerLayout>
        );
    }

    const dateStr = new Date(reservation.re_created_at).toLocaleDateString("ko-KR");
    const title = quote?.title || `${reservation.re_type.toUpperCase()} 예약`;

    return (
        <ManagerLayout title="예약 확인서" activeTab="reservations">
            <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <button onClick={() => router.push(`/manager/reservations/${reservation.re_id}/view`)} className="px-3 py-1 rounded border text-sm">뒤로</button>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleCopyShare} className="px-3 py-1 rounded border text-sm flex items-center gap-1"><Copy className="w-4 h-4" /> 공유 링크</button>
                    <button onClick={handlePrint} className="px-3 py-1 rounded border text-sm flex items-center gap-1"><Printer className="w-4 h-4" /> 인쇄</button>
                    <button onClick={handleExportPdf} className="px-3 py-1 rounded bg-blue-600 text-white text-sm flex items-center gap-1 hover:bg-blue-700"><FileDown className="w-4 h-4" /> PDF 저장</button>
                </div>
            </div>

            {/* A4 스타일의 확인서 본문 */}
            <div ref={printRef} className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mx-auto max-w-3xl">
                {/* 헤더 */}
                <div className="text-center mb-6">
                    <h1 className="text-xl font-bold text-gray-900">예약 확인서</h1>
                    <p className="text-sm text-gray-600">발행일: {dateStr}</p>
                </div>

                {/* 고객/예약 개요 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2"><User className="w-4 h-4" /> 고객 정보</div>
                        <div className="text-sm text-gray-800">
                            <div className="font-medium">{customer?.name || '고객'}</div>
                            {customer?.email && <div className="flex items-center gap-1 text-gray-600"><Mail className="w-4 h-4" />{customer.email}</div>}
                            {customer?.phone_number && <div className="flex items-center gap-1 text-gray-600"><Phone className="w-4 h-4" />{customer.phone_number}</div>}
                        </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2"><Calendar className="w-4 h-4" /> 예약 정보</div>
                        <div className="text-sm text-gray-800">
                            <div className="font-medium">{title}</div>
                            <div className="text-gray-600">유형: {reservation.re_type.toUpperCase()} · 상태: {reservation.re_status}</div>
                            <div className="text-gray-600">예약 ID: {reservation.re_id}</div>
                        </div>
                    </div>
                </div>

                {/* 서비스 요약 */}
                <div className="space-y-4 mb-6">
                    {/* 크루즈 */}
                    {cruiseRows.length > 0 && (
                        <div className="border rounded-lg">
                            <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-t font-medium">크루즈</div>
                            <div className="p-4 space-y-2 text-sm">
                                {cruiseRows.map((r, i) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <div className="text-gray-700 flex items-center gap-2"><Clock className="w-4 h-4" /> 체크인 {r.checkin ? new Date(r.checkin).toLocaleDateString('ko-KR') : '-'} · 승객 {r.guest_count || 0}명</div>
                                        <div className="font-medium text-blue-600">{Number(r.room_total_price || 0).toLocaleString()}동</div>
                                    </div>
                                ))}
                                {cruiseCarRows.length > 0 && (
                                    <div className="mt-3 pt-3 border-t">
                                        <div className="text-gray-700 mb-1">연결 차량</div>
                                        {cruiseCarRows.map((c, i) => (
                                            <div key={i} className="flex items-center justify-between text-sm">
                                                <div className="flex items-center gap-2"><MapPin className="w-4 h-4" /> {c.pickup_location || ''} → {c.dropoff_location || ''}</div>
                                                <div className="font-medium text-blue-600">{Number(c.car_total_price || 0).toLocaleString()}동</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* 공항 */}
                    {airportRows.length > 0 && (
                        <div className="border rounded-lg">
                            <div className="bg-green-50 text-green-700 px-4 py-2 rounded-t font-medium">공항</div>
                            <div className="p-4 space-y-2 text-sm">
                                {airportRows.map((r, i) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <div className="text-gray-700 flex items-center gap-2"><Clock className="w-4 h-4" /> {r.ra_datetime ? new Date(r.ra_datetime).toLocaleString('ko-KR') : '-'} · {r.ra_airport_location || ''} {r.ra_flight_number ? `· 편명 ${r.ra_flight_number}` : ''}</div>
                                        <div className="font-medium text-green-700">{Number(r.total_price || 0).toLocaleString()}동</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 호텔 */}
                    {hotelRows.length > 0 && (
                        <div className="border rounded-lg">
                            <div className="bg-purple-50 text-purple-700 px-4 py-2 rounded-t font-medium">호텔</div>
                            <div className="p-4 space-y-2 text-sm">
                                {hotelRows.map((r, i) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <div className="text-gray-700 flex items-center gap-2"><Calendar className="w-4 h-4" /> 체크인 {r.checkin_date ? new Date(r.checkin_date).toLocaleDateString('ko-KR') : '-'} · {r.hotel_category || ''}</div>
                                        <div className="font-medium text-purple-700">{Number(r.total_price || 0).toLocaleString()}동</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 렌터카 */}
                    {rentcarRows.length > 0 && (
                        <div className="border rounded-lg">
                            <div className="bg-red-50 text-red-700 px-4 py-2 rounded-t font-medium">렌터카</div>
                            <div className="p-4 space-y-2 text-sm">
                                {rentcarRows.map((r, i) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <div className="text-gray-700 flex items-center gap-2"><Clock className="w-4 h-4" /> {r.pickup_datetime ? new Date(r.pickup_datetime).toLocaleString('ko-KR') : '-'} · {r.pickup_location || ''}{r.destination ? ` → ${r.destination}` : ''}</div>
                                        <div className="font-medium text-red-700">{Number(r.total_price || 0).toLocaleString()}동</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 투어 */}
                    {tourRows.length > 0 && (
                        <div className="border rounded-lg">
                            <div className="bg-orange-50 text-orange-700 px-4 py-2 rounded-t font-medium">투어</div>
                            <div className="p-4 space-y-2 text-sm">
                                {tourRows.map((r, i) => (
                                    <div key={i} className="flex items-center justify-between">
                                        <div className="text-gray-700 flex items-center gap-2"><Calendar className="w-4 h-4" /> {r.tour_date ? new Date(r.tour_date).toLocaleDateString('ko-KR') : '-'} · {r.pickup_location || ''}{r.dropoff_location ? ` → ${r.dropoff_location}` : ''}</div>
                                        <div className="font-medium text-orange-700">{Number(r.total_price || 0).toLocaleString()}동</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* 합계 */}
                <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200 mb-6">
                    <div className="text-sm text-yellow-800 mb-1">예상 총 금액</div>
                    <div className="text-2xl font-bold text-red-600">{grandTotal.toLocaleString()}동</div>
                </div>

                {/* 비고 */}
                <div className="text-xs text-gray-500 leading-relaxed">
                    - 본 확인서는 예약 내역 확인 용도로 발행되며, 최종 금액 및 일정은 변동될 수 있습니다.
                </div>
            </div>
        </ManagerLayout>
    );
}
