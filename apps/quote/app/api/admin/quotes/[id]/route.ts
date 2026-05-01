import { NextRequest, NextResponse } from 'next/server';
import supabase from '@/lib/supabase';

// 견적 삭제 API (CASCADE DELETE로 연결된 모든 데이터 삭제)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const quoteId = parseInt(id);

        if (isNaN(quoteId)) {
            return NextResponse.json(
                { error: '유효하지 않은 견적 ID입니다.' },
                { status: 400 }
            );
        }

        // 권한 검증
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json(
                { error: '인증이 필요합니다.' },
                { status: 401 }
            );
        }

        // 삭제 전 연결된 데이터 확인
        const { data: quoteData, error: quoteError } = await supabase
            .from('quote')
            .select('id, title, status')
            .eq('id', quoteId)
            .single();

        if (quoteError || !quoteData) {
            return NextResponse.json(
                { error: '견적을 찾을 수 없습니다.' },
                { status: 404 }
            );
        }

        // 연결된 데이터 개수 확인
        const [quoteItemsResult, reservationsResult] = await Promise.all([
            supabase
                .from('quote_item')
                .select('id, service_type')
                .eq('quote_id', quoteId),
            supabase
                .from('reservation')
                .select('re_id, re_type, re_status')
                .eq('re_quote_id', quoteId)
        ]);

        const quoteItemsCount = quoteItemsResult.data?.length || 0;
        const reservationsCount = reservationsResult.data?.length || 0;

        // CASCADE DELETE로 견적 삭제 (연결된 모든 데이터 자동 삭제)
        const { error: deleteError } = await supabase
            .from('quote')
            .delete()
            .eq('id', quoteId);

        if (deleteError) {
            console.error('견적 삭제 오류:', deleteError);
            return NextResponse.json(
                { error: '견적 삭제 중 오류가 발생했습니다: ' + deleteError.message },
                { status: 500 }
            );
        }

        // 삭제 성공 응답
        return NextResponse.json({
            success: true,
            message: '견적이 성공적으로 삭제되었습니다.',
            deletedData: {
                quote: quoteData,
                quoteItemsCount,
                reservationsCount
            }
        });

    } catch (error) {
        console.error('견적 삭제 API 오류:', error);
        return NextResponse.json(
            { error: '서버 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}

// 견적 삭제 전 연결된 데이터 확인 API
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const quoteId = parseInt(id);

        if (isNaN(quoteId)) {
            return NextResponse.json(
                { error: '유효하지 않은 견적 ID입니다.' },
                { status: 400 }
            );
        }

        // 견적 정보 조회
        const { data: quoteData, error: quoteError } = await supabase
            .from('quote')
            .select('id, title, status, created_at')
            .eq('id', quoteId)
            .single();

        if (quoteError || !quoteData) {
            return NextResponse.json(
                { error: '견적을 찾을 수 없습니다.' },
                { status: 404 }
            );
        }

        // 연결된 데이터 조회
        const [quoteItemsResult, reservationsResult] = await Promise.all([
            supabase
                .from('quote_item')
                .select('id, service_type, service_ref_id, quantity, unit_price, total_price')
                .eq('quote_id', quoteId),
            supabase
                .from('reservation')
                .select('re_id, re_type, re_status, re_created_at')
                .eq('re_quote_id', quoteId)
        ]);

        const quoteItems = quoteItemsResult.data || [];
        const reservations = reservationsResult.data || [];

        // 예약 세부 정보도 조회 (reservation_cruise 등)
        const reservationDetails = await Promise.all(
            reservations.map(async (reservation) => {
                let details = null;

                if (reservation.re_type === 'cruise') {
                    const { data: cruiseData } = await supabase
                        .from('reservation_cruise')
                        .select('*')
                        .eq('reservation_id', reservation.re_id)
                        .single();
                    details = cruiseData;
                }

                return {
                    ...reservation,
                    details
                };
            })
        );

        return NextResponse.json({
            quote: quoteData,
            relatedData: {
                quoteItems,
                reservations: reservationDetails,
                summary: {
                    quoteItemsCount: quoteItems.length,
                    reservationsCount: reservations.length,
                    serviceTypes: [...new Set(quoteItems.map(item => item.service_type))],
                    reservationTypes: [...new Set(reservations.map(res => res.re_type))],
                    reservationStatuses: [...new Set(reservations.map(res => res.re_status))]
                }
            }
        });

    } catch (error) {
        console.error('견적 관련 데이터 조회 API 오류:', error);
        return NextResponse.json(
            { error: '서버 오류가 발생했습니다.' },
            { status: 500 }
        );
    }
}
