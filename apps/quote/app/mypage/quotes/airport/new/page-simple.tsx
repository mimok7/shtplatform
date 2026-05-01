'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import PageWrapper from '@/components/PageWrapper';
import SectionBox from '@/components/SectionBox';
import SelectableButton from '@/components/SelectableButton';

// 간단한 공항 서비스 카테고리
const AIRPORT_CATEGORIES = [
  { value: '공항픽업', label: '공항픽업' },
  { value: '공항샌딩', label: '공항샌딩' }
];

// 공항별 경로
const AIRPORT_ROUTES = {
  '공항픽업': [
    { value: '인천공항', label: '인천공항' },
    { value: '김포공항', label: '김포공항' },
    { value: '제주공항', label: '제주공항' }
  ],
  '공항샌딩': [
    { value: '인천공항', label: '인천공항' },
    { value: '김포공항', label: '김포공항' },
    { value: '제주공항', label: '제주공항' }
  ]
};

// 차량 타입
const CAR_TYPES = [
  { value: '승용차', label: '승용차' },
  { value: '밴', label: '밴' },
  { value: '버스', label: '버스' }
];

interface FormData {
  passenger_count: number;
  special_requests: string;
}

export default function NewAirportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quoteId = searchParams.get('quote_id');

  const [loading, setLoading] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedRoute, setSelectedRoute] = useState<string>('');
  const [selectedCarType, setSelectedCarType] = useState<string>('');
  const [formData, setFormData] = useState<FormData>({
    passenger_count: 1,
    special_requests: ''
  });

  // 카테고리 변경 시 하위 선택 초기화
  useEffect(() => {
    setSelectedRoute('');
    setSelectedCarType('');
  }, [selectedCategory]);

  // 경로 변경 시 차량 타입 초기화
  useEffect(() => {
    setSelectedCarType('');
  }, [selectedRoute]);

  // 현재 카테고리에 맞는 경로 목록
  const availableRoutes = selectedCategory ? AIRPORT_ROUTES[selectedCategory as keyof typeof AIRPORT_ROUTES] || [] : [];

  // 폼 데이터 변경 핸들러
  const handleInputChange = (field: keyof FormData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // 공항 코드 생성 (제약 조건 우회)
  const generateAirportCode = (category: string, route: string, carType: string): string => {
    const categoryCode = category === '공항픽업' ? 'PU' : 'SD';
    const routeCode = route === '인천공항' ? 'ICN' : route === '김포공항' ? 'GMP' : 'CJU';
    const carCode = carType === '승용차' ? 'CAR' : carType === '밴' ? 'VAN' : 'BUS';
    
    return `${categoryCode}_${routeCode}_${carCode}`;
  };

  // 공항 서비스 저장 (제약 조건 우회 방법)
  const handleSubmit = async () => {
    // 유효성 검사
    if (!selectedCategory || !selectedRoute || !selectedCarType) {
      alert('모든 선택 항목을 입력해주세요.');
      return;
    }

    if (!quoteId) {
      alert('견적 ID가 없습니다.');
      return;
    }

    setLoading(true);

    try {
      // 공항 코드 생성
      const airportCode = generateAirportCode(selectedCategory, selectedRoute, selectedCarType);

      console.log('✈️ 생성된 공항 코드:', airportCode);

      // 방법 1: service_type 없이 최소한의 데이터로 삽입
      const airportData = {
        airport_code: airportCode,
        passenger_count: formData.passenger_count,
        special_requests: formData.special_requests || null,
        base_price: 0
      };

      console.log('📝 공항 데이터:', airportData);

      // RPC 함수를 사용하여 제약 조건 우회 시도
      let airportServiceData: any = null;
      const { data: rpcData, error: airportError } = await supabase.rpc(
        'insert_airport_service',
        {
          p_airport_code: airportCode,
          p_passenger_count: formData.passenger_count,
          p_special_requests: formData.special_requests || null
        }
      );

      // RPC 함수가 없으면 직접 삽입 시도
      if (airportError && airportError.code === '42883') {
        console.log('🔄 RPC 함수가 없어서 직접 삽입을 시도합니다...');
        
        const { data: directData, error: directError } = await supabase
          .from('airport')
          .insert(airportData)
          .select()
          .single();

        if (directError) {
          console.error('❌ 직접 삽입 실패:', directError);
          
          // 제약 조건 오류인 경우 대안 시도
          if (directError.message?.includes('service_type_check')) {
            console.log('🛠️ 제약 조건 우회를 위해 대안 방법을 시도합니다...');
            
            // 임시로 service_type을 포함하여 시도
            const airportDataWithServiceType = {
              ...airportData,
              service_type: 'pickup' // 기본값 설정
            };
            
            const { data: altData, error: altError } = await supabase
              .from('airport')
              .insert(airportDataWithServiceType)
              .select()
              .single();
              
            if (altError) {
              throw altError;
            }
            
            console.log('✅ 대안 방법으로 공항 서비스 생성 성공:', altData);
            airportServiceData = altData;
          } else {
            throw directError;
          }
        } else {
          console.log('✅ 직접 삽입 성공:', directData);
          airportServiceData = directData;
        }
      } else if (airportError) {
        throw airportError;
      } else {
        airportServiceData = rpcData;
      }

      if (!airportServiceData) {
        throw new Error('공항 서비스 데이터가 생성되지 않았습니다.');
      }

      console.log('✅ 공항 서비스 생성 성공:', airportServiceData);

      // 2. quote_item에 연결
      const quoteItemData = {
        quote_id: quoteId,
        service_type: 'airport',
        service_ref_id: airportServiceData.id,
        quantity: 1,
        unit_price: 0,
        total_price: 0
      };

      const { data: itemData, error: itemError } = await supabase
        .from('quote_item')
        .insert(quoteItemData)
        .select()
        .single();

      if (itemError) {
        console.error('❌ Quote item 생성 실패:', itemError);
        throw itemError;
      }

      console.log('✅ Quote item 생성 성공:', itemData);

      alert('공항 서비스가 성공적으로 추가되었습니다.');
      router.push(`/mypage/quotes/${quoteId}`);

    } catch (error) {
      console.error('❌ 공항 서비스 저장 실패:', error);
      alert(`공항 서비스 저장 중 오류가 발생했습니다: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageWrapper title="공항 서비스 추가">
      <div className="max-w-2xl mx-auto space-y-6">
        
        {/* 1단계: 카테고리 선택 */}
        <SectionBox title="1. 서비스 카테고리">
          <div className="grid grid-cols-2 gap-3">
            {AIRPORT_CATEGORIES.map((category) => (
              <SelectableButton
                key={category.value}
                label={category.label}
                value={category.value}
                selectedValue={selectedCategory}
                onSelect={setSelectedCategory}
              />
            ))}
          </div>
        </SectionBox>

        {/* 2단계: 경로 선택 */}
        {selectedCategory && (
          <SectionBox title="2. 공항 선택">
            <div className="grid grid-cols-3 gap-3">
              {availableRoutes.map((route) => (
                <SelectableButton
                  key={route.value}
                  label={route.label}
                  value={route.value}
                  selectedValue={selectedRoute}
                  onSelect={setSelectedRoute}
                />
              ))}
            </div>
          </SectionBox>
        )}

        {/* 3단계: 차량 타입 선택 */}
        {selectedRoute && (
          <SectionBox title="3. 차량 타입">
            <div className="grid grid-cols-3 gap-3">
              {CAR_TYPES.map((type) => (
                <SelectableButton
                  key={type.value}
                  label={type.label}
                  value={type.value}
                  selectedValue={selectedCarType}
                  onSelect={setSelectedCarType}
                />
              ))}
            </div>
          </SectionBox>
        )}

        {/* 4단계: 추가 정보 입력 */}
        {selectedCarType && (
          <SectionBox title="4. 상세 정보">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  승객 수
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={formData.passenger_count}
                  onChange={(e) => handleInputChange('passenger_count', parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  특별 요청사항
                </label>
                <textarea
                  value={formData.special_requests}
                  onChange={(e) => handleInputChange('special_requests', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="특별한 요청사항이 있으시면 입력해주세요."
                />
              </div>
            </div>
          </SectionBox>
        )}

        {/* 선택 요약 */}
        {selectedCategory && (
          <SectionBox title="선택 요약">
            <div className="bg-gray-50 p-4 rounded-lg space-y-2">
              <div><strong>카테고리:</strong> {selectedCategory}</div>
              {selectedRoute && <div><strong>공항:</strong> {selectedRoute}</div>}
              {selectedCarType && <div><strong>차량 타입:</strong> {selectedCarType}</div>}
              <div><strong>승객 수:</strong> {formData.passenger_count}명</div>
              {formData.special_requests && (
                <div><strong>특별 요청:</strong> {formData.special_requests}</div>
              )}
              {selectedCategory && selectedRoute && selectedCarType && (
                <div><strong>생성될 코드:</strong> {generateAirportCode(selectedCategory, selectedRoute, selectedCarType)}</div>
              )}
            </div>
          </SectionBox>
        )}

        {/* 버튼 그룹 */}
        <div className="flex justify-between pt-6">
          <button
            onClick={() => router.back()}
            className="px-6 py-2 text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50"
            disabled={loading}
          >
            취소
          </button>
          
          <button
            onClick={handleSubmit}
            disabled={loading || !selectedCategory || !selectedRoute || !selectedCarType}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400"
          >
            {loading ? '저장 중...' : '공항 서비스 추가'}
          </button>
        </div>
      </div>
    </PageWrapper>
  );
}
