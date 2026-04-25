'use client';

import React, { useEffect, useState } from 'react';
import supabase from '@/lib/supabase';
import { fetchTableInBatches } from '@/lib/fetchInBatches';

interface SeatReservation {
    id: string;
    reservation_id?: string;
    vehicle_number: string;
    seat_number: string;
    sht_category: string;
    pickup_datetime?: string;
    user_name?: string;
    user_email?: string;
}

interface ShtCarSeatMapProps {
    isOpen: boolean;
    onClose: () => void;
    selectedDate?: Date;
    usageDate?: string;
    vehicleNumber?: string;
    onSeatSelect?: (seatInfo: { vehicle: string; seat: string; category: string; usageDate?: string }) => void;
    readOnly?: boolean;
    requiredSeats?: number;
    initialCategory?: 'pickup' | 'dropoff';
    saveToDb?: boolean;
    reservationId?: string;
    quoteId?: string;
    pickupLocation?: string;
    dropoffLocation?: string;
}

type CategoryType = 'pickup' | 'dropoff';

const VEHICLES = ['Vehicle 1', 'Vehicle 2', 'Vehicle 3', 'Vehicle 4', 'Vehicle 5', 'Vehicle 6'];

const SEAT_LAYOUT = {
    driver: { id: 'DRIVER', x: 54, y: 82, label: 'D' },
    topRow: [
        { id: 'X', x: 116, y: 78, label: 'X', disabled: true },
        { id: 'C1', x: 168, y: 78, label: 'C1' },
    ],
    middleRows: [
        [
            { id: 'A1', x: 80, y: 144, label: 'A1' },
            { id: 'A2', x: 168, y: 144, label: 'A2' },
        ],
        [
            { id: 'A3', x: 80, y: 208, label: 'A3' },
            { id: 'A4', x: 168, y: 208, label: 'A4' },
        ],
        [
            { id: 'A5', x: 80, y: 272, label: 'A5' },
            { id: 'A6', x: 168, y: 272, label: 'A6' },
        ],
    ],
    bottomRow: [
        { id: 'B1', x: 80, y: 354, label: 'B1' },
        { id: 'B2', x: 132, y: 354, label: 'B2' },
        { id: 'B3', x: 184, y: 354, label: 'B3' },
    ],
};

const ALL_SEATS = [
    ...SEAT_LAYOUT.topRow.filter((s) => !s.disabled).map((s) => s.id),
    ...SEAT_LAYOUT.middleRows.flat().map((s) => s.id),
    ...SEAT_LAYOUT.bottomRow.map((s) => s.id),
];

const toDateKey = (value?: string | null): string => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const normalizeCategory = (raw?: string | null): CategoryType => {
    const v = String(raw || '').toLowerCase().replace(/-/g, '');
    if (v.includes('drop') || v.includes('sand') || v.includes('send') || v.includes('샌딩')) return 'dropoff';
    return 'pickup';
};

const splitSeats = (seatText?: string | null): string[] => {
    const raw = String(seatText || '').trim();
    if (!raw) return [];
    if (raw.toUpperCase() === 'ALL') return ['ALL'];
    return raw
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
};

export default function ShtCarSeatMap({
    isOpen,
    onClose,
    selectedDate,
    usageDate,
    vehicleNumber,
    onSeatSelect,
    readOnly = false,
    requiredSeats = 1,
    initialCategory = 'pickup',
}: ShtCarSeatMapProps) {
    const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [allData, setAllData] = useState<SeatReservation[]>([]);
    const [currentDate, setCurrentDate] = useState(() => {
        if (usageDate) return usageDate;
        if (selectedDate) return selectedDate.toISOString().split('T')[0];
        return new Date().toISOString().split('T')[0];
    });
    const [activeSelection, setActiveSelection] = useState<{ vehicle: string; category: CategoryType }>({
        vehicle: 'Vehicle 1',
        category: 'pickup',
    });
    const [selectedReservedInfo, setSelectedReservedInfo] = useState<{
        vehicle: string;
        category: CategoryType;
        seat: string;
        details: Array<{ userName: string; email: string; seatNumber: string }>;
    } | null>(null);

    useEffect(() => {
        if (!isOpen) return;

        const initialDate = usageDate || (selectedDate ? selectedDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
        const initialVehicle = vehicleNumber && VEHICLES.includes(vehicleNumber) ? vehicleNumber : 'Vehicle 1';

        setCurrentDate(initialDate);
        setActiveSelection({ vehicle: initialVehicle, category: initialCategory });
        setSelectedSeats([]);
        setSelectedReservedInfo(null);
        setLoading(true);

        const loadData = async () => {
            try {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const todayISO = today.toISOString();

                const { data, error } = await supabase
                    .from('reservation_car_sht')
                    .select('id, reservation_id, vehicle_number, seat_number, sht_category, pickup_datetime')
                    .not('vehicle_number', 'is', null)
                    .gte('pickup_datetime', todayISO)
                    .order('pickup_datetime', { ascending: true });

                if (error) {
                    console.warn('reservation_car_sht 로드 오류:', error);
                    setAllData([]);
                    return;
                }

                const baseRows = (data || []) as SeatReservation[];
                const reservationIds = Array.from(new Set(baseRows.map((r) => r.reservation_id).filter(Boolean))) as string[];

                if (reservationIds.length === 0) {
                    setAllData(baseRows);
                    return;
                }

                const reservationRows = await fetchTableInBatches<any>(
                    'reservation',
                    're_id',
                    reservationIds,
                    're_id, re_user_id',
                    80
                );

                const reservationUserIdById = new Map<string, string>();

                (reservationRows || []).forEach((row: any) => {
                    if (row?.re_id && row?.re_user_id) {
                        reservationUserIdById.set(String(row.re_id), String(row.re_user_id));
                    }
                });

                const userIds = Array.from(new Set(Array.from(reservationUserIdById.values()).filter(Boolean)));
                const userEmailById = new Map<string, string>();
                const userNameById = new Map<string, string>();

                if (userIds.length > 0) {
                    const userRows = await fetchTableInBatches<any>(
                        'users',
                        'id',
                        userIds,
                        'id, name, email',
                        80
                    );

                    (userRows || []).forEach((u: any) => {
                        if (u?.id) {
                            if (u?.email) userEmailById.set(String(u.id), String(u.email));
                            if (u?.name) userNameById.set(String(u.id), String(u.name));
                        }
                    });
                }

                const mergedRows = baseRows.map((row) => {
                    const reservationId = String(row.reservation_id || '');
                    const userId = reservationUserIdById.get(reservationId);
                    const userEmail = (userId && userEmailById.get(userId)) || '';
                    const userName = (userId && userNameById.get(userId)) || '';
                    return {
                        ...row,
                        user_name: userName,
                        user_email: userEmail,
                    };
                });

                setAllData(mergedRows);
            } catch (error) {
                console.error('데이터 로드 오류:', error);
                setAllData([]);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [isOpen, usageDate, selectedDate, vehicleNumber, initialCategory]);

    const getReservationsFor = (vehicle: string, category: CategoryType) => {
        return allData.filter((row) => {
            if (row.vehicle_number !== vehicle) return false;
            if (normalizeCategory(row.sht_category) !== category) return false;
            const pickupDateKey = toDateKey(row.pickup_datetime);
            return pickupDateKey === currentDate;
        });
    };

    const isSeatReserved = (vehicle: string, category: CategoryType, seatId: string) => {
        const rows = getReservationsFor(vehicle, category);
        for (const row of rows) {
            const seats = splitSeats(row.seat_number);
            if (seats.includes('ALL') || seats.includes(seatId.toUpperCase())) {
                return true;
            }
        }
        return false;
    };

    const getSeatReservationDetails = (vehicle: string, category: CategoryType, seatId: string) => {
        const rows = getReservationsFor(vehicle, category).filter((row) => {
            const seats = splitSeats(row.seat_number);
            return seats.includes('ALL') || seats.includes(seatId.toUpperCase());
        });

        return rows.map((row) => ({
            userName: String(row.user_name || '').trim() || '예약자 없음',
            email: String(row.user_email || '').trim() || '이메일 없음',
            seatNumber: String(row.seat_number || '').trim() || '-',
        }));
    };

    const getPanelStatus = (vehicle: string, category: CategoryType) => {
        const rows = getReservationsFor(vehicle, category);
        const reservedSet = new Set<string>();
        let allReserved = false;

        rows.forEach((row) => {
            const seats = splitSeats(row.seat_number);
            if (seats.includes('ALL')) {
                allReserved = true;
            }
            seats.forEach((seat) => reservedSet.add(seat));
        });

        if (allReserved) {
            return { reserved: ALL_SEATS.length, available: 0 };
        }

        const reserved = Array.from(reservedSet).filter((seat) => seat !== 'ALL').length;
        return { reserved, available: Math.max(ALL_SEATS.length - reserved, 0) };
    };

    const handleSelectAll = (vehicle: string, category: CategoryType) => {
        if (readOnly) return;

        const selectable = ALL_SEATS.filter((seat) => !isSeatReserved(vehicle, category, seat));
        if (selectable.length === 0) {
            alert('선택 가능한 좌석이 없습니다.');
            return;
        }
        if (selectable.length !== ALL_SEATS.length) {
            alert('전좌석 선택은 모든 좌석이 비어 있을 때만 가능합니다.');
            return;
        }

        setActiveSelection({ vehicle, category });
        setSelectedSeats(['ALL']);
        setSelectedReservedInfo(null);
    };

    const handleSeatClick = (seatId: string, vehicle: string, category: CategoryType, disabled?: boolean) => {
        if (disabled || seatId === 'DRIVER') return;

        const reserved = isSeatReserved(vehicle, category, seatId);
        if (reserved) {
            setSelectedReservedInfo({
                vehicle,
                category,
                seat: seatId,
                details: getSeatReservationDetails(vehicle, category, seatId),
            });
            setActiveSelection({ vehicle, category });
            return;
        }

        if (readOnly) return;

        setSelectedReservedInfo(null);

        const isDifferentPanel = activeSelection.vehicle !== vehicle || activeSelection.category !== category;
        if (isDifferentPanel) {
            setActiveSelection({ vehicle, category });
            setSelectedSeats([seatId]);
            return;
        }

        setSelectedSeats((prev) => {
            if (prev.includes('ALL')) {
                return ALL_SEATS.filter((seat) => !isSeatReserved(vehicle, category, seat) && seat !== seatId);
            }

            if (prev.includes(seatId)) {
                return prev.filter((seat) => seat !== seatId);
            }

            return [...prev, seatId];
        });
    };

    const getSeatColor = (seatId: string, vehicle: string, category: CategoryType, disabled?: boolean) => {
        if (seatId === 'DRIVER' || disabled) return '#6a6a6a';

        if (isSeatReserved(vehicle, category, seatId)) return '#ff6b6b';

        const isActivePanel = activeSelection.vehicle === vehicle && activeSelection.category === category;
        const isSelected = isActivePanel && (selectedSeats.includes('ALL') || selectedSeats.includes(seatId));

        if (isSelected) return '#4ade80';
        return '#8ecae6';
    };

    const handleConfirmSelection = () => {
        if (selectedSeats.length === 0) {
            alert('좌석을 선택해주세요.');
            return;
        }

        // 전좌석이 선택되었는지 확인: ALL_SEATS의 모든 좌석이 selectedSeats에 포함되면 "ALL"로 변환
        const isAllSeatsSelected = selectedSeats.includes('ALL') || ALL_SEATS.every(seat => selectedSeats.includes(seat));
        const seatValue = isAllSeatsSelected ? 'ALL' : selectedSeats.join(',');

        onSeatSelect?.({
            vehicle: activeSelection.vehicle,
            seat: seatValue,
            category: activeSelection.category,
            usageDate: currentDate,
        });

        onClose();
    };

    const changeDate = (delta: number) => {
        try {
            const d = new Date(currentDate);
            d.setDate(d.getDate() + delta);
            const newDate = d.toISOString().split('T')[0];
            setCurrentDate(newDate);
            setSelectedSeats([]);
            setSelectedReservedInfo(null);
        } catch (err) {
            console.warn('date change failed', err);
        }
    };

    if (!isOpen) return null;

    const renderSeatSvg = (vehicle: string, category: CategoryType) => (
        <svg viewBox="0 0 280 440" className="w-full max-w-[260px] mx-auto">
            <rect x="20" y="40" width="240" height="380" rx="20" fill="#f0f0f0" stroke="#333" strokeWidth="2" />

            <g>
                <rect
                    x={SEAT_LAYOUT.driver.x}
                    y={SEAT_LAYOUT.driver.y}
                    width="40"
                    height="40"
                    rx="8"
                    fill={getSeatColor(SEAT_LAYOUT.driver.id, vehicle, category)}
                    stroke="#333"
                    strokeWidth="1"
                />
                <text
                    x={SEAT_LAYOUT.driver.x + 20}
                    y={SEAT_LAYOUT.driver.y + 25}
                    textAnchor="middle"
                    fill="#fff"
                    fontSize="12"
                    fontWeight="bold"
                >
                    {SEAT_LAYOUT.driver.label}
                </text>
            </g>

            {SEAT_LAYOUT.topRow.map((seat) => (
                <g
                    key={seat.id}
                    onClick={(e) => {
                        e.stopPropagation();
                        handleSeatClick(seat.id, vehicle, category, seat.disabled);
                    }}
                    style={{ cursor: seat.disabled || readOnly ? 'default' : 'pointer' }}
                >
                    <rect
                        x={seat.x}
                        y={seat.y}
                        width="40"
                        height="40"
                        rx="8"
                        fill={getSeatColor(seat.id, vehicle, category, seat.disabled)}
                        stroke="#333"
                        strokeWidth="1"
                    />
                    <text
                        x={seat.x + 20}
                        y={seat.y + 25}
                        textAnchor="middle"
                        fill="#fff"
                        fontSize="12"
                        fontWeight="bold"
                    >
                        {seat.label}
                    </text>
                </g>
            ))}

            {SEAT_LAYOUT.middleRows.map((row, rowIndex) => (
                <g key={rowIndex}>
                    {row.map((seat) => (
                        <g
                            key={seat.id}
                            onClick={(e) => {
                                e.stopPropagation();
                                handleSeatClick(seat.id, vehicle, category);
                            }}
                            style={{ cursor: readOnly ? 'default' : 'pointer' }}
                        >
                            <rect
                                x={seat.x}
                                y={seat.y}
                                width="40"
                                height="40"
                                rx="8"
                                fill={getSeatColor(seat.id, vehicle, category)}
                                stroke="#333"
                                strokeWidth="1"
                            />
                            <text
                                x={seat.x + 20}
                                y={seat.y + 25}
                                textAnchor="middle"
                                fill="#fff"
                                fontSize="12"
                                fontWeight="bold"
                            >
                                {seat.label}
                            </text>
                        </g>
                    ))}
                </g>
            ))}

            {SEAT_LAYOUT.bottomRow.map((seat) => (
                <g
                    key={seat.id}
                    onClick={(e) => {
                        e.stopPropagation();
                        handleSeatClick(seat.id, vehicle, category);
                    }}
                    style={{ cursor: readOnly ? 'default' : 'pointer' }}
                >
                    <rect
                        x={seat.x}
                        y={seat.y}
                        width="40"
                        height="40"
                        rx="8"
                        fill={getSeatColor(seat.id, vehicle, category)}
                        stroke="#333"
                        strokeWidth="1"
                    />
                    <text
                        x={seat.x + 20}
                        y={seat.y + 25}
                        textAnchor="middle"
                        fill="#fff"
                        fontSize="12"
                        fontWeight="bold"
                    >
                        {seat.label}
                    </text>
                </g>
            ))}
        </svg>
    );

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-[96vw] w-full mx-4 max-h-[92vh] overflow-y-auto">
                <div className="flex items-center justify-between p-6 border-b">
                    <h2 className="text-xl font-semibold">🚗 스테이하롱 셔틀 리무진 좌석 선택</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-2xl">✕</button>
                </div>

                <div className="p-4 bg-gray-50 border-b flex flex-col md:flex-row md:items-end gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">날짜</label>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => changeDate(-1)}
                                className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                                aria-label="이전일"
                            >
                                ◀
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const today = new Date();
                                    const iso = today.toISOString().split('T')[0];
                                    setCurrentDate(iso);
                                    setSelectedSeats([]);
                                    setSelectedReservedInfo(null);
                                }}
                                className="px-3 py-1 rounded bg-white border border-gray-200 hover:bg-gray-50 text-sm"
                                aria-label="오늘"
                            >
                                오늘
                            </button>
                            <input
                                type="date"
                                value={currentDate}
                                onChange={(e) => {
                                    setCurrentDate(e.target.value);
                                    setSelectedSeats([]);
                                }}
                                className="w-full md:w-56 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                type="button"
                                onClick={() => changeDate(1)}
                                className="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                                aria-label="다음일"
                            >
                                ▶
                            </button>
                        </div>
                    </div>
                    {!readOnly && (
                        <div className="text-sm text-gray-700">
                            선택 대상: <strong>{activeSelection.vehicle}</strong> / <strong>{activeSelection.category === 'pickup' ? '픽업' : '드롭오프'}</strong>
                            <span className="ml-2 text-gray-500">(필요 좌석: {requiredSeats}석)</span>
                        </div>
                    )}

                    {selectedReservedInfo && (
                        <div className="w-full rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                            <div className="font-semibold text-red-700 mb-1">
                                예약 좌석 정보: {selectedReservedInfo.vehicle} / {selectedReservedInfo.category === 'pickup' ? '픽업' : '드롭오프'} / {selectedReservedInfo.seat}
                            </div>
                            {selectedReservedInfo.details.map((detail, idx) => (
                                <p key={`${detail.userName}-${detail.seatNumber}-${idx}`}>
                                    예약자 {detail.userName} | 이메일 {detail.email} | 좌석번호 {detail.seatNumber}
                                </p>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-6">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                            <p className="mt-4 text-gray-600">데이터를 불러오는 중...</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                {VEHICLES.map((vehicle) => {
                                    const pickupStatus = getPanelStatus(vehicle, 'pickup');
                                    const dropoffStatus = getPanelStatus(vehicle, 'dropoff');
                                    return (
                                        <section key={vehicle} className="rounded-lg border border-gray-200 p-3">
                                            <h3 className="text-sm font-bold text-gray-900 mb-3">{vehicle}</h3>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                {(['pickup', 'dropoff'] as CategoryType[]).map((category) => {
                                                    const status = category === 'pickup' ? pickupStatus : dropoffStatus;
                                                    const isActive = activeSelection.vehicle === vehicle && activeSelection.category === category;
                                                    return (
                                                        <div
                                                            key={`${vehicle}-${category}`}
                                                            className={`rounded-lg border p-3 ${isActive ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'}`}
                                                            onClick={() => {
                                                                if (!readOnly) {
                                                                    setActiveSelection({ vehicle, category });
                                                                    setSelectedSeats([]);
                                                                }
                                                            }}
                                                        >
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className={`text-[11px] px-2 py-0.5 rounded-full ${category === 'pickup' ? 'bg-blue-100 text-blue-700' : 'bg-cyan-100 text-cyan-700'}`}>
                                                                    {category === 'pickup' ? '픽업' : '드롭오프'}
                                                                </span>
                                                            </div>

                                                            <div className="text-xs text-gray-600 mb-2 text-center">
                                                                빈좌석 <span className="text-green-600 font-semibold">{status.available}</span> / 예약 <span className="text-red-600 font-semibold">{status.reserved}</span>
                                                            </div>

                                                            {renderSeatSvg(vehicle, category)}

                                                            {!readOnly && (
                                                                <div className="mt-3 flex justify-center">
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleSelectAll(vehicle, category);
                                                                        }}
                                                                        className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                                                                    >
                                                                        전좌석 선택
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </section>
                                    );
                                })}
                            </div>

                            {selectedReservedInfo && (
                                <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                                    <h4 className="text-sm font-semibold text-red-700 mb-2">
                                        예약 좌석 정보: {selectedReservedInfo.vehicle} / {selectedReservedInfo.category === 'pickup' ? '픽업' : '드롭오프'} / {selectedReservedInfo.seat}
                                    </h4>
                                    <div className="space-y-1 text-sm text-red-900">
                                        {selectedReservedInfo.details.map((detail, idx) => (
                                            <p key={`${detail.userName}-${detail.seatNumber}-${idx}`}>
                                                예약자 {detail.userName} | 이메일 {detail.email} | 좌석번호 {detail.seatNumber}
                                            </p>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="mt-2 flex flex-wrap gap-4 justify-center text-sm">
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 rounded" style={{ backgroundColor: '#8ecae6' }}></div>
                                    <span className="text-gray-700">빈 좌석</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 rounded" style={{ backgroundColor: '#ff6b6b' }}></div>
                                    <span className="text-gray-700">예약됨</span>
                                </div>
                                {!readOnly && (
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 rounded" style={{ backgroundColor: '#4ade80' }}></div>
                                        <span className="text-gray-700">선택됨</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {selectedSeats.length > 0 && !readOnly && (
                    <div className="p-6 bg-green-50 border-t">
                        <h3 className="text-lg font-semibold text-gray-800 mb-2">
                            ✓ 선택된 좌석: {selectedSeats.includes('ALL') ? 'ALL' : selectedSeats.join(', ')}
                        </h3>
                        <div className="text-sm space-y-1 text-gray-700">
                            <p>차량: {activeSelection.vehicle}</p>
                            <p>서비스: {activeSelection.category === 'pickup' ? '픽업' : '드롭오프'}</p>
                            <p>날짜: {currentDate}</p>
                        </div>
                        <div className="mt-4 flex gap-3">
                            <button
                                onClick={handleConfirmSelection}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                            >
                                좌석 선택 완료
                            </button>
                            <button
                                onClick={() => setSelectedSeats([])}
                                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                선택 취소
                            </button>
                        </div>
                    </div>
                )}

                <div className="p-4 bg-yellow-50 border-t text-sm text-gray-700">
                    💡 <strong>좌석 안내:</strong> 6대 차량의 픽업/드롭오프 좌석도를 한 화면에서 확인/수정합니다.
                    {readOnly ? ' 현재 예약 현황 조회 모드입니다.' : ' 원하는 패널을 클릭한 뒤 좌석을 선택하세요.'}
                </div>
            </div>
        </div>
    );
}
