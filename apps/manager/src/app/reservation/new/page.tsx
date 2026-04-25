'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import supabase from '@/lib/supabase';
import PageWrapper from '@/components/PageWrapper';
import SectionBox from '@/components/SectionBox';

interface ReservationForm {
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  emergency_contact: string;
  special_requests: string;
}

function NewReservationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quoteId = searchParams.get('quote_id'); // quote_id로 수정
  
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [reservationForm, setReservationForm] = useState<ReservationForm>({
    contact_name: '',
    contact_phone: '',
    contact_email: '',
    emergency_contact: '',
    special_requests: ''
  });

  useEffect(() => {
    console.log('🔍 [예약페이지] 초기화 시작');
    console.log('🔍 [예약페이지] 받은 quote_id:', quoteId);
    console.log('🔍 [예약페이지] searchParams 전체:', Object.fromEntries(searchParams.entries()));
    
    if (!quoteId) {
      console.error('❌ [예약페이지] 견적 ID가 없습니다!');
      alert('견적 ID가 필요합니다.');
      router.push('/mypage/quotes');
      return;
    }
    
    console.log('✅ [예약페이지] 견적 ID 확인됨, 데이터 로드 시작');
    checkAuthAndLoadData();
  }, [quoteId]);

  // 예약 시에만 사용자를 users 테이블에 등록
  const registerUserForReservation = async (authUser: any, additionalData: any) => {
    try {
      console.log('🔍 [예약] 사용자 등록 시작:', authUser.id);
      
      // 우선 사용자 등록을 시도 (이미 존재하면 무시)
      console.log('👤 사용자를 users 테이블에 등록/업데이트 합니다.');
      
      // 새 사용자 생성 (upsert 방식으로 중복 처리)
      const newUser = {
        id: authUser.id,
        email: authUser.email || '',
        name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || '사용자',
        role: 'member', // 기본값: member (고객)
        phone_number: authUser.user_metadata?.phone || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString() // updated_at 컬럼 복동
      };

      const { data: newUserData, error: insertError } = await supabase
        .from('users')
        .upsert(newUser, { onConflict: 'id' })
        .select()
        .single();

      if (insertError) {
        console.error('❌ 사용자 생성/업데이트 실패:', insertError);
        // 사용자 등록에 실패해도 예약 생성은 계속 진행
        console.warn('⚠️ 사용자 등록 실패, 예약만 생성합니다.');
        return null;
      }

      console.log('✅ 사용자 등록/업데이트 완료:', newUserData);
      setUser(newUserData);
      return newUserData;
    } catch (error) {
      console.error('❌ 사용자 등록 처리 실패:', error);
      // 사용자 등록 실패해도 예약은 진행
      return null;
    }
  };

  const checkAuthAndLoadData = async () => {
    try {
      // 1. 인증 확인 (Supabase 인증만, users 테이블 등록 없이)
      const { data: { user: authUser }, error: userError } = await supabase.auth.getUser();
      if (userError || !authUser) {
        alert('로그인이 필요합니다.');
        router.push('/login');
        return;
      }

      setUser(authUser);

      // 2. 견적 데이터 로드
      await loadQuoteDetail();
    } catch (error) {
      console.error('데이터 로드 오류:', error);
      setLoading(false);
    }
  };

  const loadQuoteDetail = async () => {
    try {
      console.log('🔍 [예약페이지] 견적 데이터 로드 시작, ID:', quoteId);
      
      // 견적 기본 정보만 조회 (users 테이블 조인 제거)
      const { data: quoteData, error: quoteError } = await supabase
        .from('quote')
        .select('*')
        .eq('id', quoteId)
        .single();

      console.log('🔍 [예약페이지] 견적 조회 결과:', { quoteData, quoteError });

      if (quoteError || !quoteData) {
        console.error('❌ [예약페이지] 견적 조회 실패:', quoteError);
        alert('견적을 찾을 수 없습니다.');
        router.push('/mypage/quotes');
        return;
      }

      console.log('✅ [예약페이지] 견적 데이터 로드 성공:', quoteData);

      // 승인된 견적인지 확인
      if (quoteData.status !== 'approved') {
        console.warn('⚠️ [예약페이지] 승인되지 않은 견적:', quoteData.status);
        alert('승인된 견적만 예약 가능합니다.');
        router.push(`/mypage/quotes/${quoteId}/view`);
        return;
      }

      setQuote(quoteData);

      // 연락처 정보 미리 채우기
      setReservationForm(prev => ({
        ...prev,
        contact_name: quoteData.users?.name || '',
        contact_email: quoteData.users?.email || '',
        contact_phone: quoteData.users?.phone_number || ''
      }));

    } catch (error) {
      console.error('견적 데이터 로드 오류:', error);
      alert('견적 데이터를 불러오는데 실패했습니다.');
      router.push('/mypage/quotes');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof ReservationForm, value: string) => {
    setReservationForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmitReservation = async () => {
    try {
      setSubmitting(true);

      // 필수 필드 검증
      if (!reservationForm.contact_name || !reservationForm.contact_phone) {
        alert('연락처 정보를 입력해주세요.');
        return;
      }

      // 예약 시점에 users 테이블에 사용자 등록
      const registeredUser = await registerUserForReservation(user, {
        name: reservationForm.contact_name,
        phone: reservationForm.contact_phone,
        email: reservationForm.contact_email
      });

      console.log('✅ [예약] 사용자 등록 완료:', registeredUser);

      // 예약 생성 (이제 users 테이블에 등록된 사용자로)
      const reservationData = {
        quote_id: quoteId,
        user_id: user.id, // 등록된 사용자 ID
        status: 'pending',
        contact_name: reservationForm.contact_name,
        contact_phone: reservationForm.contact_phone,
        contact_email: reservationForm.contact_email,
        emergency_contact: reservationForm.emergency_contact,
        special_requests: reservationForm.special_requests
      };

      console.log('🔍 예약 데이터 생성 시도:', reservationData);

      const { data: reservationResult, error: reservationError } = await supabase
        .from('reservation')
        .insert(reservationData)
        .select()
        .single();

      if (reservationError) throw reservationError;

      console.log('✅ 예약 생성 성공:', reservationResult);

      alert('예약이 성공적으로 생성되었습니다!');
      router.push(`/mypage/reservations`);
    } catch (error) {
      console.error('예약 생성 중 오류:', error);
      alert('예약 생성 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <PageWrapper>
        <SectionBox title="예약 생성">
          <div className="flex justify-center items-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
              <p className="mt-4 text-gray-600">견적 정보를 불러오는 중...</p>
            </div>
          </div>
        </SectionBox>
      </PageWrapper>
    );
  }

  if (!quote) {
    return (
      <PageWrapper>
        <SectionBox title="예약 생성">
          <div className="text-center py-12">
            <div className="text-4xl mb-4">❌</div>
            <p>견적을 찾을 수 없습니다.</p>
            <button 
              onClick={() => router.push('/mypage/quotes')}
              className="mt-4 bg-blue-500 text-white px-4 py-2 rounded"
            >
              견적 목록으로 돌아가기
            </button>
          </div>
        </SectionBox>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      {/* 견적 요약 */}
      <SectionBox title="예약 견적 요약">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-lg font-medium mb-3">견적 정보</h3>
            <div className="space-y-2">
              <p><span className="font-medium">견적 제목:</span> {quote.title || '견적서'}</p>
              <p><span className="font-medium">견적 ID:</span> {quote.id.slice(0, 8)}...</p>
              <p><span className="font-medium">상태:</span> 
                <span className="ml-2 px-2 py-1 rounded text-sm bg-green-100 text-green-800">
                  승인됨
                </span>
              </p>
            </div>
          </div>
          <div className="text-right">
            <h3 className="text-lg font-medium mb-3">총 견적 금액</h3>
            <p className="text-3xl font-bold text-blue-600">
              {quote.total_price?.toLocaleString() || 0}동
            </p>
          </div>
        </div>
      </SectionBox>

      {/* 연락처 정보 입력 */}
      <SectionBox title="예약자 정보">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              예약자 이름 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={reservationForm.contact_name}
              onChange={(e) => handleInputChange('contact_name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="예약자 이름을 입력하세요"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              연락처 <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={reservationForm.contact_phone}
              onChange={(e) => handleInputChange('contact_phone', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="휴대폰 번호를 입력하세요"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              이메일
            </label>
            <input
              type="email"
              value={reservationForm.contact_email}
              onChange={(e) => handleInputChange('contact_email', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="이메일 주소를 입력하세요"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              비상 연락처
            </label>
            <input
              type="tel"
              value={reservationForm.emergency_contact}
              onChange={(e) => handleInputChange('emergency_contact', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="비상 연락처를 입력하세요"
            />
          </div>
        </div>
        
        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            특별 요청사항
          </label>
          <textarea
            value={reservationForm.special_requests}
            onChange={(e) => handleInputChange('special_requests', e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="특별 요청사항이 있으시면 입력해주세요"
          />
        </div>
      </SectionBox>

      {/* 예약 접수 버튼 */}
      <SectionBox title="예약 접수">
        <div className="flex justify-between items-center">
          <button
            onClick={() => router.push(`/mypage/quotes/${quoteId}/view`)}
            className="bg-gray-500 text-white px-6 py-3 rounded-lg hover:bg-gray-600"
          >
            견적으로 돌아가기
          </button>
          
          <button
            onClick={handleSubmitReservation}
            className="bg-orange-500 text-white px-6 py-3 rounded-lg hover:bg-orange-600 disabled:opacity-50"
            disabled={submitting}
          >
            {submitting ? '처리중...' : '예약 접수'}
          </button>
        </div>
      </SectionBox>
    </PageWrapper>
  );
}

export default function NewReservationPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64">로딩 중...</div>}>
      <NewReservationContent />
    </Suspense>
  );
}

