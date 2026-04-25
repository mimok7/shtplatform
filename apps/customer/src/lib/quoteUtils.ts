import supabase from './supabase';
import {
  Quote,
  QuoteItem,
  QuoteWithItems,
  ServiceType,
  ServiceData,
  CruiseFormData,
  AirportFormData,
  HotelFormData,
  TourFormData,
  RentcarFormData
} from './types';

// 새 견적 생성
export async function createQuote(userId: string, title?: string): Promise<Quote | null> {
  try {
    const { data: existingDraft, error: existingDraftError } = await supabase
      .from('quote')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (!existingDraftError && existingDraft) {
      return existingDraft;
    }

    const { data, error } = await supabase
      .from('quote')
      .insert({
        user_id: userId,
        title: title || '새 견적',
        status: 'draft'
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        const { data: latestDraft, error: latestDraftError } = await supabase
          .from('quote')
          .select('*')
          .eq('user_id', userId)
          .eq('status', 'draft')
          .order('created_at', { ascending: false })
          .maybeSingle();

        if (!latestDraftError && latestDraft) {
          return latestDraft;
        }
      }
      console.error('견적 생성 오류:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('견적 생성 중 오류:', error);
    return null;
  }
}

// 서비스별 데이터 조회 (406 오류 해결)
export async function getServiceData(serviceType: ServiceType, serviceId: string) {
  try {
    // 표준 인증 체크 패턴
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('인증이 필요합니다.');
    }

    let data = null;
    let error = null;

    switch (serviceType) {
      case 'cruise':
        const { data: cruiseData, error: cruiseError } = await supabase
          .from('cruise')
          .select('*')
          .eq('id', serviceId)
          .maybeSingle(); // single() 대신 maybeSingle() 사용
        data = cruiseData;
        error = cruiseError;
        break;

      case 'airport':
        const { data: airportData, error: airportError } = await supabase
          .from('airport')
          .select('*')
          .eq('id', serviceId)
          .maybeSingle();
        data = airportData;
        error = airportError;
        break;

      case 'hotel':
        const { data: hotelData, error: hotelError } = await supabase
          .from('hotel')
          .select('*')
          .eq('id', serviceId)
          .maybeSingle();
        data = hotelData;
        error = hotelError;
        break;

      case 'tour':
        const { data: tourData, error: tourError } = await supabase
          .from('tour')
          .select('*')
          .eq('id', serviceId)
          .maybeSingle();
        data = tourData;
        error = tourError;
        break;

      case 'rentcar':
        const { data: rentcarData, error: rentcarError } = await supabase
          .from('rentcar')
          .select('*')
          .eq('id', serviceId)
          .maybeSingle();
        data = rentcarData;
        error = rentcarError;
        break;

      default:
        throw new Error(`지원하지 않는 서비스 타입: ${serviceType}`);
    }

    if (error) {
      console.error(`⚠️ ${serviceType} 서비스 조회 오류:`, error);
      return null; // 오류 시 null 반환 (앱 중단 방지)
    }

    return data;
  } catch (error) {
    console.error(`${serviceType} 서비스 조회 실패:`, error);
    return null;
  }
}

// 견적과 아이템 조회 (계층적 견적 모델 패턴)
export async function getQuoteWithItems(quoteId: string): Promise<QuoteWithItems | null> {
  try {
    // 표준 인증 체크 패턴
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('인증이 필요합니다.');
    }

    // 견적 기본 정보만 조회 (id, title만)
    const { data: quote, error: quoteError } = await supabase
      .from('quote')
      .select('id, title')
      .eq('id', quoteId)
      .eq('user_id', user.id)
      .single();

    if (quoteError) {
      console.error('견적 조회 실패:', quoteError);
      return null;
    }

    if (!quote) {
      return null;
    }

    // 간단한 견적 정보만 반환
    return {
      id: quote.id,
      title: quote.title,
      user_id: user.id,
      status: 'approved',
      total_price: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      items: []
    };
  } catch (error) {
    console.error('견적 조회 중 오류:', error);
    return null;
  }
}

// 사용자의 모든 견적 조회
export async function getUserQuotes(userId: string): Promise<Quote[]> {
  try {
    const { data, error } = await supabase
      .from('quote')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('사용자 견적 조회 오류:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('사용자 견적 조회 중 오류:', error);
    return [];
  }
}

// 크루즈 서비스 생성 및 견적 아이템 추가
export async function addCruiseToQuote(quoteId: string, formData: CruiseFormData): Promise<QuoteItem | null> {
  try {
    console.log('🔍 addCruiseToQuote 시작:', { quoteId, formData });

    // 크루즈 서비스 생성
    const { data: cruiseData, error: cruiseError } = await supabase
      .from('cruise')
      .insert({
        ...formData,
        base_price: 0 // 가격은 별도 계산 로직으로
      })
      .select()
      .single();

    if (cruiseError) {
      console.error('❌ 크루즈 서비스 생성 오류:', cruiseError);
      console.error('   - 메시지:', cruiseError.message);
      console.error('   - 코드:', cruiseError.code);
      console.error('   - 세부사항:', cruiseError.details);
      console.error('   - 힌트:', cruiseError.hint);
      return null;
    }

    if (!cruiseData) {
      console.error('❌ 크루즈 서비스 생성 실패 - 데이터 없음');
      return null;
    }

    console.log('✅ 크루즈 서비스 생성 성공:', cruiseData);

    // 견적 아이템 생성
    const { data: itemData, error: itemError } = await supabase
      .from('quote_item')
      .insert({
        quote_id: quoteId,
        service_type: 'cruise',
        service_ref_id: cruiseData.id,
        quantity: 1,
        unit_price: cruiseData.base_price,
        total_price: cruiseData.base_price
      })
      .select()
      .single();

    if (itemError) {
      console.error('❌ 견적 아이템 생성 오류:', itemError);
      return null;
    }

    if (!itemData) {
      console.error('❌ 견적 아이템 생성 실패 - 데이터 없음');
      return null;
    }

    console.log('✅ 견적 아이템 생성 성공:', itemData);

    await updateQuoteTotalPrice(quoteId);
    return itemData;
  } catch (error) {
    console.error('❌ addCruiseToQuote 전체 오류:', error);
    return null;
  }
}

// 공항 서비스 생성 및 견적 아이템 추가
export async function addAirportToQuote(quoteId: string, formData: AirportFormData): Promise<QuoteItem | null> {
  try {
    const { data: airportData, error: airportError } = await supabase
      .from('airport')
      .insert({
        ...formData,
        base_price: 0
      })
      .select()
      .single();

    if (airportError || !airportData) {
      console.error('공항 서비스 생성 오류:', airportError);
      return null;
    }

    const { data: itemData, error: itemError } = await supabase
      .from('quote_item')
      .insert({
        quote_id: quoteId,
        service_type: 'airport',
        service_ref_id: airportData.id,
        quantity: 1,
        unit_price: airportData.base_price,
        total_price: airportData.base_price
      })
      .select()
      .single();

    if (itemError || !itemData) {
      console.error('견적 아이템 생성 오류:', itemError);
      return null;
    }

    await updateQuoteTotalPrice(quoteId);
    return itemData;
  } catch (error) {
    console.error('공항 견적 추가 중 오류:', error);
    return null;
  }
}

// 호텔 서비스 생성 및 견적 아이템 추가
export async function addHotelToQuote(quoteId: string, formData: HotelFormData): Promise<QuoteItem | null> {
  try {
    const { data: hotelData, error: hotelError } = await supabase
      .from('hotel')
      .insert({
        ...formData,
        base_price: 0
      })
      .select()
      .single();

    if (hotelError || !hotelData) {
      console.error('호텔 서비스 생성 오류:', hotelError);
      return null;
    }

    const { data: itemData, error: itemError } = await supabase
      .from('quote_item')
      .insert({
        quote_id: quoteId,
        service_type: 'hotel',
        service_ref_id: hotelData.id,
        quantity: 1,
        unit_price: hotelData.base_price,
        total_price: hotelData.base_price
      })
      .select()
      .single();

    if (itemError || !itemData) {
      console.error('견적 아이템 생성 오류:', itemError);
      return null;
    }

    await updateQuoteTotalPrice(quoteId);
    return itemData;
  } catch (error) {
    console.error('호텔 견적 추가 중 오류:', error);
    return null;
  }
}

// 투어 서비스 생성 및 견적 아이템 추가
export async function addTourToQuote(quoteId: string, formData: TourFormData): Promise<QuoteItem | null> {
  try {
    const { data: tourData, error: tourError } = await supabase
      .from('tour')
      .insert({
        ...formData,
        base_price: 0
      })
      .select()
      .single();

    if (tourError || !tourData) {
      console.error('투어 서비스 생성 오류:', tourError);
      return null;
    }

    const { data: itemData, error: itemError } = await supabase
      .from('quote_item')
      .insert({
        quote_id: quoteId,
        service_type: 'tour',
        service_ref_id: tourData.id,
        quantity: 1,
        unit_price: tourData.base_price,
        total_price: tourData.base_price
      })
      .select()
      .single();

    if (itemError || !itemData) {
      console.error('견적 아이템 생성 오류:', itemError);
      return null;
    }

    await updateQuoteTotalPrice(quoteId);
    return itemData;
  } catch (error) {
    console.error('투어 견적 추가 중 오류:', error);
    return null;
  }
}

// 렌트카 서비스 생성 및 견적 아이템 추가
export async function addRentcarToQuote(quoteId: string, formData: RentcarFormData): Promise<QuoteItem | null> {
  try {
    const { data: rentcarData, error: rentcarError } = await supabase
      .from('rentcar')
      .insert({
        ...formData,
        base_price: 0
      })
      .select()
      .single();

    if (rentcarError || !rentcarData) {
      console.error('렌트카 서비스 생성 오류:', rentcarError);
      return null;
    }

    const { data: itemData, error: itemError } = await supabase
      .from('quote_item')
      .insert({
        quote_id: quoteId,
        service_type: 'rentcar',
        service_ref_id: rentcarData.id,
        quantity: 1,
        unit_price: rentcarData.base_price,
        total_price: rentcarData.base_price
      })
      .select()
      .single();

    if (itemError || !itemData) {
      console.error('견적 아이템 생성 오류:', itemError);
      return null;
    }

    await updateQuoteTotalPrice(quoteId);
    return itemData;
  } catch (error) {
    console.error('렌트카 견적 추가 중 오류:', error);
    return null;
  }
}

// 견적 총 가격 업데이트
export async function updateQuoteTotalPrice(quoteId: string): Promise<void> {
  try {
    const { data: items, error } = await supabase
      .from('quote_item')
      .select('total_price')
      .eq('quote_id', quoteId);

    if (error) {
      console.error('견적 아이템 조회 오류:', error);
      return;
    }

    const totalPrice = (items || []).reduce((sum: number, item: any) => sum + (item.total_price || 0), 0);

    await supabase
      .from('quote')
      .update({ total_price: totalPrice })
      .eq('id', quoteId);
  } catch (error) {
    console.error('견적 총 가격 업데이트 중 오류:', error);
  }
}

// 견적 아이템 삭제
export async function removeQuoteItem(itemId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('quote_item')
      .delete()
      .eq('id', itemId);

    if (error) {
      console.error('견적 아이템 삭제 오류:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('견적 아이템 삭제 중 오류:', error);
    return false;
  }
}

// 견적 상태 업데이트
export async function updateQuoteStatus(quoteId: string, status: Quote['status']): Promise<boolean> {
  try {
    const updateData: any = { status };

    if (status === 'submitted') {
      updateData.submitted_at = new Date().toISOString();
    } else if (status === 'approved') {
      updateData.approved_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('quote')
      .update(updateData)
      .eq('id', quoteId);

    if (error) {
      console.error('견적 상태 업데이트 오류:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('견적 상태 업데이트 중 오류:', error);
    return false;
  }
}

// 견적에 서비스 추가
export async function addServiceToQuote(
  quoteId: string,
  serviceType: ServiceType,
  formData: CruiseFormData | AirportFormData | HotelFormData | TourFormData | RentcarFormData,
  usageDate?: string
): Promise<boolean> {
  try {
    console.log('addServiceToQuote 시작:', { quoteId, serviceType, formData, usageDate });

    // 1. 서비스 데이터를 해당 테이블에 저장
    let serviceRefId: string | null = null;
    let serviceUsageDate: string | null = usageDate || null;

    switch (serviceType) {
      case 'cruise':
        const cruiseData = formData as CruiseFormData;
        console.log('크루즈 데이터 저장 시도:', cruiseData);
        // 크루즈는 departure_date를 사용일자로 사용
        serviceUsageDate = serviceUsageDate || cruiseData.departure_date;
        const { data: cruise, error: cruiseError } = await supabase
          .from('cruise')
          .insert({
            cruise_name: cruiseData.cruise_name,
            departure_date: cruiseData.departure_date,
            return_date: cruiseData.return_date,
            departure_port: cruiseData.departure_port,
            room_type: cruiseData.room_type,
            adult_count: cruiseData.adult_count,
            child_count: cruiseData.child_count,
            infant_count: cruiseData.infant_count,
            special_requests: cruiseData.special_requests,
            base_price: 0
          })
          .select()
          .single();

        if (cruiseError || !cruise) {
          console.error('크루즈 서비스 저장 오류:', cruiseError);
          return false;
        }
        console.log('크루즈 서비스 저장 성공:', cruise);
        serviceRefId = cruise.id;
        break;

      case 'airport':
        const airportData = formData as AirportFormData;
        console.log('공항 데이터 저장 시도:', airportData);
        // 공항은 arrival_date 또는 departure_date를 사용일자로 사용
        serviceUsageDate = serviceUsageDate || (airportData.arrival_date || airportData.departure_date || null);
        const { data: airport, error: airportError } = await supabase
          .from('airport')
          .insert({
            service_type: airportData.service_type,
            flight_number: airportData.flight_number,
            arrival_date: airportData.arrival_date,
            departure_date: airportData.departure_date,
            pickup_location: airportData.pickup_location,
            dropoff_location: airportData.dropoff_location,
            passenger_count: airportData.passenger_count,
            vehicle_type: airportData.vehicle_type,
            special_requests: airportData.special_requests,
            base_price: 0
          })
          .select()
          .single();

        if (airportError || !airport) {
          console.error('공항 서비스 저장 오류:', airportError);
          console.error('공항 서비스 저장 상세 오류:', JSON.stringify(airportError, null, 2));
          return false;
        }
        console.log('공항 서비스 저장 성공:', airport);
        serviceRefId = airport.id;
        break;

      case 'hotel':
        const hotelData = formData as HotelFormData;
        // 호텔은 check_in_date를 사용일자로 사용
        serviceUsageDate = serviceUsageDate || hotelData.check_in_date;
        const { data: hotel, error: hotelError } = await supabase
          .from('hotel')
          .insert({
            hotel_name: hotelData.hotel_name,
            check_in_date: hotelData.check_in_date,
            check_out_date: hotelData.check_out_date,
            room_type: hotelData.room_type,
            room_count: hotelData.room_count,
            adult_count: hotelData.adult_count,
            child_count: hotelData.child_count,
            special_requests: hotelData.special_requests,
            base_price: 0
          })
          .select()
          .single();

        if (hotelError || !hotel) {
          console.error('호텔 서비스 저장 오류:', hotelError);
          return false;
        }
        serviceRefId = hotel.id;
        break;

      case 'tour':
        const tourData = formData as TourFormData;
        // 투어는 tour_date를 사용일자로 사용
        serviceUsageDate = serviceUsageDate || tourData.tour_date;
        const { data: tour, error: tourError } = await supabase
          .from('tour')
          .insert({
            tour_name: tourData.tour_name,
            tour_date: tourData.tour_date,
            duration_hours: tourData.duration_hours,
            participant_count: tourData.participant_count,
            pickup_location: tourData.pickup_location,
            tour_type: tourData.tour_type,
            language: tourData.language,
            special_requests: tourData.special_requests,
            base_price: 0
          })
          .select()
          .single();

        if (tourError || !tour) {
          console.error('투어 서비스 저장 오류:', tourError);
          return false;
        }
        serviceRefId = tour.id;
        break;

      case 'rentcar':
        const rentcarData = formData as RentcarFormData;
        // 렌트카는 pickup_date를 사용일자로 사용
        serviceUsageDate = serviceUsageDate || rentcarData.pickup_date;
        const { data: rentcar, error: rentcarError } = await supabase
          .from('rentcar')
          .insert({
            car_model: rentcarData.car_model,
            pickup_date: rentcarData.pickup_date,
            return_date: rentcarData.return_date,
            pickup_location: rentcarData.pickup_location,
            return_location: rentcarData.return_location,
            driver_age: rentcarData.driver_age,
            has_driver: rentcarData.has_driver,
            insurance_type: rentcarData.insurance_type,
            special_requests: rentcarData.special_requests,
            base_price: 0
          })
          .select()
          .single();

        if (rentcarError || !rentcar) {
          console.error('렌트카 서비스 저장 오류:', rentcarError);
          return false;
        }
        serviceRefId = rentcar.id;
        break;

      default:
        console.error('지원하지 않는 서비스 타입:', serviceType);
        return false;
    }

    if (!serviceRefId) {
      console.error('서비스 ID를 가져올 수 없습니다.');
      return false;
    }

    // 2. quote_item에 연결 정보 저장
    console.log('quote_item 저장 시도:', { quote_id: quoteId, service_type: serviceType, service_ref_id: serviceRefId });
    const { data: quoteItem, error: itemError } = await supabase
      .from('quote_item')
      .insert({
        quote_id: quoteId,
        service_type: serviceType,
        service_ref_id: serviceRefId,
        quantity: 1,
        unit_price: 0,
        total_price: 0,
        usage_date: serviceUsageDate // 서비스별 사용일자 추가
      })
      .select()
      .single();

    if (itemError) {
      console.error('견적 아이템 저장 오류:', itemError);
      console.error('견적 아이템 저장 상세 오류:', JSON.stringify(itemError, null, 2));
      return false;
    }

    console.log('견적 아이템 저장 성공:', quoteItem);
    console.log('addServiceToQuote 완료 - 성공');
    return true;
  } catch (error) {
    console.error('서비스 추가 중 오류:', error);
    return false;
  }
}
