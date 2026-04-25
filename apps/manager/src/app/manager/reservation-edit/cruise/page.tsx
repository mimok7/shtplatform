'use client';

import React, { useState, useEffect, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import { saveAdditionalFeeTemplateFromInput } from '@/lib/additionalFeeTemplate';
import ManagerLayout from '@/components/ManagerLayout';
import {
    Save,
    ArrowLeft,
    Calendar,
    Users,
    Ship,
    MapPin,
    Clock,
    User,
    Phone,
    Mail,
    Plus,
    Trash2
} from 'lucide-react';

interface CruiseReservation {
    reservation_id: string;
    room_price_code: string;
    room_count?: number;
    guest_count: number;
    checkin: string;
    room_total_price: number;
    request_note: string;
    // 추가 정보
    reservation: {
        re_id: string;
        re_status: string;
        re_created_at: string;
        users: {
            name: string;
            email: string;
            phone: string;
        };
        quote: {
            title: string;
        } | null;
    };
    room_price: {
        id: string;
        cruise_name?: string;
        cruise?: string;
        room_type?: string;
        room_type_en?: string;
        schedule_type?: string;
        schedule?: string;
        price_adult: number;
        price?: number;
        price_child?: number;
        price_child_older?: number;
        price_child_extra_bed?: number;
        price_infant?: number;
        price_extra_bed?: number;
        price_single?: number;
        room_info?: {
            name: string;
            description: string;
            capacity: number;
        } | null;
    } | null;
}

interface CruiseRoomForm {
    room_count: number;
    guest_count: number;
    adult_count: number;
    child_count: number;
    child_older_count: number;
    child_extra_bed_count: number;
    infant_count: number;
    extra_bed_count: number;
    single_count: number;
    checkin: string;
    room_total_price: number;
    room_price_code: string;
}

const createEmptyRoomForm = (overrides: Partial<CruiseRoomForm> = {}): CruiseRoomForm => ({
    room_count: 1,
    guest_count: 0,
    adult_count: 0,
    child_count: 0,
    child_older_count: 0,
    child_extra_bed_count: 0,
    infant_count: 0,
    extra_bed_count: 0,
    single_count: 0,
    checkin: '',
    room_total_price: 0,
    room_price_code: '',
    ...overrides,
});

function CruiseReservationEditContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const reservationId = searchParams.get('id');

    const [reservation, setReservation] = useState<CruiseReservation | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [carData, setCarData] = useState<any[]>([]);
    const [roomForms, setRoomForms] = useState<CruiseRoomForm[]>([createEmptyRoomForm()]);
    const [roomPriceDetails, setRoomPriceDetails] = useState<any[]>([]);
    const [roomPriceOptions, setRoomPriceOptions] = useState<any[]>([]);
    const [cruiseOptions, setCruiseOptions] = useState<string[]>([]);
    const [roomTypeOptions, setRoomTypeOptions] = useState<string[]>([]);
    const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
    const [scheduleOptions, setScheduleOptions] = useState<string[]>([]);

    // 차량 가격 옵션
    const [carPriceOptions, setCarPriceOptions] = useState<any[]>([]);
    const [carCruiseOptions, setCarCruiseOptions] = useState<string[]>([]);
    const [carTypeOptions, setCarTypeOptions] = useState<string[]>([]);
    const [carCategoryOptions, setCarCategoryOptions] = useState<string[]>([]);

    // 추가 옵션 (cruise_tour_options)
    const [tourOptions, setTourOptions] = useState<any[]>([]);
    const [selectedOptionIds, setSelectedOptionIds] = useState<number[]>([]);
    const [additionalFee, setAdditionalFee] = useState(0);
    const [additionalFeeDetail, setAdditionalFeeDetail] = useState('');
    const [feeTemplates, setFeeTemplates] = useState<{ id: number; name: string; amount: number }[]>([]);
    const [storedReservationTotal, setStoredReservationTotal] = useState<number | null>(null);
    const [storedAdditionalFee, setStoredAdditionalFee] = useState<number | null>(null);
    const [isAdditionalFeeInitialized, setIsAdditionalFeeInitialized] = useState(false);

    const [requestNote, setRequestNote] = useState('');
    const [isChildBirthDateModalOpen, setIsChildBirthDateModalOpen] = useState(false);
    const [isInfantBirthDateModalOpen, setIsInfantBirthDateModalOpen] = useState(false);
    const [childBirthDates, setChildBirthDates] = useState<string[]>([]);
    const [infantBirthDates, setInfantBirthDates] = useState<string[]>([]);
    const [tempChildBirthDates, setTempChildBirthDates] = useState<string[]>([]);
    const [tempInfantBirthDates, setTempInfantBirthDates] = useState<string[]>([]);
    const [childBirthTargetCount, setChildBirthTargetCount] = useState(0);
    const [infantBirthTargetCount, setInfantBirthTargetCount] = useState(0);

    const getRoomGuestCount = (room: CruiseRoomForm) => (
        (room.adult_count || 0) +
        (room.child_count || 0) +
        (room.child_older_count || 0) +
        (room.child_extra_bed_count || 0) +
        (room.infant_count || 0) +
        (room.extra_bed_count || 0) +
        (room.single_count || 0)
    );

    const calculateRoomTotalPrice = (detail: any, data: CruiseRoomForm) => {
        const priceAdult = detail?.price_adult || detail?.price || 0;
        const priceChild = detail?.price_child || 0;
        const priceChildOlder = detail?.price_child_older || priceChild;
        const priceChildExtraBed = detail?.price_child_extra_bed || 0;
        const priceInfant = detail?.price_infant || 0;
        const priceExtraBed = detail?.price_extra_bed || 0;
        const priceSingle = detail?.price_single || 0;

        return (
            (data.adult_count || 0) * priceAdult +
            (data.child_count || 0) * priceChild +
            (data.child_older_count || 0) * priceChildOlder +
            (data.child_extra_bed_count || 0) * priceChildExtraBed +
            (data.infant_count || 0) * priceInfant +
            (data.extra_bed_count || 0) * priceExtraBed +
            (data.single_count || 0) * priceSingle
        );
    };

    const getFilteredRoomPriceOptions = (room: CruiseRoomForm) => {
        if (!room.checkin) return roomPriceOptions;
        return roomPriceOptions.filter((rate) =>
            isRateValidForCheckin(room.checkin, rate.start_date, rate.end_date)
        );
    };

    const buildRoomPriceDetail = (roomPriceCode?: string, sourceOptions?: any[]) => {
        if (!roomPriceCode) return null;

        const options = sourceOptions || roomPriceOptions;
        const allPricesForCard = options.filter((rate) => rate.room_code === roomPriceCode);
        const baseRoom = allPricesForCard.find((rate) => rate.room_category === '성인') || allPricesForCard[0];

        if (!baseRoom) return null;

        const getPriceByCategory = (category: string) =>
            allPricesForCard.find((rate) => rate.room_category === category)?.price || 0;

        return {
            ...baseRoom,
            price_adult: getPriceByCategory('성인'),
            price_child: getPriceByCategory('아동'),
            price_child_older: getPriceByCategory('아동(8~11세)') || getPriceByCategory('아동 고연령') || getPriceByCategory('아동2') || getPriceByCategory('아동'),
            price_child_extra_bed: getPriceByCategory('아동 엑스트라'),
            price_infant: getPriceByCategory('유아'),
            price_extra_bed: getPriceByCategory('엑스트라'),
            price_single: getPriceByCategory('싱글')
        };
    };

    const syncRoomForm = (room: CruiseRoomForm, detail?: any) => {
        const guestCount = getRoomGuestCount(room);
        return {
            ...room,
            guest_count: guestCount,
            room_total_price: detail ? calculateRoomTotalPrice(detail, { ...room, guest_count: guestCount }) : room.room_total_price || 0,
        };
    };

    const setRoomDetailAt = (index: number, detail: any) => {
        setRoomPriceDetails((prev) => {
            const next = [...prev];
            next[index] = detail;
            return next;
        });
    };

    const getRoomDetail = (index: number) => roomPriceDetails[index] || (index === 0 ? reservation?.room_price : null);

    const updateRoomAt = (index: number, updater: (room: CruiseRoomForm) => CruiseRoomForm) => {
        setRoomForms((prev) => prev.map((room, roomIndex) => (roomIndex === index ? updater(room) : room)));
    };

    const handleRoomCheckinChange = (index: number, checkin: string) => {
        const currentRoom = roomForms[index];
        const baseRoom = { ...currentRoom, checkin };
        const filteredOptions = getFilteredRoomPriceOptions(baseRoom);
        const currentDetail = getRoomDetail(index);
        const currentCruise = currentDetail?.cruise || currentCruiseName;
        const currentSchedule = currentDetail?.schedule || '';
        const currentRoomType = currentDetail?.room_type || '';

        let nextRoom = baseRoom;
        let nextDetail = null;

        const isCurrentCodeStillValid = filteredOptions.some((rate) => rate.room_code === baseRoom.room_price_code);
        if (isCurrentCodeStillValid) {
            nextDetail = buildRoomPriceDetail(baseRoom.room_price_code, filteredOptions);
        }

        if (!nextDetail) {
            const fallback = filteredOptions.find((rate) =>
                rate.cruise === currentCruise &&
                (!currentSchedule || rate.schedule === currentSchedule) &&
                (!currentRoomType || rate.room_type === currentRoomType) &&
                rate.room_category === '성인'
            ) || filteredOptions.find((rate) =>
                rate.room_category === '성인' && (!currentCruise || rate.cruise === currentCruise)
            ) || filteredOptions.find((rate) => rate.room_category === '성인');

            if (fallback) {
                nextRoom = { ...baseRoom, room_price_code: fallback.room_code };
                nextDetail = buildRoomPriceDetail(fallback.room_code, filteredOptions);
            }
        }

        if (!nextDetail) {
            nextRoom = { ...baseRoom, room_price_code: '' };
        }

        setRoomDetailAt(index, nextDetail);
        updateRoomAt(index, () => syncRoomForm(nextRoom, nextDetail));
    };

    const handleRoomScheduleChange = (index: number, selectedSchedule: string) => {
        const currentRoom = roomForms[index];
        const filteredOptions = getFilteredRoomPriceOptions(currentRoom);
        const currentDetail = getRoomDetail(index);
        const currentCruise = currentDetail?.cruise || currentCruiseName;
        const matchingRoom = filteredOptions.find((rate) =>
            rate.schedule === selectedSchedule &&
            rate.room_category === '성인' &&
            (!currentCruise || rate.cruise === currentCruise)
        ) || filteredOptions.find((rate) =>
            rate.schedule === selectedSchedule &&
            rate.room_category === '성인'
        );

        if (!matchingRoom) return;

        const nextDetail = buildRoomPriceDetail(matchingRoom.room_code, filteredOptions);
        setRoomDetailAt(index, nextDetail);
        updateRoomAt(index, (room) => syncRoomForm({ ...room, room_price_code: matchingRoom.room_code }, nextDetail));
    };

    const handleRoomTypeChange = (index: number, selectedRoomType: string) => {
        const currentRoom = roomForms[index];
        const filteredOptions = getFilteredRoomPriceOptions(currentRoom);
        const currentDetail = getRoomDetail(index);
        const currentSchedule = currentDetail?.schedule || '';
        const currentCruise = currentDetail?.cruise || currentCruiseName;
        const matchingRoom = filteredOptions.find((rate) =>
            rate.room_type === selectedRoomType &&
            rate.schedule === currentSchedule &&
            rate.cruise === currentCruise &&
            rate.room_category === '성인'
        );

        if (!matchingRoom) return;

        const nextDetail = buildRoomPriceDetail(matchingRoom.room_code, filteredOptions);
        setRoomDetailAt(index, nextDetail);
        updateRoomAt(index, (room) => syncRoomForm({ ...room, room_price_code: matchingRoom.room_code }, nextDetail));
    };

    const handleRoomCruiseChange = (index: number, selectedCruise: string) => {
        const currentRoom = roomForms[index];
        const filteredOptions = getFilteredRoomPriceOptions(currentRoom);
        const currentDetail = getRoomDetail(index);
        const currentSchedule = currentDetail?.schedule || '';

        // 일정 선택 전에는 해당 크루즈의 성인 요금 첫 행으로 fallback
        const matchingRoom = filteredOptions.find((rate) =>
            rate.cruise === selectedCruise &&
            (!currentSchedule || rate.schedule === currentSchedule) &&
            rate.room_category === '성인'
        ) || filteredOptions.find((rate) =>
            rate.cruise === selectedCruise &&
            rate.room_category === '성인'
        );

        if (!matchingRoom) return;

        const nextDetail = buildRoomPriceDetail(matchingRoom.room_code, filteredOptions);
        setRoomDetailAt(index, nextDetail);
        updateRoomAt(index, (room) => syncRoomForm({ ...room, room_price_code: matchingRoom.room_code }, nextDetail));
    };

    const handleRoomGuestFieldChange = (index: number, field: keyof CruiseRoomForm, value: number) => {
        const currentDetail = getRoomDetail(index);
        const nextRoomForms = roomForms.map((room, roomIndex) => {
            if (roomIndex !== index) return room;
            return syncRoomForm({ ...room, [field]: value }, currentDetail);
        });

        setRoomForms(nextRoomForms);

        if (field === 'child_count' || field === 'child_older_count') {
            const totalChildCount = nextRoomForms.reduce((sum, room) => sum + (room.child_count || 0) + (room.child_older_count || 0), 0);

            if (totalChildCount <= 0) {
                setChildBirthDates([]);
                setTempChildBirthDates([]);
                setChildBirthTargetCount(0);
                setIsChildBirthDateModalOpen(false);
                return;
            }

            const nextTemp = Array.from({ length: totalChildCount }, (_, i) => childBirthDates[i] || '');
            setChildBirthTargetCount(totalChildCount);
            setTempChildBirthDates(nextTemp);
            setIsChildBirthDateModalOpen(true);
        }

        if (field === 'infant_count') {
            const totalInfantCount = nextRoomForms.reduce((sum, room) => sum + (room.infant_count || 0), 0);

            if (totalInfantCount <= 0) {
                setInfantBirthDates([]);
                setTempInfantBirthDates([]);
                setInfantBirthTargetCount(0);
                setIsInfantBirthDateModalOpen(false);
                return;
            }

            const nextTemp = Array.from({ length: totalInfantCount }, (_, i) => infantBirthDates[i] || '');
            setInfantBirthTargetCount(totalInfantCount);
            setTempInfantBirthDates(nextTemp);
            setIsInfantBirthDateModalOpen(true);
        }
    };

    const handleSaveChildBirthDates = () => {
        const validDates = tempChildBirthDates.filter((d) => d);
        if (validDates.length === 0) {
            alert('최소 1명의 아동 생년월일을 입력해주세요.');
            return;
        }
        setChildBirthDates(validDates);
        setIsChildBirthDateModalOpen(false);
    };

    const handleSaveInfantBirthDates = () => {
        const validDates = tempInfantBirthDates.filter((d) => d);
        if (validDates.length === 0) {
            alert('최소 1명의 유아 생년월일을 입력해주세요.');
            return;
        }
        setInfantBirthDates(validDates);
        setIsInfantBirthDateModalOpen(false);
    };

    const handleRoomCountChange = (index: number, value: number) => {
        updateRoomAt(index, (room) => ({ ...room, room_count: Math.max(1, value || 1) }));
    };

    const handleAddRoom = () => {
        const templateRoom = roomForms[roomForms.length - 1] || createEmptyRoomForm();
        const templateDetail = roomPriceDetails[roomPriceDetails.length - 1] || getRoomDetail(roomForms.length - 1) || null;
        const nextRoom = syncRoomForm(createEmptyRoomForm({
            checkin: templateRoom.checkin,
            room_price_code: templateRoom.room_price_code,
            room_count: isCatherineHorizonCruise ? 1 : Math.max(1, templateRoom.room_count || 1),
        }), templateDetail);

        setRoomForms((prev) => [...prev, nextRoom]);
        setRoomPriceDetails((prev) => [...prev, templateDetail]);
    };

    const handleRemoveRoom = (index: number) => {
        if (roomForms.length <= 1) return;
        setRoomForms((prev) => prev.filter((_, roomIndex) => roomIndex !== index));
        setRoomPriceDetails((prev) => prev.filter((_, roomIndex) => roomIndex !== index));
    };

    const formatRoomPriceFormula = (room: CruiseRoomForm, detail: any) => {
        const parts: string[] = [];

        if (room.adult_count > 0) parts.push(`성인 ${room.adult_count}×${(detail?.price_adult || detail?.price || 0).toLocaleString()}`);
        if (room.child_count > 0) parts.push(`아동(5~7세) ${room.child_count}×${(detail?.price_child || 0).toLocaleString()}`);
        if (room.child_older_count > 0) parts.push(`아동(8~11세) ${room.child_older_count}×${(detail?.price_child_older || detail?.price_child || 0).toLocaleString()}`);
        if (room.child_extra_bed_count > 0) parts.push(`아동엑스트라 ${room.child_extra_bed_count}×${(detail?.price_child_extra_bed || 0).toLocaleString()}`);
        if (room.infant_count > 0) parts.push(`유아 ${room.infant_count}×${(detail?.price_infant || 0).toLocaleString()}`);
        if (room.extra_bed_count > 0) parts.push(`엑스트라 ${room.extra_bed_count}×${(detail?.price_extra_bed || 0).toLocaleString()}`);
        if (room.single_count > 0) parts.push(`싱글 ${room.single_count}×${(detail?.price_single || 0).toLocaleString()}`);

        return parts.length > 0 ? parts.join(' + ') : '인원수를 입력하면 자동 계산됩니다.';
    };

    const primaryRoomDetail = roomPriceDetails[0] || reservation?.room_price || null;
    const currentCruiseName = primaryRoomDetail?.cruise || reservation?.room_price?.cruise || '';
    const currentScheduleType = primaryRoomDetail?.schedule || reservation?.room_price?.schedule || 'DAY';
    const isCatherineHorizonCruise = currentCruiseName === '캐서린 호라이즌 크루즈';

    const getFilteredTourOptions = (cruiseName?: string, scheduleType?: string) => {
        const filtered = tourOptions.filter(opt =>
            opt.cruise_name === cruiseName &&
            opt.schedule_type === scheduleType
        );

        if (cruiseName === '캐서린 호라이즌 크루즈') {
            return filtered.filter(opt => {
                const optionText = `${opt.option_name || ''} ${opt.option_name_en || ''}`;
                return !/셔틀리무진|shuttle\s*limousine/i.test(optionText);
            });
        }

        return filtered;
    };

    const isRateValidForCheckin = (checkin: string, startDate?: string, endDate?: string) => {
        if (!checkin) return true;
        if (!startDate && !endDate) return true;

        const target = checkin.slice(0, 10);
        const start = startDate ? String(startDate).slice(0, 10) : '';
        const end = endDate ? String(endDate).slice(0, 10) : '';

        if (start && target < start) return false;
        if (end && target > end) return false;
        return true;
    };

    const visibleTourOptions = useMemo(
        () => getFilteredTourOptions(currentCruiseName, currentScheduleType),
        [tourOptions, currentCruiseName, currentScheduleType]
    );

    const effectiveSelectedOptionIds = useMemo(() => {
        const visibleOptionIdSet = new Set(visibleTourOptions.map((opt: any) => opt.option_id));
        return selectedOptionIds.filter((id) => visibleOptionIdSet.has(id));
    }, [selectedOptionIds, visibleTourOptions]);

    const selectedOptionsTotal = useMemo(() => {
        return visibleTourOptions.reduce((sum: number, option: any) => {
            if (!effectiveSelectedOptionIds.includes(option.option_id)) {
                return sum;
            }

            return sum + (Number(option.option_price) || 0);
        }, 0);
    }, [visibleTourOptions, effectiveSelectedOptionIds]);

    const carTotalPrice = useMemo(() => {
        return carData.reduce((sum: number, car: any) => sum + (car.car_total_price || 0), 0);
    }, [carData]);

    const roomSummary = useMemo(() => {
        return roomForms.reduce((summary, room) => {
            summary.roomCount += Math.max(1, room.room_count || 1);
            summary.guestCount += room.guest_count || 0;
            summary.adultCount += room.adult_count || 0;
            summary.childCount += room.child_count || 0;
            summary.childOlderCount += room.child_older_count || 0;
            summary.childExtraBedCount += room.child_extra_bed_count || 0;
            summary.infantCount += room.infant_count || 0;
            summary.extraBedCount += room.extra_bed_count || 0;
            summary.singleCount += room.single_count || 0;
            summary.roomTotalPrice += room.room_total_price || 0;
            return summary;
        }, {
            roomCount: 0,
            guestCount: 0,
            adultCount: 0,
            childCount: 0,
            childOlderCount: 0,
            childExtraBedCount: 0,
            infantCount: 0,
            extraBedCount: 0,
            singleCount: 0,
            roomTotalPrice: 0,
        });
    }, [roomForms]);

    const checkinLabels = useMemo(() => {
        return Array.from(new Set(roomForms.map((room) => room.checkin).filter(Boolean)));
    }, [roomForms]);

    const calculatedGrandTotalPrice = useMemo(() => {
        return roomSummary.roomTotalPrice + carTotalPrice + selectedOptionsTotal;
    }, [roomSummary.roomTotalPrice, carTotalPrice, selectedOptionsTotal]);

    const grandTotalPrice = useMemo(() => {
        return calculatedGrandTotalPrice + additionalFee;
    }, [calculatedGrandTotalPrice, additionalFee]);

    useEffect(() => {
        if (isAdditionalFeeInitialized) return;
        if (selectedOptionIds.length > 0 && tourOptions.length === 0) return;

        const nextAdditionalFee = storedAdditionalFee ?? Math.max(0, (storedReservationTotal || 0) - calculatedGrandTotalPrice);
        setAdditionalFee(nextAdditionalFee);
        setIsAdditionalFeeInitialized(true);
    }, [
        calculatedGrandTotalPrice,
        isAdditionalFeeInitialized,
        selectedOptionIds.length,
        storedAdditionalFee,
        storedReservationTotal,
        tourOptions.length,
    ]);

    useEffect(() => {
        supabase
            .from('additional_fee_template')
            .select('id, name, amount')
            .or('service_type.is.null,service_type.eq.cruise')
            .eq('is_active', true)
            .order('sort_order')
            .then(({ data }) => { if (data) setFeeTemplates(data); });
    }, []);

    useEffect(() => {
        if (reservationId) {
            loadReservation();
            loadRoomPriceOptions();
            loadCarPriceOptions();
            loadTourOptions();
        } else {
            router.push('/manager/reservation-edit');
        }
    }, [reservationId]);

    const loadRoomPriceOptions = async () => {
        try {
            // cruise_rate_card 테이블에서 모든 옵션 가져오기
            const { data: allRoomPrices, error } = await supabase
                .from('cruise_rate_card')
                .select('cruise_name, room_type, schedule_type, id, price_adult, price_child, price_child_older, price_child_extra_bed, price_infant, price_extra_bed, price_single, valid_from, valid_to')
                .eq('is_active', true)
                .order('cruise_name', { ascending: true });

            if (error) {
                console.error('❌ cruise_rate_card 옵션 로드 실패:', error);
                return;
            }

            if (allRoomPrices && allRoomPrices.length > 0) {
                // 카테고리별로 매핑 항목 생성
                const categoryPriceMap: { key: string; label: string }[] = [
                    { key: 'price_adult', label: '성인' },
                    { key: 'price_child', label: '아동(5~7세)' },
                    { key: 'price_child_older', label: '아동(8~11세)' },
                    { key: 'price_infant', label: '유아' },
                    { key: 'price_child_extra_bed', label: '아동 엑스트라' },
                    { key: 'price_extra_bed', label: '엑스트라' },
                    { key: 'price_single', label: '싱글' },
                ];

                const mapped: any[] = [];
                allRoomPrices.forEach(r => {
                    categoryPriceMap.forEach(({ key, label }) => {
                        const price = (r as any)[key];
                        if (price != null && price > 0) {
                            mapped.push({
                                cruise: r.cruise_name,
                                room_type: r.room_type,
                                room_category: label,
                                schedule: r.schedule_type,
                                room_code: r.id,
                                price: Number(price),
                                start_date: r.valid_from,
                                end_date: r.valid_to
                            });
                        }
                    });
                });
                setRoomPriceOptions(mapped);

                // 고유한 옵션 추출
                const uniqueCruises = [...new Set(allRoomPrices.map(r => r.cruise_name).filter(Boolean))];
                const uniqueRoomTypes = [...new Set(allRoomPrices.map(r => r.room_type).filter(Boolean))];
                const uniqueCategories = [...new Set(mapped.map(r => r.room_category).filter(Boolean))];
                const uniqueSchedules = [...new Set(allRoomPrices.map(r => r.schedule_type).filter(Boolean))];

                setCruiseOptions(uniqueCruises as string[]);
                setRoomTypeOptions(uniqueRoomTypes as string[]);
                setCategoryOptions(uniqueCategories as string[]);
                setScheduleOptions(uniqueSchedules as string[]);

                console.log('✅ cruise_rate_card 옵션 로드 완료:', {
                    총개수: allRoomPrices.length,
                    매핑개수: mapped.length,
                    크루즈: uniqueCruises.length,
                    객실: uniqueRoomTypes.length,
                    카테고리: uniqueCategories,
                    일정: uniqueSchedules.length
                });
            }
        } catch (error) {
            console.error('❌ cruise_rate_card 옵션 로드 오류:', error);
        }
    };

    const loadCarPriceOptions = async () => {
        try {
            // 기존 car_price_old + 신규 rentcar_price를 함께 로드
            const { data: legacyCarPrices, error } = await supabase
                .from('car_price_old')
                .select('cruise, car_type, car_category, car_code, price')
                .order('cruise', { ascending: true });

            if (error) {
                console.error('❌ car_price 옵션 로드 실패:', error);
                return;
            }

            const { data: rentcarPrices, error: rentcarError } = await supabase
                .from('rentcar_price')
                .select('cruise, category, vehicle_type, way_type, rent_code, price')
                .eq('is_active', true)
                .order('cruise', { ascending: true });

            if (rentcarError) {
                console.error('❌ rentcar_price 옵션 로드 실패:', rentcarError);
            }

            const mappedRentcarPrices = (rentcarPrices || []).map((r: any) => ({
                cruise: r.cruise || r.category || '공통',
                car_type: r.vehicle_type,
                car_category: r.way_type,
                car_code: r.rent_code,
                price: r.price,
            }));

            const allCarPrices = [...(legacyCarPrices || []), ...mappedRentcarPrices];

            if (allCarPrices && allCarPrices.length > 0) {
                setCarPriceOptions(allCarPrices);

                // 고유한 옵션 추출
                const uniqueCarCruises = [...new Set(allCarPrices.map(c => c.cruise).filter(Boolean))];
                const uniqueCarTypes = [...new Set(allCarPrices.map(c => c.car_type).filter(Boolean))];
                const uniqueCarCategories = [...new Set(allCarPrices.map(c => c.car_category).filter(Boolean))];

                setCarCruiseOptions(uniqueCarCruises as string[]);
                setCarTypeOptions(uniqueCarTypes as string[]);
                setCarCategoryOptions(uniqueCarCategories as string[]);

                console.log('✅ car_price 옵션 로드 완료:', {
                    총개수: allCarPrices.length,
                    레거시개수: legacyCarPrices?.length || 0,
                    렌트카개수: mappedRentcarPrices.length,
                    크루즈: uniqueCarCruises.length,
                    차량: uniqueCarTypes.length,
                    카테고리: uniqueCarCategories.length
                });
            }
        } catch (error) {
            console.error('❌ car_price 옵션 로드 오류:', error);
        }
    };

    const loadTourOptions = async () => {
        try {
            console.log('🔍 추가 옵션(cruise_tour_options) 로드 시작...');
            const { data: options, error } = await supabase
                .from('cruise_tour_options')
                .select('option_id, cruise_name, schedule_type, option_name, option_name_en, option_price, option_type, is_active')
                .eq('is_active', true)
                .order('cruise_name', { ascending: true });

            if (error) {
                console.error('❌ cruise_tour_options 로드 실패:', error);
                return;
            }

            if (options && options.length > 0) {
                setTourOptions(options);
                console.log('✅ 추가 옵션 로드 완료:', options.length, '개');
            } else {
                console.log('ℹ️ 추가 옵션 데이터 없음');
            }
        } catch (error) {
            console.error('❌ cruise_tour_options 로드 오류:', error);
        }
    };

    const loadReservation = async () => {
        try {
            console.log('🔄 크루즈 예약 데이터 로드 시작...', reservationId);
            setLoading(true);

            // 1) 서비스 상세 (다건)
            console.log('🔍 크루즈 예약 조회 시작, ID:', reservationId);
            const { data: cruiseRows, error: cruiseErr } = await supabase
                .from('reservation_cruise')
                .select('*')
                .eq('reservation_id', reservationId);

            if (cruiseErr) {
                console.error('❌ reservation_cruise 조회 실패:', {
                    error: cruiseErr,
                    code: cruiseErr.code,
                    message: cruiseErr.message,
                    details: cruiseErr.details
                });

                if (cruiseErr.code === 'PGRST116') {
                    throw new Error(`예약 ID ${reservationId}에 해당하는 크루즈 예약을 찾을 수 없습니다.`);
                }
                throw new Error(`크루즈 예약 조회 실패: ${cruiseErr.message}`);
            }

            if (!cruiseRows || cruiseRows.length === 0) {
                throw new Error('크루즈 예약 데이터가 존재하지 않습니다.');
            }

            const primaryCruiseRow = cruiseRows[0];

            console.log('✅ 크루즈 예약 조회 성공:', {
                reservation_id: primaryCruiseRow.reservation_id,
                room_count: cruiseRows.length,
                room_price_codes: cruiseRows.map((row) => row.room_price_code),
                전체데이터: cruiseRows
            });

            // 2) 예약 기본 정보 + 고객 정보 조회
            console.log('🔍 예약 기본 정보 조회 시작');
            const { data: resRow, error: resErr } = await supabase
                .from('reservation')
                .select('re_id, re_status, re_created_at, re_quote_id, re_user_id, total_amount, price_breakdown, manual_additional_fee, manual_additional_fee_detail')
                .eq('re_id', reservationId)
                .single();

            if (resErr) {
                console.error('❌ reservation 조회 실패:', resErr);
                throw new Error(`예약 기본 정보 조회 실패: ${resErr.message}`);
            }
            if (!resRow) throw new Error('예약 기본 데이터가 존재하지 않습니다.');

            // 고객 정보
            let customerInfo = { name: '정보 없음', email: '', phone: '' };
            if (resRow.re_user_id) {
                const { data: u } = await supabase
                    .from('users')
                    .select('name, email, phone_number')
                    .eq('id', resRow.re_user_id)
                    .single();
                if (u) {
                    customerInfo = { ...customerInfo, ...u, phone: u.phone_number };
                }
            }

            console.log('✅ 예약 기본 정보 조회 성공:', resRow.re_id);

            // 3) 견적 타이틀
            let quoteInfo = null as { title: string } | null;
            if (resRow.re_quote_id) {
                const { data: q, error: qErr } = await supabase
                    .from('quote')
                    .select('title')
                    .eq('id', resRow.re_quote_id)
                    .single();
                if (!qErr && q) quoteInfo = q;
            }

            // 4) 객실 가격 정보 (크루즈명, 객실명 포함)
            const roomPriceInfoList = await Promise.all(
                cruiseRows.map(async (cruiseRow) => {
                    if (!cruiseRow.room_price_code) {
                        console.warn('⚠️ room_price_code가 없습니다 - cruiseRow:', cruiseRow);
                        return null;
                    }

                    console.log('🔍 cruise_rate_card 조회 시작, room_price_code:', cruiseRow.room_price_code);

                    const { data: rateCard, error: rpErr } = await supabase
                        .from('cruise_rate_card')
                        .select('cruise_name, room_type, schedule_type, id, price_adult, price_child, price_child_older, price_child_extra_bed, price_infant, price_extra_bed, price_single')
                        .eq('id', cruiseRow.room_price_code)
                        .maybeSingle();

                    if (rpErr) {
                        console.error('❌ cruise_rate_card 조회 실패:', {
                            error: rpErr,
                            message: rpErr.message,
                            code: rpErr.code,
                            details: rpErr.details,
                            hint: rpErr.hint
                        });
                        return null;
                    }

                    if (!rateCard) {
                        console.warn('⚠️ cruise_rate_card 데이터 없음 - id로 일치하는 데이터가 없습니다');
                        return null;
                    }

                    const roomPriceInfo = {
                        cruise: rateCard.cruise_name,
                        room_type: rateCard.room_type,
                        room_category: '성인',
                        schedule: rateCard.schedule_type,
                        room_code: rateCard.id,
                        price: rateCard.price_adult,
                        price_adult: rateCard.price_adult || 0,
                        price_child: rateCard.price_child || 0,
                        price_child_older: rateCard.price_child_older || rateCard.price_child || 0,
                        price_child_extra_bed: rateCard.price_child_extra_bed || 0,
                        price_infant: rateCard.price_infant || 0,
                        price_extra_bed: rateCard.price_extra_bed || 0,
                        price_single: rateCard.price_single || 0
                    };

                    console.log('✅ cruise_rate_card 데이터 설정 완료:', roomPriceInfo);
                    return roomPriceInfo;
                })
            );

            setRoomPriceDetails(roomPriceInfoList);

            // 5) 차량 정보 조회
            console.log('🔍 차량 정보 조회 시작');
            const { data: cruiseCars } = await supabase
                .from('reservation_cruise_car')
                .select('*')
                .eq('reservation_id', reservationId);

            if (cruiseCars && cruiseCars.length > 0) {
                console.log('✅ 차량 데이터 조회 완료:', cruiseCars.length, '대');

                // 각 차량의 가격 정보 조회 (cruise, car_type, car_category, price 포함)
                const carsWithPrice = await Promise.all(
                    cruiseCars.map(async (car) => {
                        if (car.car_price_code) {
                            console.log('🔍 차량 가격 조회:', car.car_price_code);

                            const { data: carPriceLegacy } = await supabase
                                .from('car_price')
                                .select('cruise, car_type, car_category, car_code, price')
                                .eq('car_code', car.car_price_code)
                                .maybeSingle();

                            let carPrice = carPriceLegacy;

                            if (!carPrice) {
                                const { data: rentcarPrice } = await supabase
                                    .from('rentcar_price')
                                    .select('cruise, category, vehicle_type, way_type, rent_code, price')
                                    .eq('rent_code', car.car_price_code)
                                    .maybeSingle();

                                if (rentcarPrice) {
                                    carPrice = {
                                        cruise: rentcarPrice.cruise || rentcarPrice.category || '공통',
                                        car_type: rentcarPrice.vehicle_type,
                                        car_category: rentcarPrice.way_type,
                                        car_code: rentcarPrice.rent_code,
                                        price: rentcarPrice.price,
                                    };
                                }
                            }

                            if (carPrice) {
                                console.log('✅ 차량 가격 정보:', {
                                    car_code: carPrice.car_code,
                                    cruise: carPrice.cruise,
                                    car_type: carPrice.car_type,
                                    price: carPrice.price,
                                    car_count: car.car_count,
                                    passenger_count: car.passenger_count
                                });

                                // 차량 가격 자동 계산
                                const carCount = car.car_count || 0;
                                const passengerCount = car.passenger_count || 0;
                                const unitPrice = carPrice.price || 0;

                                const calculatedPrice = carCount > 0
                                    ? carCount * unitPrice
                                    : passengerCount * unitPrice;

                                console.log('💰 차량 가격 계산:', {
                                    차량수: carCount,
                                    승객수: passengerCount,
                                    단가: unitPrice,
                                    계산된가격: calculatedPrice,
                                    기존가격: car.car_total_price
                                });

                                return {
                                    ...car,
                                    priceInfo: carPrice,
                                    car_total_price: calculatedPrice // 계산된 가격으로 업데이트
                                };
                            } else {
                                console.warn('⚠️ 차량 가격 정보 없음:', car.car_price_code);
                            }

                            return { ...car, priceInfo: carPrice };
                        }
                        return { ...car, priceInfo: null };
                    })
                );
                setCarData(carsWithPrice);
                console.log('✅ 차량 데이터 설정 완료:', carsWithPrice);
            } else {
                console.log('ℹ️ 차량 정보 없음');
            }

            const fullReservation: CruiseReservation = {
                ...primaryCruiseRow,
                reservation: {
                    re_id: resRow.re_id,
                    re_status: resRow.re_status,
                    re_created_at: resRow.re_created_at,
                    users: {
                        name: customerInfo.name,
                        email: customerInfo.email,
                        phone: customerInfo.phone,
                    },
                    quote: quoteInfo,
                },
                room_price: roomPriceInfoList[0] || null,
            };

            console.log('📦 최종 예약 데이터:', {
                fullReservation,
                roomPriceInfoList,
                cruiseRow_room_price_code: primaryCruiseRow.room_price_code
            });

            setReservation(fullReservation);
            setStoredReservationTotal(Number(resRow.total_amount || 0));

            const savedAdditionalFee = Number(resRow.price_breakdown?.additional_fee);
            setStoredAdditionalFee(Number.isFinite(savedAdditionalFee) ? savedAdditionalFee : null);
            setAdditionalFeeDetail(
                String(
                    resRow.manual_additional_fee_detail
                    || resRow.price_breakdown?.additional_fee_detail
                    || resRow.price_breakdown?.additional_fee_note
                    || ''
                )
            );
            setIsAdditionalFeeInitialized(false);

            const storedRequestNote = cruiseRows.find((row) => row.request_note)?.request_note || '';

            // request_note에서 옵션 ID 파싱: [OPTIONS:1,2,3] 형식
            const optionsMatch = storedRequestNote.match(/\[OPTIONS:([^\]]*)\]/);
            let parsedOptionIds: number[] = [];
            if (optionsMatch && optionsMatch[1]) {
                parsedOptionIds = optionsMatch[1].split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
            }

            const childBirthDatesMatch = storedRequestNote.match(/\[CHILD_BIRTH_DATES:([^\]]*)\]/);
            const infantBirthDatesMatch = storedRequestNote.match(/\[INFANT_BIRTH_DATES:([^\]]*)\]/);
            const childOlderCountsMatch = storedRequestNote.match(/\[CHILD_OLDER_COUNTS:([^\]]*)\]/);

            const parsedChildBirthDates = childBirthDatesMatch?.[1]
                ? childBirthDatesMatch[1].split(',').map((d) => d.trim()).filter(Boolean)
                : [];
            const parsedInfantBirthDates = infantBirthDatesMatch?.[1]
                ? infantBirthDatesMatch[1].split(',').map((d) => d.trim()).filter(Boolean)
                : [];
            const parsedChildOlderCounts = childOlderCountsMatch?.[1]
                ? childOlderCountsMatch[1].split(',').map((v) => parseInt(v.trim(), 10) || 0)
                : [];

            setChildBirthDates(parsedChildBirthDates);
            setInfantBirthDates(parsedInfantBirthDates);

            setSelectedOptionIds(parsedOptionIds);

            // request_note에서 OPTIONS 부분을 제거한 실제 요청사항만 추출
            const cleanRequestNote = storedRequestNote
                .replace(/\[OPTIONS:[^\]]*\]\s*/g, '')
                .replace(/\[CHILD_BIRTH_DATES:[^\]]*\]\s*/g, '')
                .replace(/\[INFANT_BIRTH_DATES:[^\]]*\]\s*/g, '')
                .replace(/\[CHILD_OLDER_COUNTS:[^\]]*\]\s*/g, '')
                .trim();

            setRequestNote(cleanRequestNote);
            setRoomForms(
                cruiseRows.map((cruiseRow, rowIndex) => syncRoomForm(createEmptyRoomForm({
                    room_count: cruiseRow.room_count ?? 1,
                    guest_count: cruiseRow.guest_count || 0,
                    adult_count: cruiseRow.adult_count ?? 0,
                    child_count: cruiseRow.child_count ?? 0,
                    child_older_count: parsedChildOlderCounts[rowIndex] ?? 0,
                    child_extra_bed_count: cruiseRow.child_extra_bed_count ?? 0,
                    infant_count: cruiseRow.infant_count ?? 0,
                    extra_bed_count: cruiseRow.extra_bed_count ?? 0,
                    single_count: cruiseRow.single_count ?? 0,
                    checkin: cruiseRow.checkin || '',
                    room_total_price: cruiseRow.room_total_price || 0,
                    room_price_code: cruiseRow.room_price_code || ''
                })))
                // detail 없이 초기화 → DB 저장값(room_total_price) 그대로 유지
                // 인원수 변경 시에는 handleRoomGuestFieldChange에서 재계산됨
            );

        } catch (error) {
            // 오류 객체를 더 자세히 로깅
            const errorDetails = {
                error: error,
                message: error instanceof Error ? error.message : '알 수 없는 오류',
                stack: error instanceof Error ? error.stack : undefined,
                type: typeof error,
                isNull: error === null,
                isUndefined: error === undefined
            };

            console.error('❌ 크루즈 예약 로드 실패:', errorDetails);

            // 사용자에게 표시할 메시지
            let userMessage = '크루즈 예약 정보를 불러오는데 실패했습니다.';
            if (error instanceof Error) {
                if (error.message.includes('찾을 수 없습니다')) {
                    userMessage = '해당 예약을 찾을 수 없습니다.';
                } else if (error.message.includes('권한')) {
                    userMessage = '이 예약을 조회할 권한이 없습니다.';
                } else {
                    userMessage = `오류: ${error.message}`;
                }
            }

            alert(userMessage);
            router.push('/manager/reservation-edit');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!reservation) return;

        try {
            setSaving(true);
            console.log('💾 크루즈 예약 수정 저장 시작...');
            console.log('📝 저장할 데이터:', {
                rooms: roomForms,
                request_note: requestNote
            });

            if (roomForms.length === 0) {
                throw new Error('객실이 없습니다. 최소 1개의 객실이 필요합니다.');
            }

            if (roomForms.some((room) => !room.room_price_code)) {
                throw new Error('모든 객실에 객실명을 선택해주세요.');
            }

            if (roomForms.some((room) => !room.checkin)) {
                throw new Error('모든 객실에 체크인 날짜를 입력해주세요.');
            }

            // 1. 객실 정보 저장 - 업데이트할 필드만 명시적으로 지정
            // request_note에 선택된 옵션 정보 추가: [OPTIONS:1,2,3] 형식
            const optionsPrefix = effectiveSelectedOptionIds.length > 0
                ? `[OPTIONS:${effectiveSelectedOptionIds.join(',')}] `
                : '';

            const childBirthPrefix = childBirthDates.length > 0
                ? `[CHILD_BIRTH_DATES:${childBirthDates.join(',')}] `
                : '';
            const infantBirthPrefix = infantBirthDates.length > 0
                ? `[INFANT_BIRTH_DATES:${infantBirthDates.join(',')}] `
                : '';
            const childOlderPrefix = `[CHILD_OLDER_COUNTS:${roomForms.map((room) => room.child_older_count || 0).join(',')}] `;
            const finalRequestNote = `${optionsPrefix}${childBirthPrefix}${infantBirthPrefix}${childOlderPrefix}${requestNote}`.trim();

            const cruiseInsertData = roomForms.map((room, index) => ({
                reservation_id: reservationId,
                room_price_code: room.room_price_code,
                room_count: isCatherineHorizonCruise ? null : room.room_count,
                guest_count: room.guest_count,
                adult_count: room.adult_count,
                child_count: (room.child_count || 0) + (room.child_older_count || 0),
                child_extra_bed_count: room.child_extra_bed_count,
                infant_count: room.infant_count,
                extra_bed_count: room.extra_bed_count,
                single_count: room.single_count,
                checkin: room.checkin,
                request_note: index === 0 ? finalRequestNote : null,
                room_total_price: room.room_total_price,
            }));

            console.log('📤 reservation_cruise 재저장 요청:', cruiseInsertData);

            const { error: deleteCruiseError } = await supabase
                .from('reservation_cruise')
                .delete()
                .eq('reservation_id', reservationId);

            if (deleteCruiseError) {
                console.error('❌ 기존 객실 정보 삭제 실패:', deleteCruiseError);
                throw deleteCruiseError;
            }

            const { data: cruiseResult, error: cruiseError } = await supabase
                .from('reservation_cruise')
                .insert(cruiseInsertData)
                .select();

            if (cruiseError) {
                console.error('❌ 객실 정보 저장 실패:', {
                    error: cruiseError,
                    message: cruiseError.message,
                    details: cruiseError.details,
                    hint: cruiseError.hint,
                    code: cruiseError.code
                });
                throw cruiseError;
            }

            console.log('✅ 객실 정보 저장 완료, 업데이트된 행:', cruiseResult?.length || 0, cruiseResult);

            if (!cruiseResult || cruiseResult.length !== roomForms.length) {
                console.warn('⚠️ reservation_cruise 저장 결과가 예상과 다릅니다.');
                throw new Error('객실 정보 저장 결과를 확인할 수 없습니다. 다시 시도해주세요.');
            }

            // 2. 차량 정보 저장 - 업데이트할 필드만 명시적으로 지정
            console.log('🚗 차량 정보 저장 시작:', carData.length, '대');
            for (const car of carData) {
                if (car.id) {
                    // 업데이트할 필드만 명시적으로 추출 (id, reservation_id, created_at 등은 제외)
                    const carUpdateFields: Record<string, any> = {
                        car_price_code: car.car_price_code,
                        car_count: car.car_count,
                        passenger_count: car.passenger_count,
                        pickup_location: car.pickup_location || null,
                        dropoff_location: car.dropoff_location || null,
                        pickup_datetime: car.pickup_datetime || null,
                        car_total_price: car.car_total_price || 0,
                        request_note: car.request_note || null,
                    };

                    console.log('📤 차량 업데이트 (id:', car.id, '):', carUpdateFields);

                    const { data: carResult, error: carError } = await supabase
                        .from('reservation_cruise_car')
                        .update(carUpdateFields)
                        .eq('id', car.id)
                        .select();

                    if (carError) {
                        console.error('❌ 차량 정보 저장 실패:', carError);
                        throw carError;
                    }

                    console.log('✅ 차량 업데이트 완료, 업데이트된 행:', carResult?.length || 0);

                    if (!carResult || carResult.length === 0) {
                        console.warn(`⚠️ 차량 id=${car.id} 업데이트 대상을 찾을 수 없습니다.`);
                    }
                } else {
                    console.warn('⚠️ 차량 데이터에 id가 없습니다. 업데이트를 건너뜁니다:', car);
                }
            }

            // 3. 메인 예약(reservation) 테이블 동기화 — total_amount, 인원수, price_breakdown
            const grandTotal = grandTotalPrice;

            const roomBreakdowns = roomForms.map((room, index) => {
                const detail = getRoomDetail(index);
                const priceAdult = detail?.price_adult || detail?.price || 0;
                const priceChild = detail?.price_child || 0;
                const priceChildOlder = detail?.price_child_older || priceChild;
                const priceInfant = detail?.price_infant || 0;
                const priceExtraBed = detail?.price_extra_bed || 0;
                const priceSingle = detail?.price_single || 0;
                const priceChildExtraBed = detail?.price_child_extra_bed || 0;

                const adultTotal = priceAdult * (room.adult_count || 0);
                const childTotal = priceChild * (room.child_count || 0);
                const childOlderTotal = priceChildOlder * (room.child_older_count || 0);
                const infantTotal = priceInfant * (room.infant_count || 0);
                const extraBedTotal = priceExtraBed * (room.extra_bed_count || 0);
                const singleTotal = priceSingle * (room.single_count || 0);
                const childExtraBedTotal = priceChildExtraBed * (room.child_extra_bed_count || 0);

                return {
                    room_index: index + 1,
                    room_price_code: room.room_price_code,
                    room_count: isCatherineHorizonCruise ? null : room.room_count,
                    checkin: room.checkin,
                    guest_count: room.guest_count,
                    cruise: detail?.cruise || null,
                    schedule: detail?.schedule || null,
                    room_type: detail?.room_type || null,
                    adult: { unit_price: priceAdult, count: room.adult_count || 0, total: adultTotal },
                    child: { unit_price: priceChild, count: room.child_count || 0, total: childTotal },
                    child_older: { unit_price: priceChildOlder, count: room.child_older_count || 0, total: childOlderTotal },
                    infant: { unit_price: priceInfant, count: room.infant_count || 0, total: infantTotal },
                    extra_bed: { unit_price: priceExtraBed, count: room.extra_bed_count || 0, total: extraBedTotal },
                    single: { unit_price: priceSingle, count: room.single_count || 0, total: singleTotal },
                    child_extra_bed: { unit_price: priceChildExtraBed, count: room.child_extra_bed_count || 0, total: childExtraBedTotal },
                    total: room.room_total_price || 0,
                };
            });

            const aggregatedRoomTotals = roomBreakdowns.reduce((totals, room) => {
                totals.adult += room.adult.total;
                totals.child += room.child.total;
                totals.child_older += room.child_older.total;
                totals.infant += room.infant.total;
                totals.extra_bed += room.extra_bed.total;
                totals.single += room.single.total;
                totals.child_extra_bed += room.child_extra_bed.total;
                return totals;
            }, {
                adult: 0,
                child: 0,
                child_older: 0,
                infant: 0,
                extra_bed: 0,
                single: 0,
                child_extra_bed: 0,
            });

            const subtotal = roomSummary.roomTotalPrice;
            const selectedOptionDetails = visibleTourOptions
                .filter((option: any) => effectiveSelectedOptionIds.includes(option.option_id))
                .map((option: any) => ({
                    option_id: option.option_id,
                    name: option.option_name,
                    price: Number(option.option_price) || 0,
                }));

            const priceBreakdown: Record<string, any> = {
                rooms: roomBreakdowns,
                adult: roomSummary.adultCount > 0 ? { unit_price: null, count: roomSummary.adultCount, total: aggregatedRoomTotals.adult } : null,
                child: roomSummary.childCount > 0 ? { unit_price: null, count: roomSummary.childCount, total: aggregatedRoomTotals.child } : null,
                child_older: roomSummary.childOlderCount > 0 ? { unit_price: null, count: roomSummary.childOlderCount, total: aggregatedRoomTotals.child_older } : null,
                infant: roomSummary.infantCount > 0 ? { unit_price: null, count: roomSummary.infantCount, total: aggregatedRoomTotals.infant } : null,
                extra_bed: roomSummary.extraBedCount > 0 ? { unit_price: null, count: roomSummary.extraBedCount, total: aggregatedRoomTotals.extra_bed } : null,
                single: roomSummary.singleCount > 0 ? { unit_price: null, count: roomSummary.singleCount, total: aggregatedRoomTotals.single } : null,
                child_extra_bed: roomSummary.childExtraBedCount > 0 ? { unit_price: null, count: roomSummary.childExtraBedCount, total: aggregatedRoomTotals.child_extra_bed } : null,
                options: selectedOptionDetails,
                options_total: selectedOptionsTotal,
                car_total: carTotalPrice,
                subtotal,
                calculated_total: calculatedGrandTotalPrice,
                additional_fee: additionalFee,
                additional_fee_detail: additionalFeeDetail || null,
                grand_total: grandTotal,
            };

            const reservationUpdatePayload: Record<string, any> = {
                total_amount: grandTotal,
                re_adult_count: roomSummary.adultCount || 0,
                re_child_count: (roomSummary.childCount || 0) + (roomSummary.childOlderCount || 0),
                re_infant_count: roomSummary.infantCount || 0,
                pax_count: (roomSummary.adultCount || 0) + (roomSummary.childCount || 0) + (roomSummary.childOlderCount || 0) + (roomSummary.infantCount || 0),
                price_breakdown: priceBreakdown,
                manual_additional_fee: additionalFee,
                manual_additional_fee_detail: additionalFeeDetail || null,
                reservation_date: roomForms[0]?.checkin || null,
                re_update_at: new Date().toISOString(),
            };

            const { error: masterError } = await supabase
                .from('reservation')
                .update(reservationUpdatePayload)
                .eq('re_id', reservationId);

            if (masterError) {
                console.error('⚠️ reservation 마스터 동기화 실패:', masterError);
            } else {
                console.log('✅ 3. reservation 마스터 동기화 완료 (total_amount, 인원수, price_breakdown)');
            }

            await saveAdditionalFeeTemplateFromInput({
                serviceType: 'cruise',
                detail: additionalFeeDetail,
                amount: additionalFee,
            });

            console.log('✅ 크루즈 예약 수정 완료');
            alert('크루즈 예약이 성공적으로 수정되었습니다.');

            // 데이터 다시 로드 + Next.js 라우터 캐시 무효화 (상세 모달 최신화)
            router.refresh();
            await loadReservation();

        } catch (error) {
            console.error('❌ 저장 오류:', error);
            const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
            alert(`저장 중 오류가 발생했습니다: ${errorMessage}`);
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <ManagerLayout title="🚢 크루즈 예약 수정" activeTab="reservation-edit-cruise">
                <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600">크루즈 예약 데이터를 불러오는 중...</p>
                    </div>
                </div>
            </ManagerLayout>
        );
    }

    if (!reservation) {
        return (
            <ManagerLayout title="🚢 크루즈 예약 수정" activeTab="reservation-edit-cruise">
                <div className="text-center py-12">
                    <Ship className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">예약을 찾을 수 없습니다</h3>
                    <p className="text-gray-600 mb-4">요청하신 크루즈 예약 정보를 찾을 수 없습니다.</p>
                    <button
                        onClick={() => router.push('/manager/reservation-edit')}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        예약 목록으로 돌아가기
                    </button>
                </div>
            </ManagerLayout>
        );
    }

    return (
        <ManagerLayout title="🚢 크루즈 예약 수정" activeTab="reservation-edit-cruise">
            <div className="space-y-6">
                {/* 헤더 */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.push('/manager/reservation-edit')}
                        className="inline-flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        예약 목록으로
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">크루즈 예약 수정</h1>
                        <p className="text-sm text-gray-600">예약 ID: {reservation.reservation.re_id}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* 좌측: 예약 정보 */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* 고객 정보 */}
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                                <User className="w-5 h-5" />
                                고객 정보
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
                                    <div className="text-gray-900">{reservation.reservation.users.name}</div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
                                    <div className="text-gray-900 flex items-center gap-2">
                                        <Mail className="w-4 h-4 text-gray-400" />
                                        {reservation.reservation.users.email}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
                                    <div className="text-gray-900 flex items-center gap-2">
                                        <Phone className="w-4 h-4 text-gray-400" />
                                        {reservation.reservation.users.phone}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* 객실 정보 */}
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
                                    <Ship className="w-5 h-5" />
                                    객실 정보 수정
                                </h3>
                                <button
                                    type="button"
                                    onClick={handleAddRoom}
                                    className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                                >
                                    <Plus className="w-4 h-4" />
                                    객실 추가
                                </button>
                            </div>
                            <div className="space-y-4">
                                {roomForms.map((room, roomIndex) => {
                                    const roomDetail = getRoomDetail(roomIndex);
                                    const filteredOptions = getFilteredRoomPriceOptions(room);
                                    const selectedSchedule = roomDetail?.schedule || '';
                                    const roomCruise = roomDetail?.cruise
                                        || filteredOptions.find((rate) => rate.room_code === room.room_price_code)?.cruise
                                        || currentCruiseName
                                        || reservation.room_price?.cruise
                                        || '';
                                    const roomCruises = [...new Set(
                                        filteredOptions
                                            .filter((rate) => {
                                                if (selectedSchedule && rate.schedule !== selectedSchedule) return false;
                                                return true;
                                            })
                                            .map((rate) => rate.cruise)
                                            .filter(Boolean)
                                    )] as string[];
                                    const roomSchedules = [...new Set(filteredOptions.map((rate) => rate.schedule).filter(Boolean))] as string[];
                                    const roomTypes = [...new Set(
                                        filteredOptions
                                            .filter((rate) => {
                                                if (selectedSchedule && rate.schedule !== selectedSchedule) return false;
                                                if (roomCruise && rate.cruise !== roomCruise) return false;
                                                return true;
                                            })
                                            .map((rate) => rate.room_type)
                                            .filter(Boolean)
                                    )] as string[];

                                    return (
                                        <div key={roomIndex} className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                                            <div className="flex items-center justify-between mb-4">
                                                <div>
                                                    <div className="text-sm font-semibold text-gray-900">객실 {roomIndex + 1}</div>
                                                    <div className="text-xs text-gray-500">
                                                        {roomDetail?.room_type || '객실 미선택'}
                                                        {roomDetail?.schedule ? ` / ${roomDetail.schedule}` : ''}
                                                    </div>
                                                </div>
                                                {roomForms.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveRoom(roomIndex)}
                                                        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 bg-red-50 rounded hover:bg-red-100"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                        삭제
                                                    </button>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">체크인 날짜 *</label>
                                                    <input
                                                        type="date"
                                                        value={room.checkin}
                                                        onChange={(e) => handleRoomCheckinChange(roomIndex, e.target.value)}
                                                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                                    />
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">일정 *</label>
                                                    <select
                                                        value={roomDetail?.schedule || ''}
                                                        onChange={(e) => handleRoomScheduleChange(roomIndex, e.target.value)}
                                                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                                    >
                                                        <option value="">선택하세요</option>
                                                        {roomSchedules.map((schedule, index) => (
                                                            <option key={index} value={schedule}>{schedule}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">크루즈명 *</label>
                                                    <select
                                                        value={roomCruise || ''}
                                                        onChange={(e) => handleRoomCruiseChange(roomIndex, e.target.value)}
                                                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                                    >
                                                        <option value="">선택하세요</option>
                                                        {roomCruises.map((cruise, index) => (
                                                            <option key={index} value={cruise}>{cruise}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">객실명 *</label>
                                                    <select
                                                        value={roomDetail?.room_type || ''}
                                                        onChange={(e) => handleRoomTypeChange(roomIndex, e.target.value)}
                                                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                                    >
                                                        <option value="">선택하세요</option>
                                                        {roomTypes.map((roomType, index) => (
                                                            <option key={index} value={roomType}>{roomType}</option>
                                                        ))}
                                                    </select>
                                                </div>

                                                {!isCatherineHorizonCruise && (
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-700 mb-1">객실 수 *</label>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                className="sm:hidden h-8 w-8 rounded border border-gray-300 bg-white text-base font-bold text-gray-700"
                                                                onClick={() => handleRoomCountChange(roomIndex, Math.max(1, (room.room_count || 1) - 1))}
                                                                aria-label="객실 수 감소"
                                                            >
                                                                -
                                                            </button>
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                max="20"
                                                                value={room.room_count}
                                                                onChange={(e) => handleRoomCountChange(roomIndex, parseInt(e.target.value) || 1)}
                                                                className="show-number-spinner w-full px-2 py-1 border border-gray-300 rounded text-sm text-center sm:text-left"
                                                            />
                                                            <button
                                                                type="button"
                                                                className="sm:hidden h-8 w-8 rounded border border-gray-300 bg-white text-base font-bold text-gray-700"
                                                                onClick={() => handleRoomCountChange(roomIndex, Math.min(20, (room.room_count || 1) + 1))}
                                                                aria-label="객실 수 증가"
                                                            >
                                                                +
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="md:col-span-2">
                                                    <label className="block text-xs font-medium text-gray-700 mb-2">인원수 상세 *</label>
                                                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                                                        {[
                                                            { key: 'adult_count', label: '성인' },
                                                            { key: 'child_count', label: '아동(5~7)' },
                                                            { key: 'child_older_count', label: '아동(8~11)' },
                                                            { key: 'infant_count', label: '유아' },
                                                            { key: 'child_extra_bed_count', label: '아동 엑스트라' },
                                                            { key: 'extra_bed_count', label: '엑스트라' },
                                                            { key: 'single_count', label: '싱글' },
                                                        ].map(({ key, label }) => (
                                                            <div key={key}>
                                                                <label className="block text-xs text-gray-500 mb-1">{label}</label>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    max="20"
                                                                    value={(room as any)[key]}
                                                                    onChange={(e) => handleRoomGuestFieldChange(roomIndex, key as keyof CruiseRoomForm, parseInt(e.target.value) || 0)}
                                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-center"
                                                                />
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <p className="text-xs text-gray-500 mt-1">
                                                        합계: {room.guest_count}명 (성인 {room.adult_count} + 아동(5~7) {room.child_count} + 아동(8~11) {room.child_older_count} + 유아 {room.infant_count} + 아동엑스트라 {room.child_extra_bed_count} + 엑스트라 {room.extra_bed_count} + 싱글 {room.single_count})
                                                    </p>
                                                </div>

                                                <div className="md:col-span-2">
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">객실 단가 (카테고리별)</label>
                                                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2 text-xs">
                                                        {[
                                                            { label: '성인', value: roomDetail?.price_adult || roomDetail?.price || 0 },
                                                            { label: '아동(5~7)', value: roomDetail?.price_child || 0 },
                                                            { label: '아동(8~11)', value: roomDetail?.price_child_older || roomDetail?.price_child || 0 },
                                                            { label: '아동엑스트라', value: roomDetail?.price_child_extra_bed || 0 },
                                                            { label: '유아', value: roomDetail?.price_infant || 0 },
                                                            { label: '엑스트라', value: roomDetail?.price_extra_bed || 0 },
                                                            { label: '싱글', value: roomDetail?.price_single || 0 },
                                                        ].map(({ label, value }) => (
                                                            <div key={label} className="bg-gray-100 px-2 py-1 rounded text-center">
                                                                <div className="text-gray-500">{label}</div>
                                                                <div className="font-semibold text-gray-900">{Number(value).toLocaleString()}동</div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div className="md:col-span-2">
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">객실 총 금액 (동) *</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={room.room_total_price}
                                                        onChange={(e) => updateRoomAt(roomIndex, (r) => ({ ...r, room_total_price: parseInt(e.target.value) || 0 }))}
                                                        className="w-full px-3 py-2 text-lg font-bold text-gray-900 bg-blue-50 rounded border-2 border-blue-200 focus:outline-none focus:border-blue-400"
                                                    />
                                                    <p className="text-xs text-gray-500 mt-1">
                                                        💡 {formatRoomPriceFormula(room, roomDetail)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* 차량 정보 */}
                    {carData.length > 0 && (
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                                <MapPin className="w-5 h-5" />
                                차량 정보 수정 ({carData.length}대)
                            </h3>
                            <div className="space-y-4">
                                {carData.map((car, idx) => (
                                    <div key={idx} className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* 1. 크루즈명 */}
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">크루즈명 *</label>
                                                <select
                                                    value={car.priceInfo?.cruise || ''}
                                                    onChange={(e) => {
                                                        const selectedCruise = e.target.value;
                                                        const matchingCar = carPriceOptions.find(c => c.cruise === selectedCruise);
                                                        if (matchingCar) {
                                                            const carCount = car.car_count || 0;
                                                            const passengerCount = car.passenger_count || 0;
                                                            const unitPrice = matchingCar.price || 0;

                                                            // 차량 수가 있으면 차량 수 * 단가, 없으면 승객 수 * 단가
                                                            const totalPrice = carCount > 0
                                                                ? carCount * unitPrice
                                                                : passengerCount * unitPrice;

                                                            const newCarData = [...carData];
                                                            newCarData[idx] = {
                                                                ...car,
                                                                car_price_code: matchingCar.car_code,
                                                                car_total_price: totalPrice,
                                                                priceInfo: matchingCar
                                                            };
                                                            setCarData(newCarData);
                                                        }
                                                    }}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                                >
                                                    <option value="">선택하세요</option>
                                                    {carCruiseOptions.map((cruise, cidx) => (
                                                        <option key={cidx} value={cruise}>{cruise}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* 2. 차량명 */}
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">차량명 *</label>
                                                <select
                                                    value={car.priceInfo?.car_type || ''}
                                                    onChange={(e) => {
                                                        const selectedCarType = e.target.value;
                                                        const matchingCar = carPriceOptions.find(c =>
                                                            c.car_type === selectedCarType &&
                                                            c.cruise === car.priceInfo?.cruise
                                                        );
                                                        if (matchingCar) {
                                                            const carCount = car.car_count || 0;
                                                            const passengerCount = car.passenger_count || 0;
                                                            const unitPrice = matchingCar.price || 0;

                                                            // 차량 수가 있으면 차량 수 * 단가, 없으면 승객 수 * 단가
                                                            const totalPrice = carCount > 0
                                                                ? carCount * unitPrice
                                                                : passengerCount * unitPrice;

                                                            const newCarData = [...carData];
                                                            newCarData[idx] = {
                                                                ...car,
                                                                car_price_code: matchingCar.car_code,
                                                                car_total_price: totalPrice,
                                                                priceInfo: matchingCar
                                                            };
                                                            setCarData(newCarData);
                                                        }
                                                    }}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                                >
                                                    <option value="">선택하세요</option>
                                                    {carTypeOptions.map((carType, cidx) => (
                                                        <option key={cidx} value={carType}>{carType}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* 3. 카테고리 */}
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">카테고리 *</label>
                                                <select
                                                    value={car.priceInfo?.car_category || ''}
                                                    onChange={(e) => {
                                                        const selectedCategory = e.target.value;
                                                        const matchingCar = carPriceOptions.find(c =>
                                                            c.car_category === selectedCategory &&
                                                            c.cruise === car.priceInfo?.cruise &&
                                                            c.car_type === car.priceInfo?.car_type
                                                        );
                                                        if (matchingCar) {
                                                            const carCount = car.car_count || 0;
                                                            const passengerCount = car.passenger_count || 0;
                                                            const unitPrice = matchingCar.price || 0;

                                                            // 차량 수가 있으면 차량 수 * 단가, 없으면 승객 수 * 단가
                                                            const totalPrice = carCount > 0
                                                                ? carCount * unitPrice
                                                                : passengerCount * unitPrice;

                                                            const newCarData = [...carData];
                                                            newCarData[idx] = {
                                                                ...car,
                                                                car_price_code: matchingCar.car_code,
                                                                car_total_price: totalPrice,
                                                                priceInfo: matchingCar
                                                            };
                                                            setCarData(newCarData);
                                                        }
                                                    }}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                                >
                                                    <option value="">선택하세요</option>
                                                    {carCategoryOptions.map((category, cidx) => (
                                                        <option key={cidx} value={category}>{category}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* 4. 차량 수 */}
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">차량 수</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={car.car_count}
                                                    onChange={(e) => {
                                                        const carCount = parseInt(e.target.value) || 0;
                                                        const unitPrice = car.priceInfo?.price || 0;
                                                        const passengerCount = car.passenger_count || 0;

                                                        // 차량 수가 있으면 차량 수 * 단가, 없으면 승객 수 * 단가
                                                        const totalPrice = carCount > 0
                                                            ? carCount * unitPrice
                                                            : passengerCount * unitPrice;

                                                        const newCarData = [...carData];
                                                        newCarData[idx] = {
                                                            ...car,
                                                            car_count: carCount,
                                                            car_total_price: totalPrice
                                                        };
                                                        setCarData(newCarData);
                                                    }}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                                />
                                            </div>

                                            {/* 5. 승객 수 */}
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">승객 수</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={car.passenger_count}
                                                    onChange={(e) => {
                                                        const passengerCount = parseInt(e.target.value) || 0;
                                                        const unitPrice = car.priceInfo?.price || 0;
                                                        const carCount = car.car_count || 0;

                                                        // 차량 수가 있으면 차량 수 * 단가, 없으면 승객 수 * 단가
                                                        const totalPrice = carCount > 0
                                                            ? carCount * unitPrice
                                                            : passengerCount * unitPrice;

                                                        const newCarData = [...carData];
                                                        newCarData[idx] = {
                                                            ...car,
                                                            passenger_count: passengerCount,
                                                            car_total_price: totalPrice
                                                        };
                                                        setCarData(newCarData);
                                                    }}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                                />
                                            </div>

                                            {/* 6. 픽업 장소 */}
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">픽업 장소</label>
                                                <input
                                                    type="text"
                                                    value={car.pickup_location || ''}
                                                    onChange={(e) => {
                                                        const newCarData = [...carData];
                                                        newCarData[idx].pickup_location = e.target.value;
                                                        setCarData(newCarData);
                                                    }}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                                />
                                            </div>

                                            {/* 7. 하차 장소 */}
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">하차 장소</label>
                                                <input
                                                    type="text"
                                                    value={car.dropoff_location || ''}
                                                    onChange={(e) => {
                                                        const newCarData = [...carData];
                                                        newCarData[idx].dropoff_location = e.target.value;
                                                        setCarData(newCarData);
                                                    }}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                                />
                                            </div>

                                            {/* 8. 픽업 시간 */}
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">픽업 시간</label>
                                                <input
                                                    type="date"
                                                    value={car.pickup_datetime || ''}
                                                    onChange={(e) => {
                                                        const newCarData = [...carData];
                                                        newCarData[idx].pickup_datetime = e.target.value;
                                                        setCarData(newCarData);
                                                    }}
                                                    className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                                                />
                                            </div>

                                            {/* 9. 차량 코드 */}
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">차량 코드</label>
                                                <div className="text-sm text-gray-900 bg-gray-100 px-2 py-1 rounded">
                                                    {car.car_price_code || '자동 설정'}
                                                </div>
                                            </div>

                                            {/* 10. 차량 단가 */}
                                            <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">차량 단가</label>
                                                <div className="text-sm text-gray-900 font-semibold bg-gray-100 px-2 py-1 rounded">
                                                    {car.priceInfo?.price ? `${car.priceInfo.price.toLocaleString()}동` : '0동'}
                                                </div>
                                            </div>

                                            {/* 11. 차량 가격 */}
                                            <div className="md:col-span-2">
                                                <label className="block text-xs font-medium text-gray-700 mb-1">차량 가격 (동) *</label>
                                                <div className="text-lg text-gray-900 font-bold bg-green-50 px-3 py-2 rounded border-2 border-green-200">
                                                    {(() => {
                                                        const carCount = car.car_count || 0;
                                                        const passengerCount = car.passenger_count || 0;
                                                        const unitPrice = car.priceInfo?.price || 0;
                                                        const totalPrice = car.car_total_price || 0;

                                                        // 디버그 정보
                                                        console.log('🔍 차량 가격 표시:', {
                                                            idx,
                                                            carCount,
                                                            passengerCount,
                                                            unitPrice,
                                                            totalPrice,
                                                            car
                                                        });

                                                        return `${totalPrice.toLocaleString()}동`;
                                                    })()}
                                                </div>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    💡 {car.car_count > 0
                                                        ? `차량 수 × 차량 단가 = ${car.car_count} × ${(car.priceInfo?.price || 0).toLocaleString()}동 = ${((car.car_count || 0) * (car.priceInfo?.price || 0)).toLocaleString()}동`
                                                        : `승객 수 × 차량 단가 = ${car.passenger_count || 0} × ${(car.priceInfo?.price || 0).toLocaleString()}동 = ${((car.passenger_count || 0) * (car.priceInfo?.price || 0)).toLocaleString()}동`
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* 예약 정보 */}
                    <div className="space-y-4">
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">예약 정보</h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">상태</label>
                                    <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${reservation.reservation.re_status === 'confirmed' ? 'bg-green-100 text-green-800' :
                                        reservation.reservation.re_status === 'approved' ? 'bg-blue-100 text-blue-800' :
                                            reservation.reservation.re_status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                                reservation.reservation.re_status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                                    'bg-gray-100 text-gray-800'
                                        }`}>
                                        {reservation.reservation.re_status === 'confirmed' ? '확정' :
                                            reservation.reservation.re_status === 'approved' ? '승인' :
                                                reservation.reservation.re_status === 'pending' ? '대기중' :
                                                    reservation.reservation.re_status === 'cancelled' ? '취소' :
                                                        reservation.reservation.re_status}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">예약일</label>
                                    <div className="text-gray-900 flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-gray-400" />
                                        {new Date(reservation.reservation.re_created_at).toLocaleDateString('ko-KR')}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">여행명</label>
                                    <div className="text-gray-900">{reservation.reservation.quote?.title || '제목 없음'}</div>
                                </div>
                                <div className="pt-4 mt-4 border-t border-gray-100 space-y-4">
                                    <h4 className="text-sm font-semibold text-gray-800">추가내역 / 추가요금</h4>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">추가내역 선택</label>
                                        <select
                                            title="추가내역 선택"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                                            value=""
                                            onChange={(e) => {
                                                const tpl = feeTemplates.find(t => String(t.id) === e.target.value);
                                                if (tpl) { setAdditionalFee(tpl.amount); setAdditionalFeeDetail(tpl.name); }
                                            }}
                                        >
                                            <option value="">-- 추가내역 선택 --</option>
                                            {feeTemplates.map(t => (
                                                <option key={t.id} value={t.id}>{t.name} ({t.amount.toLocaleString()}동)</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">추가요금 (VND)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={additionalFee}
                                            onChange={(e) => setAdditionalFee(parseInt(e.target.value, 10) || 0)}
                                            title="추가요금"
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">추가요금 내역</label>
                                        <textarea
                                            value={additionalFeeDetail}
                                            onChange={(e) => setAdditionalFeeDetail(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            rows={2}
                                            placeholder="추가요금 사유 또는 내역을 입력하세요"
                                        />
                                    </div>
                                </div>
                                {(grandTotalPrice > 0 || additionalFee > 0) && (
                                    <div className="pt-4 mt-4 border-t border-gray-100 space-y-2">
                                        {roomSummary.roomTotalPrice > 0 && (
                                            <div className="flex justify-between text-sm text-gray-700">
                                                <span>객실 금액</span>
                                                <span className="font-semibold">{roomSummary.roomTotalPrice.toLocaleString()}동</span>
                                            </div>
                                        )}
                                        {carTotalPrice > 0 && (
                                            <div className="flex justify-between text-sm text-gray-700">
                                                <span>차량 금액</span>
                                                <span className="font-semibold">{carTotalPrice.toLocaleString()}동</span>
                                            </div>
                                        )}
                                        {selectedOptionsTotal > 0 && (
                                            <div className="flex justify-between text-sm text-gray-700">
                                                <span>옵션 금액</span>
                                                <span className="font-semibold">{selectedOptionsTotal.toLocaleString()}동</span>
                                            </div>
                                        )}
                                        {additionalFee > 0 && (
                                            <div className="flex justify-between text-sm text-orange-600">
                                                <span>추가요금</span>
                                                <span className="font-semibold">+{additionalFee.toLocaleString()}동</span>
                                            </div>
                                        )}
                                        {additionalFeeDetail.trim() && (
                                            <div className="text-xs text-gray-500 whitespace-pre-wrap">{additionalFeeDetail}</div>
                                        )}
                                        <div className="pt-2 border-t border-gray-200">
                                            <label className="block text-sm font-medium text-gray-700">최종 총 금액</label>
                                            <div className="text-xl font-bold text-green-600">
                                                {grandTotalPrice.toLocaleString()}동
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                        {/* 저장 버튼 */}
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {saving ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                        저장 중...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4" />
                                        수정사항 저장
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* 요청사항 */}
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">요청사항</h3>
                            <textarea
                                rows={6}
                                value={requestNote}
                                onChange={(e) => setRequestNote(e.target.value)}
                                placeholder="특별 요청사항이나 추가 서비스 정보를 입력하세요..."
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>

                        {/* 추가 옵션 선택 (요청사항 오른쪽) */}
                        <div className="bg-white rounded-lg shadow-sm p-4">
                            <h3 className="text-base font-medium text-gray-900 mb-3">🎁 추가 옵션</h3>

                            {/* 현재 크루즈와 일정에 맞는 옵션만 필터링 */}
                            {(() => {
                                const filteredOptions = visibleTourOptions;

                                if (filteredOptions.length === 0) {
                                    return <p className="text-gray-600 text-sm">이 크루즈의 추가 옵션이 없습니다.</p>;
                                }

                                return (
                                    <div className="grid grid-cols-1 gap-2">
                                        {filteredOptions.map(option => (
                                            <label
                                                key={option.option_id}
                                                className={`flex items-start p-2.5 rounded-md border hover:border-blue-300 cursor-pointer transition-colors ${selectedOptionIds.includes(option.option_id)
                                                    ? 'bg-blue-50 border-blue-500'
                                                    : 'bg-white border-gray-200'
                                                    }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedOptionIds.includes(option.option_id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedOptionIds(prev => [...prev, option.option_id]);
                                                        } else {
                                                            setSelectedOptionIds(prev => prev.filter(id => id !== option.option_id));
                                                        }
                                                    }}
                                                    className="mt-0.5 mr-2 h-4 w-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                                                />
                                                <div className="flex-1">
                                                    <div className="text-xs font-semibold text-gray-900">{option.option_name}</div>
                                                    <div className="text-xs text-gray-600 mt-1">{option.description || option.option_name_en}</div>
                                                    <div className="text-xs font-bold text-blue-600 mt-1.5">+{option.option_price?.toLocaleString()}동</div>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>

                {isChildBirthDateModalOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
                            <div className="bg-blue-600 px-6 py-4 flex justify-between items-center">
                                <h3 className="text-lg font-bold text-white">아동 생년월일 입력</h3>
                                <button
                                    onClick={() => setIsChildBirthDateModalOpen(false)}
                                    className="text-white hover:text-blue-200 transition-colors"
                                >
                                    ✕
                                </button>
                            </div>
                            <div className="p-6">
                                <div className="space-y-3 mb-6 max-h-80 overflow-y-auto">
                                    {Array.from({ length: childBirthTargetCount }).map((_, index) => (
                                        <div key={index}>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                아동 {index + 1} 생년월일
                                            </label>
                                            <input
                                                type="date"
                                                value={tempChildBirthDates[index] || ''}
                                                onChange={(e) => {
                                                    const next = [...tempChildBirthDates];
                                                    next[index] = e.target.value;
                                                    setTempChildBirthDates(next);
                                                }}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsChildBirthDateModalOpen(false)}
                                        className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                                    >
                                        취소
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSaveChildBirthDates}
                                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold"
                                    >
                                        저장
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {isInfantBirthDateModalOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
                            <div className="bg-cyan-600 px-6 py-4 flex justify-between items-center">
                                <h3 className="text-lg font-bold text-white">유아 생년월일 입력</h3>
                                <button
                                    onClick={() => setIsInfantBirthDateModalOpen(false)}
                                    className="text-white hover:text-cyan-200 transition-colors"
                                >
                                    ✕
                                </button>
                            </div>
                            <div className="p-6">
                                <div className="space-y-3 mb-6 max-h-80 overflow-y-auto">
                                    {Array.from({ length: infantBirthTargetCount }).map((_, index) => (
                                        <div key={index}>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                유아 {index + 1} 생년월일
                                            </label>
                                            <input
                                                type="date"
                                                value={tempInfantBirthDates[index] || ''}
                                                onChange={(e) => {
                                                    const next = [...tempInfantBirthDates];
                                                    next[index] = e.target.value;
                                                    setTempInfantBirthDates(next);
                                                }}
                                                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none"
                                            />
                                        </div>
                                    ))}
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsInfantBirthDateModalOpen(false)}
                                        className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                                    >
                                        취소
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSaveInfantBirthDates}
                                        className="flex-1 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 font-semibold"
                                    >
                                        저장
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </ManagerLayout>
    );
}

export default function CruiseReservationEditPage() {
    return (
        <Suspense fallback={
            <ManagerLayout title="🚢 크루즈 예약 수정" activeTab="reservation-edit-cruise">
                <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600">페이지를 불러오는 중...</p>
                    </div>
                </div>
            </ManagerLayout>
        }>
            <CruiseReservationEditContent />
        </Suspense>
    );
}
