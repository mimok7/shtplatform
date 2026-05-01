import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import supabase from '@/lib/supabase';

// 예약 목록 조회
export function useReservations(userId: string | undefined) {
    return useQuery({
        queryKey: ['reservations', userId],
        queryFn: async () => {
            if (!userId) return [];

            const { data, error } = await supabase
                .from('reservation')
                .select('re_id,re_type,re_status,re_created_at,re_quote_id')
                .eq('re_user_id', userId)
                .order('re_created_at', { ascending: false });

            if (error) throw error;
            return data;
        },
        enabled: !!userId,
        staleTime: 1000 * 60 * 5, // 5분 캐싱
        gcTime: 1000 * 60 * 30, // 30분 가비지 컬렉션
    });
}

// 예약 상세 조회
export function useReservationDetail(reservationId: string | undefined, userId: string | undefined) {
    return useQuery({
        queryKey: ['reservation', reservationId],
        queryFn: async () => {
            if (!reservationId || !userId) return null;

            const { data, error } = await supabase
                .from('reservation')
                .select('*')
                .eq('re_id', reservationId)
                .eq('re_user_id', userId)
                .maybeSingle();

            if (error) throw error;
            return data;
        },
        enabled: !!reservationId && !!userId,
    });
}

// 견적 목록 조회
export function useQuotes(userId: string | undefined) {
    return useQuery({
        queryKey: ['quotes', userId],
        queryFn: async () => {
            if (!userId) return [];

            const { data, error } = await supabase
                .from('quote')
                .select('id,title,status,created_at')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data;
        },
        enabled: !!userId,
        staleTime: 1000 * 60 * 5, // 5분 캐싱
        gcTime: 1000 * 60 * 30, // 30분 가비지 컬렉션
    });
}

// 가격 정보 조회 (캐싱 중요)
export function usePriceOptions(service: 'room' | 'car' | 'airport' | 'hotel' | 'tour' | 'rentcar') {
    const tableMap = {
        room: 'cruise_rate_card',
        car: 'rentcar_price',
        airport: 'airport_price',
        hotel: 'hotel_price',
        tour: 'tour_pricing',
        rentcar: 'rentcar_price'
    };

    const selectMap = {
        room: 'id,cruise_name,schedule_type,room_type,room_type_en,price_adult,price_child,price_child_extra_bed,price_infant,price_extra_bed,price_single,valid_year,valid_from,valid_to,season_name,is_active',
        car: 'id,cruise,vehicle_type,category,way_type,route,price,valid_from,valid_to',
        airport: 'id,airport_code,service_type,route,vehicle_type,price,valid_from,valid_to',
        hotel: 'id,hotel_name,room_type,room_name,base_price,checkin_day,checkout_day,valid_from,valid_to',
        tour: 'pricing_id,tour_id,min_guests,max_guests,price_per_person',
        rentcar: 'id,route,vehicle_type,way_type,price,capacity,valid_from,valid_to'
    };

    return useQuery({
        queryKey: ['price', service],
        queryFn: async () => {
            const { data, error } = await supabase
                .from(tableMap[service])
                .select(selectMap[service]);

            if (error) throw error;
            return data;
        },
        staleTime: 1000 * 60 * 10, // 10분 동안 캐싱
    });
}

// 예약 생성 mutation
export function useCreateReservation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (reservationData: any) => {
            const { data, error } = await supabase
                .from('reservation')
                .insert(reservationData)
                .select()
                .single();

            if (error) throw error;
            return data;
        },
        onSuccess: (data) => {
            // 예약 목록 캐시 무효화
            queryClient.invalidateQueries({ queryKey: ['reservations'] });
        },
    });
}

// 견적 생성 mutation
export function useCreateQuote() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (quoteData: any) => {
            if (quoteData?.user_id && (!quoteData?.status || quoteData.status === 'draft')) {
                const { data: existingDraft, error: existingDraftError } = await supabase
                    .from('quote')
                    .select('*')
                    .eq('user_id', quoteData.user_id)
                    .eq('status', 'draft')
                    .order('created_at', { ascending: false })
                    .maybeSingle();

                if (!existingDraftError && existingDraft) {
                    return existingDraft;
                }
            }

            const { data, error } = await supabase
                .from('quote')
                .insert(quoteData)
                .select()
                .single();

            if (error) {
                if (error.code === '23505' && quoteData?.user_id) {
                    const { data: latestDraft, error: latestDraftError } = await supabase
                        .from('quote')
                        .select('*')
                        .eq('user_id', quoteData.user_id)
                        .eq('status', 'draft')
                        .order('created_at', { ascending: false })
                        .maybeSingle();

                    if (!latestDraftError && latestDraft) {
                        return latestDraft;
                    }
                }
                throw error;
            }
            return data;
        },
        onSuccess: () => {
            // 견적 목록 캐시 무효화
            queryClient.invalidateQueries({ queryKey: ['quotes'] });
        },
    });
}

// 결제 수단 조회
export function usePaymentMethods() {
    return useQuery({
        queryKey: ['paymentMethods'],
        queryFn: async () => {
            const { data, error } = await supabase.from('payment_info').select('code,name').order('name');
            if (error) throw error;
            return ((data as any[]) || []).map(m => ({ code: m.code, name: m.name }));
        },
        staleTime: 1000 * 60 * 60, // 1 hour
    });
}

// 예약 목록의 추가 정보 조회 (견적, 크루즈 메타, 금액, 결제 상태)
export function useReservationAdditionalData(reservations: any[]) {
    return useQuery({
        queryKey: ['reservationAdditionalData', reservations.map(r => r.re_id).join(',')],
        queryFn: async () => {
            if (reservations.length === 0) {
                return {
                    quotesById: {},
                    cruiseMeta: {},
                    amountsByReservation: {},
                    paymentStatusByReservation: {}
                };
            }

            const reservationIds = reservations.map(r => r.re_id);
            const quoteIds = Array.from(new Set(reservations.map(r => r.re_quote_id).filter(Boolean))) as string[];
            const cruiseIds = reservations.filter(r => r.re_type === 'cruise').map(r => r.re_id);

            // 병렬 조회 (allSettled: 일부 쿼리 실패해도 나머지 데이터로 화면 렌더 유지)
            const settled = await Promise.allSettled([
                // 1. 견적 정보
                quoteIds.length > 0 ? supabase.from('quote').select('id,title,status').in('id', quoteIds) : Promise.resolve({ data: [] }),
                // 2. 크루즈 메타 (성인/아동/유아 상세 포함)
                cruiseIds.length > 0 ? supabase.from('reservation_cruise').select('reservation_id,checkin,guest_count,adult_count,child_count,infant_count').in('reservation_id', cruiseIds) : Promise.resolve({ data: [] }),
                // 3-8. 금액 정보
                supabase.from('reservation_cruise').select('reservation_id,room_total_price').in('reservation_id', reservationIds),
                supabase.from('reservation_cruise_car').select('reservation_id,car_total_price').in('reservation_id', reservationIds),
                supabase.from('reservation_airport').select('reservation_id,total_price').in('reservation_id', reservationIds),
                supabase.from('reservation_hotel').select('reservation_id,total_price').in('reservation_id', reservationIds),
                supabase.from('reservation_rentcar').select('reservation_id,total_price').in('reservation_id', reservationIds),
                supabase.from('reservation_tour').select('reservation_id,total_price').in('reservation_id', reservationIds),
                // 9. 결제 상태
                supabase.from('reservation_payment').select('reservation_id,payment_status,amount,payment_method,created_at').in('reservation_id', reservationIds)
            ]);

            const pick = (idx: number): { data: any[] } => {
                const r = settled[idx];
                if (r.status === 'fulfilled') {
                    const v: any = r.value;
                    return { data: (v?.data as any[]) || [] };
                }
                // 실패 로그만 남기고 빈 배열로 폴백
                // eslint-disable-next-line no-console
                console.warn('[useReservationAdditionalData] partial query failed:', r.reason);
                return { data: [] };
            };

            const quotesRes = pick(0);
            const cruiseMetaRes = pick(1);
            const cruisePriceRes = pick(2);
            const cruiseCarPriceRes = pick(3);
            const airportPriceRes = pick(4);
            const hotelPriceRes = pick(5);
            const rentPriceRes = pick(6);
            const tourPriceRes = pick(7);
            const paymentRes = pick(8);

            // 데이터 가공
            const quotesById: Record<string, any> = {};
            (quotesRes.data as any[] || []).forEach((q: any) => {
                quotesById[q.id] = { title: q.title ?? '제목 없음', status: q.status };
            });

            const cruiseMeta: Record<string, any> = {};
            (cruiseMetaRes.data as any[] || []).forEach((c: any) => {
                cruiseMeta[c.reservation_id] = {
                    checkin: c.checkin,
                    guest_count: c.guest_count,
                    adult_count: c.adult_count ?? 0,
                    child_count: c.child_count ?? 0,
                    infant_count: c.infant_count ?? 0,
                };
            });

            const amountsByReservation: Record<string, number> = {};
            const sumAmount = (rows: any[], key: string) => {
                rows.forEach(r => {
                    amountsByReservation[r.reservation_id] = (amountsByReservation[r.reservation_id] || 0) + Number(r[key] || 0);
                });
            };
            sumAmount(cruisePriceRes.data || [], 'room_total_price');
            sumAmount(cruiseCarPriceRes.data || [], 'car_total_price');
            sumAmount(airportPriceRes.data || [], 'total_price');
            sumAmount(hotelPriceRes.data || [], 'total_price');
            sumAmount(rentPriceRes.data || [], 'total_price');
            sumAmount(tourPriceRes.data || [], 'total_price');

            const paymentStatusByReservation: Record<string, any> = {};
            const payRows = paymentRes.data || [];
            reservations.forEach(r => {
                const payments = payRows.filter((p: any) => p.reservation_id === r.re_id);
                paymentStatusByReservation[r.re_id] = {
                    hasCompleted: payments.some((p: any) => p.payment_status === 'completed'),
                    payments
                };
            });

            return {
                quotesById,
                cruiseMeta,
                amountsByReservation,
                paymentStatusByReservation
            };
        },
        enabled: reservations.length > 0,
        staleTime: 1000 * 60 * 5 // 5 minutes
    });
}
