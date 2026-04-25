"use client";
import React, { useEffect, useMemo, useState } from "react";
import ManagerLayout from "../../../../components/ManagerLayout";
import supabase from "@/lib/supabase";
import { fetchTableInBatches } from "@/lib/fetchInBatches";
import { Calendar, Car, Loader2, Printer } from "lucide-react";

type GroupMode = "day" | "vehicle" | "category";
type ViewMode = "table" | "card";

interface CruiseCarRow {
    id: string;
    reservation_id: string;
    pickup_datetime: string | null;
    vehicle_type: string | null;
    way_type: string | null;
    created_at?: string;
    pickup_location?: string | null;
    dropoff_location?: string | null;
    dispatch_code?: string | null;
    booker_name?: string | null;
    booker_email?: string | null;
    pier_location?: string | null;
    car_category?: string | null;
    car_type?: string | null;
}

const fmtDate = (v?: string | null) => { if (!v) return "-"; try { return new Date(v).toLocaleDateString("ko-KR"); } catch { return v as string; } };
const labelCategory = (cat?: string | null) => { if (!cat) return "미지정"; const norm = cat.toLowerCase(); if (norm === "pickup") return "픽업"; if (norm === "dropoff" || norm === "drop-off") return "드랍"; return cat; };

export default function ManagerReportCruiseCarPage() {
    const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
    const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
    const [groupMode, setGroupMode] = useState<GroupMode>("day");
    const [viewMode, setViewMode] = useState<ViewMode>("table");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rows, setRows] = useState<CruiseCarRow[]>([]);

    useEffect(() => {
        let mounted = true;
        const load = async () => {
            setLoading(true);
            setError(null);
            try {
                const { data: baseRows, error: baseError } = await supabase
                    .from("reservation_cruise_car")
                    .select("id, reservation_id, pickup_datetime, created_at, pickup_location, dropoff_location, dispatch_code, vehicle_type, way_type")
                    .gte("pickup_datetime", startDate)
                    .lte("pickup_datetime", endDate)
                    .order("pickup_datetime", { ascending: true });

                if (baseError) throw baseError;

                const reservationIds = Array.from(new Set((baseRows || [])
                    .map((r: any) => r.reservation_id)
                    .filter(Boolean))) as string[];

                const reservationRows = reservationIds.length > 0
                    ? await fetchTableInBatches<any>(
                        "reservation",
                        "re_id",
                        reservationIds,
                        "re_id, re_user_id",
                        80
                    )
                    : [];

                const userIds = Array.from(new Set((reservationRows || [])
                    .map((r: any) => r.re_user_id)
                    .filter(Boolean))) as string[];

                const userRows = userIds.length > 0
                    ? await fetchTableInBatches<any>(
                        "users",
                        "id",
                        userIds,
                        "id, name, email",
                        80
                    )
                    : [];

                const reservationToUserId = new Map((reservationRows || []).map((r: any) => [r.re_id, r.re_user_id]));
                const userById = new Map((userRows || []).map((u: any) => [u.id, u]));

                const mergedRows = (baseRows || []).map((r: any) => {
                    const userId = r.reservation_id ? reservationToUserId.get(r.reservation_id) : null;
                    const user = userId ? userById.get(userId) : null;

                    return {
                        id: r.id,
                        reservation_id: r.reservation_id,
                        pickup_datetime: r.pickup_datetime,
                        vehicle_type: r.vehicle_type || null,
                        way_type: r.way_type || null,
                        created_at: r.created_at,
                        pickup_location: r.pickup_location || null,
                        dropoff_location: r.dropoff_location || null,
                        dispatch_code: r.dispatch_code || null,
                        booker_name: user?.name || null,
                        booker_email: user?.email || null,
                        pier_location: null,
                        car_category: null,
                        car_type: r.vehicle_type || null,
                    };
                });

                if (!mounted) return;
                const map = new Map<string, any>();
                mergedRows.forEach((r: any) => { if (r && r.id && !map.has(r.id)) map.set(r.id, r); });
                setRows(Array.from(map.values()) as any);
                return;
            } catch (err: any) {
                if (!mounted) return;
                console.error(err);
                setError(err?.message || "데이터 로드 실패");
            } finally {
                if (!mounted) return;
                setLoading(false);
            }
        };
        load();
        return () => { mounted = false; };
    }, [startDate, endDate]);

    const grouped = useMemo(() => {
        const groups = new Map<string, CruiseCarRow[]>();
        const keyOf = (r: CruiseCarRow) => {
            if (groupMode === "vehicle") return r.vehicle_type || "미지정";
            if (groupMode === "category") return labelCategory(r.way_type);
            const d = r.pickup_datetime ? String(r.pickup_datetime).slice(0, 10) : "미지정";
            return d;
        };
        rows.forEach((r) => { const k = keyOf(r); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(r); });
        const entries = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        return entries.map(([key, items]) => ({ key, items }));
    }, [rows, groupMode]);

    const computePrintTitle = () => {
        const s = startDate; const e = endDate; const period = s === e ? s : `${s}~${e}`; return `${period} 크루즈 차량 배차표`;
    };
    const handlePrint = () => {
        if (typeof window === "undefined") return;
        const prevTitle = document.title; const newTitle = computePrintTitle();
        const restore = () => { document.title = prevTitle; window.removeEventListener("afterprint", restore); };
        window.addEventListener("afterprint", restore);
        document.title = newTitle; window.print();
        setTimeout(() => { document.title = prevTitle; window.removeEventListener("afterprint", restore); }, 5000);
    };

    const isPickup = (cat?: string | null) => !!cat && cat.toLowerCase().includes("pick");
    const isDropoff = (cat?: string | null) => !!cat && cat.toLowerCase().includes("drop");

    return (
        <ManagerLayout title="크루즈 차량 리포트" activeTab="reports-cruise-car">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4 print:hidden">
                <div className="flex flex-wrap items-end gap-3">
                    <div>
                        <label className="block text-xs text-gray-600 mb-1">시작일</label>
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-600 mb-1">종료일</label>
                        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border border-gray-200 rounded px-2 py-1 text-sm" />
                    </div>
                    <div className="w-full md:w-auto">
                        <div className="flex items-center gap-3">
                            <div>
                                <label className="block text-xs text-gray-600 mb-1">그룹화</label>
                                <div className="inline-flex rounded-lg overflow-hidden border border-gray-200">
                                    <button onClick={() => setGroupMode("day")} className={`px-3 py-1 text-sm ${groupMode === "day" ? "bg-blue-500 text-white" : "bg-white text-gray-700"}`} title="일별">일별</button>
                                    <button onClick={() => setGroupMode("vehicle")} className={`px-3 py-1 text-sm ${groupMode === "vehicle" ? "bg-blue-500 text-white" : "bg-white text-gray-700"}`} title="차량별">차량별</button>
                                    <button onClick={() => setGroupMode("category")} className={`px-3 py-1 text-sm ${groupMode === "category" ? "bg-blue-500 text-white" : "bg-white text-gray-700"}`} title="구분별">구분별</button>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs text-gray-600 mb-1">보기</label>
                                <div className="inline-flex rounded-lg overflow-hidden border border-gray-200">
                                    <button onClick={() => setViewMode("table")} className={`px-3 py-1 text-sm ${viewMode === "table" ? "bg-green-600 text-white" : "bg-white text-gray-700"}`} title="테이블">테이블</button>
                                    <button onClick={() => setViewMode("card")} className={`px-3 py-1 text-sm ${viewMode === "card" ? "bg-green-600 text-white" : "bg-white text-gray-700"}`} title="카드">카드</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handlePrint} className="inline-flex items-center gap-2 bg-blue-600 text-white px-3 py-2 rounded text-sm hover:bg-blue-700">
                        <Printer className="w-4 h-4" /> 인쇄
                    </button>
                </div>
            </div>

            <div className="hidden print:block mb-3">
                <div className="text-center">
                    <h1 className="text-xl font-bold">크루즈 차량 리포트</h1>
                    <div className="text-sm text-gray-700 mt-1">기간: {startDate} ~ {endDate} · 그룹화: {groupMode === "day" ? "일별" : groupMode === "vehicle" ? "차량별" : "구분별"}</div>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center h-48 text-gray-500"><Loader2 className="w-5 h-5 animate-spin mr-2" /> 불러오는 중...</div>
                ) : error ? (
                    <div className="p-6 text-red-600 text-sm">{error}</div>
                ) : grouped.length === 0 ? (
                    <div className="p-10 text-center text-gray-500">데이터가 없습니다.</div>
                ) : (
                    <div className="divide-y divide-gray-200">
                        {grouped.map((g) => (
                            <div key={g.key} className="break-inside-avoid">
                                <div className="px-4 py-2 bg-gray-50 flex items-center gap-2 print:bg-white">
                                    {groupMode === "day" ? <Calendar className="w-4 h-4 text-blue-600" /> : <Car className="w-4 h-4 text-blue-600" />}
                                    <span className="font-semibold text-gray-800">{g.key}</span>
                                    <span className="ml-2 text-xs text-gray-500">총 {g.items.length}건</span>
                                </div>
                                <div className="overflow-x-auto">
                                    {viewMode === "table" ? (
                                        <div className="space-y-4">
                                            {g.items.filter((it) => isPickup(it.way_type)).length > 0 && (
                                                <table className="w-full text-sm">
                                                    <thead className="bg-gray-50 print:bg-white">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left text-xs text-gray-600">카테고리/타입</th>
                                                            <th className="px-3 py-2 text-left text-xs text-gray-600">사용일자</th>
                                                            <th className="px-3 py-2 text-left text-xs text-gray-600">픽업일시</th>
                                                            <th className="px-3 py-2 text-left text-xs text-gray-600">예약자</th>
                                                            <th className="px-3 py-2 text-left text-xs text-gray-600">승차위치</th>
                                                            <th className="px-3 py-2 text-left text-xs text-gray-600">하차위치</th>
                                                            <th className="px-3 py-2 text-left text-xs text-gray-600">선착장</th>
                                                            <th className="px-3 py-2 text-left text-xs text-gray-600">배차코드</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {g.items
                                                            .filter((it) => isPickup(it.way_type))
                                                            .map((r) => (
                                                                <tr key={r.id} className="border-t border-gray-100">
                                                                    <td className="px-3 py-2">{(r.car_category || r.car_type) ? `${r.car_category || '-'} / ${r.car_type || '-'}` : labelCategory(r.way_type)}</td>
                                                                    <td className="px-3 py-2">{fmtDate(r.pickup_datetime)}</td>
                                                                    <td className="px-3 py-2">{fmtDate(r.pickup_datetime)}</td>
                                                                    <td className="px-3 py-2">{r.booker_name || r.booker_email || "-"}</td>
                                                                    <td className="px-3 py-2">{r.pickup_location || "-"}</td>
                                                                    <td className="px-3 py-2">{r.dropoff_location || "-"}</td>
                                                                    <td className="px-3 py-2">{r.pier_location || "-"}</td>
                                                                    <td className="px-3 py-2">{r.dispatch_code || "-"}</td>
                                                                </tr>
                                                            ))}
                                                    </tbody>
                                                </table>
                                            )}

                                            {g.items.filter((it) => isDropoff(it.way_type) && !isPickup(it.way_type)).length > 0 && (
                                                <table className="w-full text-sm">
                                                    <thead className="bg-gray-50 print:bg-white">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left text-xs text-gray-600">카테고리/타입</th>
                                                            <th className="px-3 py-2 text-left text-xs text-gray-600">사용일자</th>
                                                            <th className="px-3 py-2 text-left text-xs text-gray-600">픽업일시</th>
                                                            <th className="px-3 py-2 text-left text-xs text-gray-600">예약자</th>
                                                            <th className="px-3 py-2 text-left text-xs text-gray-600">선착장</th>
                                                            <th className="px-3 py-2 text-left text-xs text-gray-600">하차위치</th>
                                                            <th className="px-3 py-2 text-left text-xs text-gray-600">배차코드</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {g.items
                                                            .filter((it) => isDropoff(it.way_type) && !isPickup(it.way_type))
                                                            .map((r) => (
                                                                <tr key={r.id} className="border-t border-gray-100">
                                                                    <td className="px-3 py-2">{(r.car_category || r.car_type) ? `${r.car_category || '-'} / ${r.car_type || '-'}` : labelCategory(r.way_type)}</td>
                                                                    <td className="px-3 py-2">{fmtDate(r.pickup_datetime)}</td>
                                                                    <td className="px-3 py-2">{fmtDate(r.pickup_datetime)}</td>
                                                                    <td className="px-3 py-2">{r.booker_name || r.booker_email || "-"}</td>
                                                                    <td className="px-3 py-2">{r.pier_location || "-"}</td>
                                                                    <td className="px-3 py-2">{r.dropoff_location || "-"}</td>
                                                                    <td className="px-3 py-2">{r.dispatch_code || "-"}</td>
                                                                </tr>
                                                            ))}
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                            {g.items.map((r) => (
                                                <div key={r.id} className="border border-gray-200 rounded-lg p-3 bg-white shadow-sm break-inside-avoid">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="text-base font-semibold text-gray-800">{r.booker_name || r.booker_email || fmtDate(r.pickup_datetime)}</div>
                                                        <div className="text-xs px-2 py-0.5 rounded bg-blue-50 text-black border border-blue-100">
                                                            {(r.car_category || r.car_type) ? `${r.car_category || '-'} / ${r.car_type || '-'}` : labelCategory(r.way_type)}
                                                        </div>
                                                    </div>
                                                    <div className="text-sm text-gray-500 mb-2">{fmtDate(r.pickup_datetime)}</div>
                                                    <div className="text-sm text-gray-600 space-y-2">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs px-2 py-0.5 rounded bg-green-50 text-black border border-green-100">픽업일시</span>
                                                            <span className="text-sm font-medium text-gray-700">{fmtDate(r.pickup_datetime)}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs px-2 py-0.5 rounded bg-green-50 text-black border border-green-100">승차</span>
                                                            <span className="text-sm font-medium text-gray-700">{r.pickup_location || "-"}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs px-2 py-0.5 rounded bg-green-50 text-black border border-green-100">하차</span>
                                                            <span className="text-sm font-medium text-gray-700">{r.dropoff_location || "-"}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs px-2 py-0.5 rounded bg-green-50 text-black border border-green-100">선착장</span>
                                                            <span className="text-sm font-medium text-gray-700">{r.pier_location || "-"}</span>
                                                        </div>
                                                        <div className="mt-2 flex items-center gap-2">
                                                            <span className="text-xs px-2 py-0.5 rounded bg-green-50 text-black border border-green-100">배차코드</span>
                                                            <span className="text-sm font-medium text-gray-700">{r.dispatch_code || "-"}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <style>{`
        @media print {
          nav, aside, header, footer { display: none !important; }
          .break-inside-avoid { break-inside: avoid; page-break-inside: avoid; }
          body { background: #fff; }
        }
      `}</style>
        </ManagerLayout>
    );
}
