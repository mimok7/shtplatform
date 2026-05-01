'use client';

import React, { useState, useEffect } from 'react';
import { useCruiseStore } from '@/lib/useCruiseStore';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';

export default function VehiclePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // 전역 상태에서 schedule_code, cruise_code 가져오기
  const { schedule_code, cruise_code } = useCruiseStore();
  // 폼 데이터
  const [form, setForm] = useState({
    schedule_code: schedule_code || '',
    cruise_code: cruise_code || '',
    vehicle_category_code: '',
    vehicle_code: '',
    passenger_count: 1,
    discount_rate: 0
  });

  // 옵션 데이터
  const [schedules, setSchedules] = useState<any[]>([]);
  const [cruises, setCruises] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  // 사용자 인증 체크
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }: any) => {
      if (!user) {
        alert('로그인이 필요합니다.');
        router.push('/login');
      } else {
        setUser(user);
        loadBasicData();
      }
    });
  }, [router]);

  // 기본 데이터 로드
  const loadBasicData = async () => {
    try {
      const [scheduleRes, categoryRes] = await Promise.all([
        supabase.from('schedule_info').select('*'),
        supabase.from('category_info').select('*')
      ]);

      setSchedules(scheduleRes.data || []);
      setCategories(categoryRes.data?.filter((c: any) => ['왕복', '편도', '기본'].includes(c.name)) || []);
    } catch (error) {
      console.error('기본 데이터 로드 실패:', error);
    }
  };

  // 크루즈 옵션 로드
  useEffect(() => {
    const fetchCruiseOptions = async () => {
      if (!form.schedule_code) return;

      const { data: cruiseList } = await supabase
        .from('cruise_info')
        .select('code, name');
      setCruises(cruiseList || []);
    };

    fetchCruiseOptions();
  }, [form.schedule_code]);

  // 차량 옵션 로드 (전역 상태와 차량구분으로 필터링)
  useEffect(() => {
    const fetchVehicleOptions = async () => {
      if (schedule_code && cruise_code && form.vehicle_category_code) {
        const category = categories.find(c => c.name === form.vehicle_category_code);
        if (!category) return;

        const { data: carPrices } = await supabase
          .from('rentcar_price')
          .select('rent_code')
          .eq('schedule_code', schedule_code)
          .eq('cruise_code', cruise_code)
          .eq('category_code', category.code);

        const carCodes = [...new Set(carPrices?.map((v: any) => v.rent_code))];
        if (carCodes.length > 0) {
          const { data: carInfo } = await supabase
            .from('car_info')
            .select('code, name')
            .in('code', carCodes);
          setVehicles(carInfo || []);
        } else {
          setVehicles([]);
        }
      } else {
        setVehicles([]);
      }
    };
    fetchVehicleOptions();
  }, [schedule_code, cruise_code, form.vehicle_category_code, categories]);

  // 폼 제출
  const handleSubmit = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { error } = await supabase.from('quote_car').insert({
        ...form,
        user_id: user.id
      });

      if (error) {
        alert('저장 실패: ' + error.message);
      } else {
        alert('차량 견적이 저장되었습니다!');
        // 견적 목록으로 이동
        router.push('/mypage/quotes');
      }
    } catch (error) {
      console.error('견적 저장 오류:', error);
      alert('견적 저장 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 그라데이션 헤더 */}
      <div className="bg-gradient-to-r from-green-600 via-teal-600 to-green-800 text-white">
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">🚐 크루즈 차량 예약</h1>
            <button
              onClick={() => router.push('/mypage/quotes/new')}
              className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors"
            >
              🏠 홈으로
            </button>
          </div>

          <div className="bg-white/10 backdrop-blur rounded-lg p-6">
            <p className="text-lg opacity-90">편리한 차량 서비스를 예약해보세요.</p>
            <p className="text-sm opacity-75 mt-2">크루즈 선착장까지 안전하고 편안한 차량을 제공합니다.</p>
          </div>
        </div>
      </div>

      {/* 입력 폼 영역 */}
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-lg p-6 space-y-6">


          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">🚐 차량 구분</label>
            <div className="grid grid-cols-3 gap-2">
              {[...categories.reduce((acc, cur) => acc.set(cur.name, cur), new Map()).values()].map(c => (
                <button
                  key={c.code}
                  onClick={() => setForm({ ...form, vehicle_category_code: c.name })}
                  className={`border p-3 rounded-lg transition-colors ${form.vehicle_category_code === c.name ? 'bg-green-500 text-white border-green-500' : 'bg-gray-50 border-gray-300 hover:bg-gray-100'
                    }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">🚗 차량 선택</label>
            <select
              value={form.vehicle_code}
              onChange={e => setForm({ ...form, vehicle_code: e.target.value })}
              className="w-full border border-gray-300 p-3 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
            >
              <option value="">차량을 선택하세요</option>
              {vehicles.map(v => <option key={v.code} value={v.code}>{v.name}</option>)}
            </select>
          </div>

          {/* 승객 수 선택 */}
          <div className="bg-gradient-to-r from-green-600 to-teal-600 rounded-lg p-6">
            <h3 className="text-white text-lg font-semibold mb-4">👥 승객 수</h3>
            <div className="grid grid-cols-8 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                <button
                  key={n}
                  onClick={() => setForm({ ...form, passenger_count: n })}
                  className={`border rounded px-3 py-2 transition-colors ${form.passenger_count === n ? 'bg-white text-green-600 border-white' : 'bg-green-600/20 text-white border-white/30 hover:bg-green-600/40'
                    }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>


          {/* 제출 버튼 */}
          <div className="flex gap-4">
            <button
              onClick={() => router.back()}
              className="flex-1 bg-gray-500 text-white py-3 rounded-lg hover:bg-gray-600 transition-colors"
            >
              ← 뒤로가기
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 bg-gradient-to-r from-green-500 to-teal-600 text-white py-3 rounded-lg hover:from-green-600 hover:to-teal-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition-all"
            >
              {loading ? '저장 중...' : '🚐 차량 예약하기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
