'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
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
    Plane,
    Package,
    ChevronDown,
    ChevronUp,
    Edit3,
    Check,
    X
} from 'lucide-react';

interface PackageReservation {
    re_id: string;
    re_status: string;
    re_created_at: string;
    re_adult_count: number;
    re_child_count: number;
    re_infant_count: number;
    total_amount: number;
    manager_note: string;
    package_id: string;
    price_breakdown: any;
    users: {
        name: string;
        email: string;
        phone_number: string;
    } | null;
    package_master: {
        id: string;
        package_code: string;
        name: string;
        description: string;
    } | null;
}

interface PackageDetail {
    id: string;
    reservation_id: string;
    package_id: string;
    adult_count: number;
    child_extra_bed: number;
    child_no_extra_bed: number;
    infant_free: number;
    infant_tour: number;
    infant_extra_bed: number;
    infant_seat: number;
    airport_vehicle: string;
    ninh_binh_vehicle: string;
    hanoi_vehicle: string;
    cruise_vehicle: string;
    sht_pickup_vehicle: string;
    sht_pickup_seat: string;
    sht_dropoff_vehicle: string;
    sht_dropoff_seat: string;
    adult_price: number;
    child_extra_bed_price: number;
    child_no_extra_bed_price: number;
    infant_tour_price: number;
    infant_extra_bed_price: number;
    infant_seat_price: number;
    total_price: number;
    additional_requests: string;
}

interface ServiceData {
    type: string;
    data: any;
    isExpanded: boolean;
}

function PackageReservationEditContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const reservationId = searchParams.get('id');

    const [reservation, setReservation] = useState<PackageReservation | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [services, setServices] = useState<ServiceData[]>([]);
    const [packageDetail, setPackageDetail] = useState<PackageDetail | null>(null);

    // 메인 예약 폼 데이터
    const [formData, setFormData] = useState({
        re_status: 'pending',
        re_adult_count: 2,
        re_child_count: 0,
        re_infant_count: 0,
        total_amount: 0,
        manager_note: ''
    });

    useEffect(() => {
        if (reservationId) {
            loadPackageReservation();
        } else {
            router.push('/manager/reservation-edit?type=package');
        }
    }, [reservationId]);

    useEffect(() => {
        if (!packageDetail) return;

        const childCount = Number(packageDetail.child_extra_bed || 0) + Number(packageDetail.child_no_extra_bed || 0);
        const infantCount = Number(packageDetail.infant_free || 0)
            + Number(packageDetail.infant_tour || 0)
            + Number(packageDetail.infant_extra_bed || 0)
            + Number(packageDetail.infant_seat || 0);

        const calculatedTotal =
            Number(packageDetail.adult_count || 0) * Number(packageDetail.adult_price || 0)
            + Number(packageDetail.child_extra_bed || 0) * Number(packageDetail.child_extra_bed_price || 0)
            + Number(packageDetail.child_no_extra_bed || 0) * Number(packageDetail.child_no_extra_bed_price || 0)
            + Number(packageDetail.infant_tour || 0) * Number(packageDetail.infant_tour_price || 0)
            + Number(packageDetail.infant_extra_bed || 0) * Number(packageDetail.infant_extra_bed_price || 0)
            + Number(packageDetail.infant_seat || 0) * Number(packageDetail.infant_seat_price || 0);

        setPackageDetail(prev => {
            if (!prev) return prev;
            if (Number(prev.total_price || 0) === calculatedTotal) return prev;
            return { ...prev, total_price: calculatedTotal };
        });

        setFormData(prev => {
            const next = {
                ...prev,
                re_adult_count: Number(packageDetail.adult_count || 0),
                re_child_count: childCount,
                re_infant_count: infantCount,
                total_amount: calculatedTotal,
            };

            if (
                prev.re_adult_count === next.re_adult_count
                && prev.re_child_count === next.re_child_count
                && prev.re_infant_count === next.re_infant_count
                && prev.total_amount === next.total_amount
            ) {
                return prev;
            }

            return next;
        });
    }, [
        packageDetail?.adult_count,
        packageDetail?.child_extra_bed,
        packageDetail?.child_no_extra_bed,
        packageDetail?.infant_free,
        packageDetail?.infant_tour,
        packageDetail?.infant_extra_bed,
        packageDetail?.infant_seat,
        packageDetail?.adult_price,
        packageDetail?.child_extra_bed_price,
        packageDetail?.child_no_extra_bed_price,
        packageDetail?.infant_tour_price,
        packageDetail?.infant_extra_bed_price,
        packageDetail?.infant_seat_price,
    ]);

    const loadPackageReservation = async () => {
        try {
            setLoading(true);

            // 1. 메인 예약 정보 조회 (조인 없이)
            const { data: resData, error: resError } = await supabase
                .from('reservation')
                .select(`
                    re_id,
                    re_user_id,
                    re_status,
                    re_created_at,
                    re_adult_count,
                    re_child_count,
                    re_infant_count,
                    total_amount,
                    manager_note,
                    package_id,
                    price_breakdown
                `)
                .eq('re_id', reservationId)
                .single();

            if (resError) {
                console.error('패키지 예약 조회 실패:', resError);
                alert('예약 정보를 찾을 수 없습니다.');
                router.push('/manager/reservation-edit?type=package');
                return;
            }

            // 2. 사용자 정보 별도 조회
            let userData = null;
            if (resData.re_user_id) {
                const { data: userInfo } = await supabase
                    .from('users')
                    .select('name, email, phone_number')
                    .eq('id', resData.re_user_id)
                    .single();
                userData = userInfo;
            }

            // 3. 패키지 정보 별도 조회
            let packageData = null;
            if (resData.package_id) {
                const { data: pkgInfo } = await supabase
                    .from('package_master')
                    .select('id, package_code, name, description, price_child_extra_bed, price_child_no_extra_bed, price_infant_tour, price_infant_extra_bed, price_infant_seat')
                    .eq('id', resData.package_id)
                    .single();
                packageData = pkgInfo;
            }

            // 데이터 병합
            const mergedData = {
                ...resData,
                users: userData,
                package_master: packageData
            };

            setReservation(mergedData as any);
            setFormData({
                re_status: resData.re_status || 'pending',
                re_adult_count: resData.re_adult_count || 2,
                re_child_count: resData.re_child_count || 0,
                re_infant_count: resData.re_infant_count || 0,
                total_amount: resData.total_amount || 0,
                manager_note: resData.manager_note || ''
            });

            // 4. 하위 서비스 조회 (패키지에 포함된 모든 서비스)
            await loadPackageServices(reservationId!);

            // 5. reservation_package 상세 조회
            const { data: pkgDetail } = await supabase
                .from('reservation_package')
                .select('*')
                .eq('reservation_id', reservationId)
                .maybeSingle();

            if (pkgDetail) {
                setPackageDetail(pkgDetail);
            } else {
                const safeAdult = Number(resData.re_adult_count || 0);
                const safeChild = Number(resData.re_child_count || 0);
                const safeInfant = Number(resData.re_infant_count || 0);

                setPackageDetail({
                    id: '',
                    reservation_id: reservationId || '',
                    package_id: resData.package_id || '',
                    adult_count: safeAdult,
                    child_extra_bed: 0,
                    child_no_extra_bed: safeChild,
                    infant_free: safeInfant,
                    infant_tour: 0,
                    infant_extra_bed: 0,
                    infant_seat: 0,
                    airport_vehicle: '',
                    ninh_binh_vehicle: '',
                    hanoi_vehicle: '',
                    cruise_vehicle: '스하 셔틀 리무진',
                    sht_pickup_vehicle: '',
                    sht_pickup_seat: '',
                    sht_dropoff_vehicle: '',
                    sht_dropoff_seat: '',
                    adult_price: 0,
                    child_extra_bed_price: Number((packageData as any)?.price_child_extra_bed || 6900000),
                    child_no_extra_bed_price: Number((packageData as any)?.price_child_no_extra_bed || 5850000),
                    infant_tour_price: Number((packageData as any)?.price_infant_tour || 900000),
                    infant_extra_bed_price: Number((packageData as any)?.price_infant_extra_bed || 4200000),
                    infant_seat_price: Number((packageData as any)?.price_infant_seat || 800000),
                    total_price: Number(resData.total_amount || 0),
                    additional_requests: '',
                });
            }

        } catch (error) {
            console.error('데이터 로드 실패:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadPackageServices = async (resId: string) => {
        const loadedServices: ServiceData[] = [];

        const getServiceDateTime = (service: ServiceData) => {
            const raw = service.type === 'airport'
                ? service.data.ra_datetime
                : service.type === 'cruise'
                    ? service.data.checkin
                    : service.type === 'tour'
                        ? service.data.usage_date
                        : service.type === 'sht'
                            ? (service.data.pickup_datetime || service.data.usage_date)
                            : (service.data.pickup_datetime || service.data.checkin_date);

            if (!raw) return Number.MAX_SAFE_INTEGER;
            const d = new Date(raw);
            const t = d.getTime();
            return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
        };

        const getAirportStep = (data: any) => {
            const way = String(data?.way_type || '').toLowerCase();
            if (way.includes('pickup') || way.includes('entry') || way.includes('픽업')) return 'pickup';
            if (way.includes('sanding') || way.includes('sending') || way.includes('exit') || way.includes('샌딩')) return 'sanding';
            return 'unknown';
        };

        const getTourStep = (data: any) => {
            const text = `${data?.tour_name || ''} ${data?.request_note || ''}`.toLowerCase();
            if (text.includes('닌빈') || text.includes('ninh')) return 'ninhbinh';
            if (text.includes('하노이') || text.includes('hanoi')) return 'hanoi';
            return 'tour';
        };

        const getStepOrder = (service: ServiceData) => {
            if (service.type === 'airport') {
                return getAirportStep(service.data) === 'pickup' ? 1 : 7;
            }
            if (service.type === 'tour') {
                return getTourStep(service.data) === 'hanoi' ? 6 : 2;
            }
            if (service.type === 'sht') {
                const category = String(service.data?.sht_category || '').toLowerCase();
                if (category.includes('pickup')) return 3;
                if (category.includes('drop')) return 5;
                return 4;
            }
            if (service.type === 'cruise') return 4;
            if (service.type === 'hotel') return 8;
            if (service.type === 'rentcar') return 9;
            return 99;
        };

        // 공항 서비스 조회
        const { data: airportData } = await supabase
            .from('reservation_airport')
            .select('*')
            .eq('reservation_id', resId);

        if (airportData && airportData.length > 0) {
            airportData.forEach((item, idx) => {
                loadedServices.push({
                    type: 'airport',
                    data: item,
                    isExpanded: idx === 0
                });
            });
        }

        // 크루즈 서비스 조회
        const { data: cruiseData } = await supabase
            .from('reservation_cruise')
            .select('*')
            .eq('reservation_id', resId);

        if (cruiseData && cruiseData.length > 0) {
            cruiseData.forEach((item, idx) => {
                loadedServices.push({
                    type: 'cruise',
                    data: item,
                    isExpanded: false
                });
            });
        }

        // 투어 서비스 조회
        const { data: tourData } = await supabase
            .from('reservation_tour')
            .select('*')
            .eq('reservation_id', resId);

        if (tourData && tourData.length > 0) {
            const tourCodes = Array.from(new Set(tourData.map((item: any) => item.tour_price_code).filter(Boolean)));
            let tourNameMap = new Map<string, string>();

            if (tourCodes.length > 0) {
                const { data: tourPriceRows } = await supabase
                    .from('tour_pricing')
                    .select('pricing_id, tour:tour_id(tour_name)')
                    .in('pricing_id', tourCodes);

                tourNameMap = new Map(
                    (tourPriceRows || []).map((row: any) => [row.pricing_id, row?.tour?.tour_name || ''])
                );
            }

            tourData.forEach((item, idx) => {
                loadedServices.push({
                    type: 'tour',
                    data: {
                        ...item,
                        tour_name: tourNameMap.get(item.tour_price_code) || item.tour_name,
                    },
                    isExpanded: false
                });
            });
        }

        // 스하차량 서비스 조회
        const { data: shtData } = await supabase
            .from('reservation_car_sht')
            .select('*')
            .eq('reservation_id', resId);

        if (shtData && shtData.length > 0) {
            shtData.forEach((item, idx) => {
                loadedServices.push({
                    type: 'sht',
                    data: item,
                    isExpanded: false
                });
            });
        }

        // 호텔 서비스 조회
        const { data: hotelData } = await supabase
            .from('reservation_hotel')
            .select('*')
            .eq('reservation_id', resId);

        if (hotelData && hotelData.length > 0) {
            hotelData.forEach((item, idx) => {
                loadedServices.push({
                    type: 'hotel',
                    data: item,
                    isExpanded: false
                });
            });
        }

        // 렌터카 서비스 조회
        const { data: rentcarData } = await supabase
            .from('reservation_rentcar')
            .select('*')
            .eq('reservation_id', resId);

        if (rentcarData && rentcarData.length > 0) {
            rentcarData.forEach((item, idx) => {
                loadedServices.push({
                    type: 'rentcar',
                    data: item,
                    isExpanded: false
                });
            });
        }

        // 날짜 + 단계 순서 정렬: 공항 픽업 → 닌빈투어 → 스하차량 픽업 → 크루즈 → 스하차량 드롭 → 하노이 오후 투어 → 공항 샌딩
        const sortedServices = loadedServices.sort((a, b) => {
            const dateDiff = getServiceDateTime(a) - getServiceDateTime(b);
            if (dateDiff !== 0) return dateDiff;
            return getStepOrder(a) - getStepOrder(b);
        });

        console.log('📦 패키지 서비스 로드 완료:', sortedServices.length, '개');
        setServices(sortedServices);
    };

    const toggleServiceExpand = (index: number) => {
        setServices(prev => prev.map((s, i) =>
            i === index ? { ...s, isExpanded: !s.isExpanded } : s
        ));
    };

    const updateServiceData = (index: number, field: string, value: any) => {
        setServices(prev => prev.map((s, i) =>
            i === index ? { ...s, data: { ...s.data, [field]: value } } : s
        ));
    };

    const handleSave = async () => {
        if (!reservationId) return;

        setSaving(true);
        try {
            // 1. 메인 예약 정보 업데이트
            const paxCount = (formData.re_adult_count || 0) + (formData.re_child_count || 0) + (formData.re_infant_count || 0);
            const { error: mainError } = await supabase
                .from('reservation')
                .update({
                    re_status: formData.re_status,
                    re_adult_count: formData.re_adult_count,
                    re_child_count: formData.re_child_count,
                    re_infant_count: formData.re_infant_count,
                    pax_count: paxCount,
                    total_amount: formData.total_amount,
                    manager_note: formData.manager_note,
                    re_update_at: new Date().toISOString(),
                })
                .eq('re_id', reservationId);

            if (mainError) throw mainError;

            // 1-1. reservation_package 상세 저장/업데이트
            if (packageDetail) {
                const payload = {
                    reservation_id: reservationId,
                    package_id: reservation.package_id,
                    adult_count: packageDetail.adult_count,
                    child_extra_bed: packageDetail.child_extra_bed,
                    child_no_extra_bed: packageDetail.child_no_extra_bed,
                    infant_free: packageDetail.infant_free,
                    infant_tour: packageDetail.infant_tour,
                    infant_extra_bed: packageDetail.infant_extra_bed,
                    infant_seat: packageDetail.infant_seat,
                    airport_vehicle: packageDetail.airport_vehicle,
                    ninh_binh_vehicle: packageDetail.ninh_binh_vehicle,
                    hanoi_vehicle: packageDetail.hanoi_vehicle,
                    cruise_vehicle: packageDetail.cruise_vehicle,
                    sht_pickup_vehicle: packageDetail.sht_pickup_vehicle,
                    sht_pickup_seat: packageDetail.sht_pickup_seat,
                    sht_dropoff_vehicle: packageDetail.sht_dropoff_vehicle,
                    sht_dropoff_seat: packageDetail.sht_dropoff_seat,
                    adult_price: packageDetail.adult_price,
                    child_extra_bed_price: packageDetail.child_extra_bed_price,
                    child_no_extra_bed_price: packageDetail.child_no_extra_bed_price,
                    infant_tour_price: packageDetail.infant_tour_price,
                    infant_extra_bed_price: packageDetail.infant_extra_bed_price,
                    infant_seat_price: packageDetail.infant_seat_price,
                    total_price: packageDetail.total_price,
                    additional_requests: packageDetail.additional_requests,
                    updated_at: new Date().toISOString()
                };

                const detailQuery = packageDetail.id
                    ? supabase.from('reservation_package').update(payload).eq('id', packageDetail.id)
                    : supabase.from('reservation_package').insert(payload);

                const { error: pkgDetailError } = await detailQuery;

                if (pkgDetailError) {
                    console.warn('reservation_package 저장 실패:', pkgDetailError);
                }
            }

            // 2. 각 서비스 업데이트
            for (const service of services) {
                const tableName = service.type === 'sht' ? 'reservation_car_sht' : `reservation_${service.type}`;
                const idField = service.type === 'airport' ? 'ra_id' : 'id';
                const id = service.data[idField] || service.data.id || service.data.ra_id;

                if (id) {
                    const { error: serviceError } = await supabase
                        .from(tableName)
                        .update(service.data)
                        .eq(idField, id);

                    if (serviceError) {
                        console.warn(`${tableName} 업데이트 실패:`, serviceError);
                    }
                }
            }

            alert('패키지 예약이 저장되었습니다.');
            router.push('/manager/reservation-edit?type=package');

        } catch (error: any) {
            console.error('저장 실패:', error);
            alert('저장 중 오류가 발생했습니다: ' + error.message);
        } finally {
            setSaving(false);
        }
    };

    const getServiceIcon = (type: string) => {
        switch (type) {
            case 'airport': return <Plane className="w-5 h-5 text-green-600" />;
            case 'cruise': return <Ship className="w-5 h-5 text-blue-600" />;
            case 'tour': return <MapPin className="w-5 h-5 text-orange-600" />;
            case 'sht': return <span className="text-indigo-600">🚌</span>;
            case 'hotel': return <span className="text-purple-600">🏨</span>;
            case 'rentcar': return <span className="text-red-600">🚗</span>;
            default: return <Package className="w-5 h-5 text-gray-600" />;
        }
    };

    const getServiceLabel = (type: string) => {
        const labels: { [key: string]: string } = {
            'airport': '공항 픽업/샌딩',
            'cruise': '크루즈 서비스',
            'tour': '투어',
            'sht': '스하차량',
            'hotel': '호텔',
            'rentcar': '렌터카'
        };
        return labels[type] || type;
    };

    const getServiceDisplayLabel = (service: ServiceData) => {
        if (service.type === 'airport') {
            const way = String(service.data?.way_type || '').toLowerCase();
            if (way.includes('pickup') || way.includes('entry') || way.includes('픽업')) return '공항 픽업';
            if (way.includes('sanding') || way.includes('sending') || way.includes('exit') || way.includes('샌딩')) return '공항 샌딩';
            return '공항 픽업/샌딩';
        }

        if (service.type === 'tour') {
            const text = `${service.data?.tour_name || ''} ${service.data?.request_note || ''}`.toLowerCase();
            if (text.includes('닌빈') || text.includes('ninh')) return '닌빈투어';
            if (text.includes('하노이') || text.includes('hanoi')) return '하노이 오후 투어';
            return '투어';
        }

        if (service.type === 'sht') {
            const category = String(service.data?.sht_category || '').toLowerCase();
            if (category.includes('pickup')) return '스하차량 픽업';
            if (category.includes('drop')) return '스하차량 드롭';
            return '스하차량';
        }

        if (service.type === 'cruise') return '크루즈';
        return getServiceLabel(service.type);
    };

    const getServiceDisplayDate = (service: ServiceData) => {
        const value = service.data?.ra_datetime
            || service.data?.usage_date
            || service.data?.pickup_datetime
            || service.data?.checkin
            || service.data?.checkin_date;

        if (!value) return null;
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return null;
        return d.toLocaleDateString('ko-KR');
    };

    const renderServiceForm = (service: ServiceData, index: number) => {
        const { type, data } = service;

        switch (type) {
            case 'airport':
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">공항 위치</label>
                            <input
                                type="text"
                                value={data.ra_airport_location || ''}
                                onChange={(e) => updateServiceData(index, 'ra_airport_location', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">일시</label>
                            <input
                                type="datetime-local"
                                value={data.ra_datetime ? data.ra_datetime.slice(0, 16) : ''}
                                onChange={(e) => updateServiceData(index, 'ra_datetime', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">항공편</label>
                            <input
                                type="text"
                                value={data.ra_flight_number || ''}
                                onChange={(e) => updateServiceData(index, 'ra_flight_number', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">픽업/샌딩</label>
                            <select
                                value={data.way_type || 'entry'}
                                onChange={(e) => updateServiceData(index, 'way_type', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            >
                                <option value="entry">픽업 (입국)</option>
                                <option value="exit">샌딩 (출국)</option>
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">요청사항</label>
                            <textarea
                                value={data.request_note || ''}
                                onChange={(e) => updateServiceData(index, 'request_note', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                                rows={2}
                            />
                        </div>
                    </div>
                );

            case 'cruise':
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">체크인 날짜</label>
                            <input
                                type="date"
                                value={data.checkin || ''}
                                onChange={(e) => updateServiceData(index, 'checkin', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">인원수</label>
                            <input
                                type="number"
                                value={data.guest_count || 0}
                                onChange={(e) => updateServiceData(index, 'guest_count', parseInt(e.target.value) || 0)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">객실 가격 코드</label>
                            <input
                                type="text"
                                value={data.room_price_code || ''}
                                onChange={(e) => updateServiceData(index, 'room_price_code', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">객실 총 가격</label>
                            <input
                                type="number"
                                value={data.room_total_price || 0}
                                onChange={(e) => updateServiceData(index, 'room_total_price', parseInt(e.target.value) || 0)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">요청사항</label>
                            <textarea
                                value={data.request_note || ''}
                                onChange={(e) => updateServiceData(index, 'request_note', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                                rows={2}
                            />
                        </div>
                    </div>
                );

            case 'tour':
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">투어 날짜</label>
                            <input
                                type="date"
                                value={data.usage_date || ''}
                                onChange={(e) => updateServiceData(index, 'pickup_datetime', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">투어 가격 코드</label>
                            <input
                                type="text"
                                value={data.tour_price_code || ''}
                                onChange={(e) => updateServiceData(index, 'tour_price_code', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">픽업 위치</label>
                            <input
                                type="text"
                                value={data.pickup_location || ''}
                                onChange={(e) => updateServiceData(index, 'pickup_location', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">인원</label>
                            <input
                                type="number"
                                value={data.tour_capacity || 0}
                                onChange={(e) => updateServiceData(index, 'tour_capacity', parseInt(e.target.value) || 0)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">요청사항</label>
                            <textarea
                                value={data.request_note || ''}
                                onChange={(e) => updateServiceData(index, 'request_note', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                                rows={2}
                            />
                        </div>
                    </div>
                );

            case 'hotel':
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">체크인 날짜</label>
                            <input
                                type="date"
                                value={data.checkin_date || ''}
                                onChange={(e) => updateServiceData(index, 'checkin_date', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">숙박일수</label>
                            <input
                                type="number"
                                value={data.nights || 1}
                                onChange={(e) => updateServiceData(index, 'nights', parseInt(e.target.value) || 1)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">호텔 가격 코드</label>
                            <input
                                type="text"
                                value={data.hotel_price_code || ''}
                                onChange={(e) => updateServiceData(index, 'hotel_price_code', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">인원</label>
                            <input
                                type="number"
                                value={data.guest_count || 0}
                                onChange={(e) => updateServiceData(index, 'guest_count', parseInt(e.target.value) || 0)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">요청사항</label>
                            <textarea
                                value={data.request_note || ''}
                                onChange={(e) => updateServiceData(index, 'request_note', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                                rows={2}
                            />
                        </div>
                    </div>
                );

            case 'rentcar':
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">픽업 일시</label>
                            <input
                                type="datetime-local"
                                value={data.pickup_datetime ? data.pickup_datetime.slice(0, 16) : ''}
                                onChange={(e) => updateServiceData(index, 'pickup_datetime', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">픽업 위치</label>
                            <input
                                type="text"
                                value={data.pickup_location || ''}
                                onChange={(e) => updateServiceData(index, 'pickup_location', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">목적지</label>
                            <input
                                type="text"
                                value={data.destination || ''}
                                onChange={(e) => updateServiceData(index, 'destination', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">렌터카 가격 코드</label>
                            <input
                                type="text"
                                value={data.rentcar_price_code || ''}
                                onChange={(e) => updateServiceData(index, 'rentcar_price_code', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">요청사항</label>
                            <textarea
                                value={data.request_note || ''}
                                onChange={(e) => updateServiceData(index, 'request_note', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                                rows={2}
                            />
                        </div>
                    </div>
                );

            case 'sht':
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">구분(픽업/드롭)</label>
                            <select
                                value={data.sht_category || 'pickup'}
                                onChange={(e) => updateServiceData(index, 'sht_category', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            >
                                <option value="pickup">픽업</option>
                                <option value="dropoff">드롭</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">일시</label>
                            <input
                                type="datetime-local"
                                value={(data.pickup_datetime || data.usage_date) ? String(data.pickup_datetime || data.usage_date).slice(0, 16) : ''}
                                onChange={(e) => updateServiceData(index, 'pickup_datetime', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">차량 번호</label>
                            <input
                                type="text"
                                value={data.vehicle_number || ''}
                                onChange={(e) => updateServiceData(index, 'vehicle_number', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">좌석 번호</label>
                            <input
                                type="text"
                                value={data.seat_number || ''}
                                onChange={(e) => updateServiceData(index, 'seat_number', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">픽업 위치</label>
                            <input
                                type="text"
                                value={data.pickup_location || ''}
                                onChange={(e) => updateServiceData(index, 'pickup_location', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">드롭 위치</label>
                            <input
                                type="text"
                                value={data.dropoff_location || ''}
                                onChange={(e) => updateServiceData(index, 'dropoff_location', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">요청사항</label>
                            <textarea
                                value={data.request_note || ''}
                                onChange={(e) => updateServiceData(index, 'request_note', e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                                rows={2}
                            />
                        </div>
                    </div>
                );

            default:
                return <div className="text-gray-500">지원되지 않는 서비스 타입입니다.</div>;
        }
    };

    if (loading) {
        return (
            <ManagerLayout title="📦 패키지 예약 수정" activeTab="reservation-edit">
                <div className="flex justify-center items-center h-64">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
                        <p className="mt-4 text-gray-600">패키지 정보 로드 중...</p>
                    </div>
                </div>
            </ManagerLayout>
        );
    }

    if (!reservation) {
        return (
            <ManagerLayout title="📦 패키지 예약 수정" activeTab="reservation-edit">
                <div className="text-center py-12">
                    <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">예약 정보를 찾을 수 없습니다.</p>
                </div>
            </ManagerLayout>
        );
    }

    return (
        <ManagerLayout title="📦 패키지 예약 수정" activeTab="reservation-edit">
            <div className="max-w-4xl mx-auto space-y-6 pb-20">
                {/* 헤더 */}
                <div className="flex items-center justify-between">
                    <button
                        onClick={() => router.push('/manager/reservation-edit?type=package')}
                        className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        목록으로
                    </button>
                    <div className="text-sm text-gray-500">
                        예약 ID: {reservation.re_id.slice(0, 8)}...
                    </div>
                </div>

                {/* 패키지 정보 */}
                <div className="bg-purple-50 rounded-lg p-6 border border-purple-200">
                    <div className="flex items-center gap-3 mb-4">
                        <Package className="w-8 h-8 text-purple-600" />
                        <div>
                            <h2 className="text-xl font-bold text-purple-800">
                                {reservation.package_master?.name || '패키지'}
                            </h2>
                            <p className="text-sm text-purple-600">
                                {reservation.package_master?.package_code}
                            </p>
                        </div>
                    </div>
                    <p className="text-sm text-gray-600">
                        {reservation.package_master?.description}
                    </p>
                </div>

                {/* 고객 정보 */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <User className="w-5 h-5 text-blue-500" />
                        고객 정보
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-600">{reservation.users?.name || '정보 없음'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-600">{reservation.users?.email || '-'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-600">{reservation.users?.phone_number || '-'}</span>
                        </div>
                    </div>
                </div>

                {/* 패키지 상세 (reservation_package) */}
                {packageDetail && (
                    <div className="bg-white rounded-lg shadow-sm p-6">
                        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                            <Users className="w-5 h-5 text-purple-500" />
                            패키지 인원/차량/가격 상세
                        </h3>

                        {/* 인원 구성 */}
                        <div className="mb-4">
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">인원 구성</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                                {[
                                    { label: '성인', key: 'adult_count' },
                                    { label: '아동(EB)', key: 'child_extra_bed' },
                                    { label: '아동(No EB)', key: 'child_no_extra_bed' },
                                    { label: '유아(무료)', key: 'infant_free' },
                                    { label: '유아(투어)', key: 'infant_tour' },
                                    { label: '유아(EB)', key: 'infant_extra_bed' },
                                    { label: '유아(좌석)', key: 'infant_seat' },
                                ].map(({ label, key }) => (
                                    <div key={key}>
                                        <label className="block text-xs text-gray-500 mb-1">{label}</label>
                                        <input
                                            type="number"
                                            value={(packageDetail as any)[key] || 0}
                                            onChange={(e) => setPackageDetail(prev => prev ? { ...prev, [key]: parseInt(e.target.value) || 0 } : prev)}
                                            className="w-full px-2 py-1.5 border rounded text-sm text-center"
                                            min="0"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 차량 배정 */}
                        <div className="mb-4">
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">차량 배정</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                {[
                                    { label: '공항 차량', key: 'airport_vehicle' },
                                    { label: '닌빈 차량', key: 'ninh_binh_vehicle' },
                                    { label: '하노이 차량', key: 'hanoi_vehicle' },
                                    { label: '크루즈 차량', key: 'cruise_vehicle' },
                                ].map(({ label, key }) => (
                                    <div key={key}>
                                        <label className="block text-xs text-gray-500 mb-1">{label}</label>
                                        <input
                                            type="text"
                                            value={(packageDetail as any)[key] || ''}
                                            onChange={(e) => setPackageDetail(prev => prev ? { ...prev, [key]: e.target.value } : prev)}
                                            className="w-full px-2 py-1.5 border rounded text-sm"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* SHT 좌석 */}
                        <div className="mb-4">
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">SHT 셔틀 좌석</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                                {[
                                    { label: '픽업 차량번호', key: 'sht_pickup_vehicle' },
                                    { label: '픽업 좌석', key: 'sht_pickup_seat' },
                                    { label: '드랍 차량번호', key: 'sht_dropoff_vehicle' },
                                    { label: '드랍 좌석', key: 'sht_dropoff_seat' },
                                ].map(({ label, key }) => (
                                    <div key={key}>
                                        <label className="block text-xs text-gray-500 mb-1">{label}</label>
                                        <input
                                            type="text"
                                            value={(packageDetail as any)[key] || ''}
                                            onChange={(e) => setPackageDetail(prev => prev ? { ...prev, [key]: e.target.value } : prev)}
                                            className="w-full px-2 py-1.5 border rounded text-sm"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 가격 정보 */}
                        <div className="mb-4">
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">단가 설정 (동)</h4>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                {[
                                    { label: '성인 단가', key: 'adult_price' },
                                    { label: '아동(EB) 단가', key: 'child_extra_bed_price' },
                                    { label: '아동(No EB) 단가', key: 'child_no_extra_bed_price' },
                                    { label: '유아(투어) 단가', key: 'infant_tour_price' },
                                    { label: '유아(EB) 단가', key: 'infant_extra_bed_price' },
                                    { label: '유아(좌석) 단가', key: 'infant_seat_price' },
                                ].map(({ label, key }) => (
                                    <div key={key}>
                                        <label className="block text-xs text-gray-500 mb-1">{label}</label>
                                        <input
                                            type="number"
                                            value={(packageDetail as any)[key] || 0}
                                            onChange={(e) => setPackageDetail(prev => prev ? { ...prev, [key]: parseInt(e.target.value) || 0 } : prev)}
                                            className="w-full px-2 py-1.5 border rounded text-sm text-right"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="mb-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">금액 계산 상세</h4>
                            <div className="space-y-1 text-sm">
                                <div className="flex justify-between"><span>성인 ({packageDetail.adult_count || 0}명 x {(packageDetail.adult_price || 0).toLocaleString()}동)</span><span>{((packageDetail.adult_count || 0) * (packageDetail.adult_price || 0)).toLocaleString()}동</span></div>
                                <div className="flex justify-between"><span>아동(EB) ({packageDetail.child_extra_bed || 0}명 x {(packageDetail.child_extra_bed_price || 0).toLocaleString()}동)</span><span>{((packageDetail.child_extra_bed || 0) * (packageDetail.child_extra_bed_price || 0)).toLocaleString()}동</span></div>
                                <div className="flex justify-between"><span>아동(No EB) ({packageDetail.child_no_extra_bed || 0}명 x {(packageDetail.child_no_extra_bed_price || 0).toLocaleString()}동)</span><span>{((packageDetail.child_no_extra_bed || 0) * (packageDetail.child_no_extra_bed_price || 0)).toLocaleString()}동</span></div>
                                <div className="flex justify-between"><span>유아(투어) ({packageDetail.infant_tour || 0}명 x {(packageDetail.infant_tour_price || 0).toLocaleString()}동)</span><span>{((packageDetail.infant_tour || 0) * (packageDetail.infant_tour_price || 0)).toLocaleString()}동</span></div>
                                <div className="flex justify-between"><span>유아(EB) ({packageDetail.infant_extra_bed || 0}명 x {(packageDetail.infant_extra_bed_price || 0).toLocaleString()}동)</span><span>{((packageDetail.infant_extra_bed || 0) * (packageDetail.infant_extra_bed_price || 0)).toLocaleString()}동</span></div>
                                <div className="flex justify-between"><span>유아(좌석) ({packageDetail.infant_seat || 0}명 x {(packageDetail.infant_seat_price || 0).toLocaleString()}동)</span><span>{((packageDetail.infant_seat || 0) * (packageDetail.infant_seat_price || 0)).toLocaleString()}동</span></div>
                                <div className="border-t border-gray-300 pt-2 mt-2 flex justify-between font-bold text-indigo-700"><span>자동 계산 합계</span><span>{(packageDetail.total_price || 0).toLocaleString()}동</span></div>
                            </div>
                        </div>

                        {/* 패키지 합계 및 추가 요청 */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">패키지 총 금액 (동)</label>
                                <input
                                    type="number"
                                    value={packageDetail.total_price || 0}
                                    onChange={(e) => setPackageDetail(prev => prev ? { ...prev, total_price: parseInt(e.target.value) || 0 } : prev)}
                                    className="w-full px-3 py-2 border rounded-lg text-sm font-bold text-indigo-600"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">추가 요청사항</label>
                                <textarea
                                    value={packageDetail.additional_requests || ''}
                                    onChange={(e) => setPackageDetail(prev => prev ? { ...prev, additional_requests: e.target.value } : prev)}
                                    className="w-full px-3 py-2 border rounded-lg text-sm"
                                    rows={2}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* 예약 기본 정보 */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-green-500" />
                        예약 정보
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">상태</label>
                            <select
                                value={formData.re_status}
                                onChange={(e) => setFormData(prev => ({ ...prev, re_status: e.target.value }))}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            >
                                <option value="pending">대기중</option>
                                <option value="approved">승인</option>
                                <option value="confirmed">확정</option>
                                <option value="processing">처리중</option>
                                <option value="cancelled">취소</option>
                                <option value="completed">완료</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">성인</label>
                            <input
                                type="number"
                                value={formData.re_adult_count}
                                onChange={(e) => {
                                    const value = parseInt(e.target.value) || 0;
                                    setFormData(prev => ({ ...prev, re_adult_count: value }));
                                    setPackageDetail(prev => prev ? { ...prev, adult_count: value } : prev);
                                }}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">아동</label>
                            <input
                                type="number"
                                value={formData.re_child_count}
                                onChange={(e) => {
                                    const value = parseInt(e.target.value) || 0;
                                    setFormData(prev => ({ ...prev, re_child_count: value }));
                                    setPackageDetail(prev => prev ? { ...prev, child_no_extra_bed: value, child_extra_bed: 0 } : prev);
                                }}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">유아</label>
                            <input
                                type="number"
                                value={formData.re_infant_count}
                                onChange={(e) => {
                                    const value = parseInt(e.target.value) || 0;
                                    setFormData(prev => ({ ...prev, re_infant_count: value }));
                                    setPackageDetail(prev => prev ? {
                                        ...prev,
                                        infant_free: value,
                                        infant_tour: 0,
                                        infant_extra_bed: 0,
                                        infant_seat: 0,
                                    } : prev);
                                }}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">총 금액 (동)</label>
                            <input
                                type="number"
                                value={formData.total_amount}
                                onChange={(e) => setFormData(prev => ({ ...prev, total_amount: parseInt(e.target.value) || 0 }))}
                                className="w-full px-3 py-2 border rounded-lg text-sm font-bold text-indigo-600"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">매니저 메모</label>
                            <textarea
                                value={formData.manager_note}
                                onChange={(e) => setFormData(prev => ({ ...prev, manager_note: e.target.value }))}
                                className="w-full px-3 py-2 border rounded-lg text-sm resize-none"
                                rows={5}
                                placeholder="매니저 전용 메모를 입력하세요..."
                            />
                        </div>
                    </div>
                </div>

                {/* 포함 서비스 (4개) */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <Package className="w-5 h-5 text-purple-500" />
                        포함 서비스 ({services.length}개)
                    </h3>

                    {services.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <Package className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                            <p>등록된 서비스가 없습니다.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {services.map((service, index) => (
                                <div key={index} className="border rounded-lg overflow-hidden">
                                    {/* 서비스 헤더 */}
                                    <div
                                        className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer hover:bg-gray-100"
                                        onClick={() => toggleServiceExpand(index)}
                                    >
                                        <div className="flex items-center gap-3">
                                            {getServiceIcon(service.type)}
                                            <span className="font-medium">{getServiceDisplayLabel(service)}</span>
                                            {service.type === 'tour' && service.data.request_note && (
                                                <span className="text-sm text-gray-500">
                                                    ({service.data.request_note.split('-').pop()?.trim() || ''})
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {getServiceDisplayDate(service) ? (
                                                <span className="text-sm text-gray-500">
                                                    {getServiceDisplayDate(service)}
                                                </span>
                                            ) : null}
                                            {service.isExpanded ? (
                                                <ChevronUp className="w-5 h-5 text-gray-400" />
                                            ) : (
                                                <ChevronDown className="w-5 h-5 text-gray-400" />
                                            )}
                                        </div>
                                    </div>

                                    {/* 서비스 폼 (펼침 시) */}
                                    {service.isExpanded && (
                                        <div className="p-4 border-t bg-white">
                                            {renderServiceForm(service, index)}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 저장 버튼 */}
                <div className="flex justify-end gap-3">
                    <button
                        onClick={() => router.push('/manager/reservation-edit?type=package')}
                        className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                        취소
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-8 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center gap-2 disabled:bg-purple-300"
                    >
                        {saving ? (
                            <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                저장 중...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                저장하기
                            </>
                        )}
                    </button>
                </div>
            </div>
        </ManagerLayout>
    );
}

export default function PackageReservationEditPage() {
    return (
        <Suspense fallback={
            <ManagerLayout title="📦 패키지 예약 수정" activeTab="reservation-edit">
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
                </div>
            </ManagerLayout>
        }>
            <PackageReservationEditContent />
        </Suspense>
    );
}
