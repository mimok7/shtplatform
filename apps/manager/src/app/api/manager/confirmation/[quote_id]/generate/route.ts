import { NextRequest, NextResponse } from 'next/server';
import supabase from '@/lib/supabase';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ quote_id: string }> }
) {
    try {
        const { quote_id } = await params;
        const { reservationId, quoteId, autoGenerate } = await request.json();

        console.log('확인서 생성 요청:', { reservationId, quoteId, autoGenerate });

        // 1. 예약 데이터 조회
        const { data: reservationData, error: reservationError } = await supabase
            .from('reservation')
            .select('*')
            .eq('re_id', reservationId)
            .single();

        if (reservationError || !reservationData) {
            return NextResponse.json(
                { error: '예약 데이터를 찾을 수 없습니다.' },
                { status: 404 }
            );
        }

        // 2. 견적 데이터 조회 — id 우선 조회. 폴백은 안전하게 처리
        let quoteData: any = null;
        const { data: qById, error: errById } = await supabase.from('quote').select('*').eq('id', quoteId).single();
        if (!errById && qById) {
            quoteData = qById;
        } else {
            try {
                const { data: q2, error: e2 } = await supabase.from('quote').select('*').eq('quote_id', quoteId).single();
                if (e2 || !q2) {
                    return NextResponse.json({ error: '견적 데이터를 찾을 수 없습니다.' }, { status: 404 });
                }
                quoteData = q2;
            } catch (e) {
                console.warn('quote lookup by quote_id threw, likely column missing:', e);
                return NextResponse.json({ error: '견적 데이터를 찾을 수 없습니다.' }, { status: 404 });
            }
        }

        // 3. 사용자 데이터 조회
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('id', reservationData.re_user_id)
            .single();

        if (userError || !userData) {
            return NextResponse.json(
                { error: '사용자 데이터를 찾을 수 없습니다.' },
                { status: 404 }
            );
        }

        // 4. 모든 서비스 데이터 조회
        const services = [];

        // 크루즈 서비스
        const { data: cruiseData } = await supabase
            .from('reservation_cruise')
            .select('*')
            .eq('reservation_id', reservationId);
        if (cruiseData && cruiseData.length > 0) {
            services.push({ type: 'cruise', name: '크루즈', data: cruiseData });
        }

        // 공항 서비스
        const { data: airportData } = await supabase
            .from('reservation_airport')
            .select('*')
            .eq('reservation_id', reservationId);
        if (airportData && airportData.length > 0) {
            services.push({ type: 'airport', name: '공항', data: airportData });
        }

        // 호텔 서비스
        const { data: hotelData } = await supabase
            .from('reservation_hotel')
            .select('*')
            .eq('reservation_id', reservationId);
        if (hotelData && hotelData.length > 0) {
            services.push({ type: 'hotel', name: '호텔', data: hotelData });
        }

        // 렌터카 서비스
        const { data: rentcarData } = await supabase
            .from('reservation_rentcar')
            .select('*')
            .eq('reservation_id', reservationId);
        if (rentcarData && rentcarData.length > 0) {
            services.push({ type: 'rentcar', name: '렌터카', data: rentcarData });
        }

        // 투어 서비스
        const { data: tourData } = await supabase
            .from('reservation_tour')
            .select('*')
            .eq('reservation_id', reservationId);
        if (tourData && tourData.length > 0) {
            services.push({ type: 'tour', name: '투어', data: tourData });
        }

        // 차량 서비스
        const { data: carShtData } = await supabase
            .from('reservation_car_sht')
            .select('*')
            .eq('reservation_id', reservationId);
        if (carShtData && carShtData.length > 0) {
            services.push({ type: 'car_sht', name: '차량', data: carShtData });
        }

        // 5. 결제 정보 조회
        const { data: paymentData } = await supabase
            .from('reservation_payment')
            .select('*')
            .eq('reservation_id', reservationId)
            .eq('payment_status', 'completed')
            .single();

        // 6. 확인서 데이터 구성
        const confirmationData = {
            reservationId,
            quoteId,
            quoteTitle: quoteData.title,
            customer: {
                name: userData.name,
                email: userData.email,
                phone: userData.phone_number,
            },
            reservation: reservationData,
            services,
            payment: paymentData,
            generatedAt: new Date().toISOString(),
            status: 'generated'
        };

        // 7. 확인서 생성 완료 로그 (실제로는 확인서 테이블에 저장)
        console.log('확인서 생성 완료:', {
            reservationId,
            quoteTitle: quoteData.title,
            customerName: userData.name,
            servicesCount: services.length,
            totalAmount: paymentData?.amount
        });

        // 8. 확인서 상태 업데이트
        if (autoGenerate) {
            // confirmation_status 테이블에 상태 업데이트
            const { error: updateError } = await supabase
                .from('confirmation_status')
                .upsert({
                    reservation_id: reservationId,
                    quote_id: quoteId,
                    status: 'generated',
                    generated_at: new Date().toISOString()
                }, {
                    onConflict: 'reservation_id'
                });

            if (updateError) {
                console.error('확인서 상태 업데이트 실패:', updateError);
            } else {
                console.log('확인서 상태를 "generated"로 업데이트 완료');
            }
        }

        return NextResponse.json({
            success: true,
            message: '확인서가 성공적으로 생성되었습니다.',
            data: confirmationData
        });

    } catch (error) {
        console.error('확인서 생성 실패:', error);
        return NextResponse.json(
            { error: '확인서 생성 중 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}
