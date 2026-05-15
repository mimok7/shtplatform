'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import supabase from '@/lib/supabase';
import ManagerLayout from '@/components/ManagerLayout';
import { toKstDateLabel } from '@/lib/dateKst';

export default function CustomerManagement() {
  const [customerCount, setCustomerCount] = useState<number>(0);

  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searched, setSearched] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [resettingPasswordId, setResettingPasswordId] = useState<string | null>(null);

  const loadRecentCustomers = async () => {
    try {
      setSearchLoading(true);
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        console.error('❌ 최근 가입자 조회 실패:', error);
        setCustomers([]);
        setCustomerCount(0);
        setSearched(true);
        return;
      }

      const normalized = (data || []).map((c: any) => ({
        ...c,
        role: String(c?.role ?? '').trim().toLowerCase()
      }));

      setCustomers(normalized);
      setCustomerCount(normalized.length);
      setSearched(true);
    } catch (error) {
      console.error('❌ 최근 가입자 로드 실패:', error);
      setCustomers([]);
      setCustomerCount(0);
      setSearched(true);
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user: authUser }, error } = await supabase.auth.getUser();
      if (error || !authUser) {
        router.push('/login');
        return;
      }
      setUser(authUser);
      await loadRecentCustomers();
      setLoading(false);
    };
    checkAuth();
  }, []);

  const searchCustomers = async () => {
    if (!user) return;
    const keyword = searchTerm.trim();
    if (!keyword) {
      setSearched(true);
      setCustomers([]);
      setCustomerCount(0);
      return;
    }

    try {
      setSearchLoading(true);
      let query = supabase
        .from('users')
        .select('*')
        .or(`email.ilike.%${keyword}%,name.ilike.%${keyword}%,phone_number.ilike.%${keyword}%`)
        .order('created_at', { ascending: false })
        .limit(100);

      const { data: customerData, error } = await query;

      if (error) {
        console.error('❌ 고객 데이터 조회 실패:', error);
        setCustomers([]);
        setCustomerCount(0);
        setSearched(true);
        return;
      }

      if (!customerData || customerData.length === 0) {
        setCustomers([]);
        setCustomerCount(0);
        setSearched(true);
        return;
      }
      const normalized = customerData.map((c: any) => ({
        ...c,
        role: String(c?.role ?? '').trim().toLowerCase()
      }));
      setCustomers(normalized);
      setCustomerCount(normalized.length);
      setSearched(true);

    } catch (error) {
      console.error('❌ 고객 로드 완전 실패:', error);
      setCustomers([]);
      setCustomerCount(0);
      setSearched(true);
    } finally {
      setSearchLoading(false);
    }
  };

  const toEditableString = (value: any) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }
    return String(value);
  };

  const parseEditedValue = (raw: string, original: any) => {
    // 빈 값은 null로 보내서 타입 캐스팅 오류(예: 숫자/날짜 컬럼에 '')를 방지
    if (raw.trim() === '') {
      return null;
    }

    if (typeof original === 'number') {
      const num = Number(raw);
      return Number.isNaN(num) ? original : num;
    }

    if (typeof original === 'boolean') {
      return raw === 'true';
    }

    if (original && typeof original === 'object') {
      try {
        return JSON.parse(raw);
      } catch {
        return original;
      }
    }

    return raw;
  };

  const viewCustomerDetail = async (customerId: string) => {
    try {
      // 고객 상세 정보 조회
      const { data: customer } = await supabase
        .from('users')
        .select('*')
        .eq('id', customerId)
        .single();

      // 고객의 견적 목록 조회
      const { data: quotes } = await supabase
        .from('quote')
        .select('*')
        .eq('user_id', customerId)
        .order('created_at', { ascending: false });

      setSelectedCustomer({
        ...customer,
        quotes: quotes || []
      });
      const initialEditValues = Object.entries(customer || {}).reduce((acc, [key, value]) => {
        acc[key] = toEditableString(value);
        return acc;
      }, {} as Record<string, string>);
      setEditValues(initialEditValues);
      setShowModal(true);
    } catch (error) {
      console.error('고객 상세 정보 로드 실패:', error);
    }
  };

  const updateCustomerInfo = async (customerId: string, updates: any) => {
    try {
      setIsSaving(true);
      const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', customerId);

      if (error) throw error;

      alert('고객 정보가 업데이트되었습니다.');
      await searchCustomers();
      const targetId = updates?.id || customerId;
      await viewCustomerDetail(targetId);
    } catch (error) {
      console.error('고객 정보 업데이트 실패:', error);
      alert('업데이트에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteCustomer = async (customerId: string) => {
    const confirmed = window.confirm(
      '정말 이 고객을 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.'
    );
    if (!confirmed) return;

    try {
      setIsDeleting(true);
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', customerId);

      if (error) throw error;

      alert('고객이 삭제되었습니다.');
      setShowModal(false);
      setSelectedCustomer(null);
      await searchCustomers();
    } catch (error: any) {
      console.error('고객 삭제 실패:', error);
      
      // FK 제약 조건 에러 처리
      if (error?.code === '23503') {
        if (error?.details?.includes('quote')) {
          alert('이 고객은 견적이 있어서 삭제할 수 없습니다.\n\n먼저 고객의 모든 견적을 삭제한 후 다시 시도해주세요.');
        } else if (error?.details?.includes('reservation')) {
          alert('이 고객은 예약이 있어서 삭제할 수 없습니다.\n\n먼저 고객의 모든 예약을 삭제한 후 다시 시도해주세요.');
        } else {
          alert('이 고객은 관련 데이터가 있어서 삭제할 수 없습니다.\n\n먼저 관련 데이터를 모두 삭제한 후 다시 시도해주세요.');
        }
      } else {
        alert('고객 삭제에 실패했습니다.\n\n다시 시도해주세요.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const resetCustomerPassword = async (customerId: string, customerEmail?: string) => {
    const confirmed = window.confirm(
      `${customerEmail || '해당 고객'}의 비밀번호를 sht123! 로 초기화하시겠습니까?\n\n보안을 위해 초기화 후 고객에게 즉시 변경 안내가 필요합니다.`
    );
    if (!confirmed) return;

    try {
      setResettingPasswordId(customerId);

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (sessionError || !accessToken) {
        alert('로그인 세션을 확인할 수 없습니다. 다시 로그인 후 시도해주세요.');
        return;
      }

      const response = await fetch('/api/auth/reset-customer-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({ targetUserId: customerId })
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        alert(result?.error || '비밀번호 초기화에 실패했습니다.');
        return;
      }

      alert('비밀번호가 sht123! 로 초기화되었습니다.');
    } catch (error) {
      console.error('비밀번호 초기화 실패:', error);
      alert('비밀번호 초기화 중 오류가 발생했습니다.');
    } finally {
      setResettingPasswordId(null);
    }
  };

  const handleSaveCustomer = async () => {
    if (!selectedCustomer?.id) return;

    const immutableFields = new Set(['id', 'created_at', 'updated_at']);

    const updates = Object.entries(selectedCustomer)
      .filter(([key]) => key !== 'quotes' && !immutableFields.has(key))
      .reduce((acc, [key, originalValue]) => {
        const parsedValue = parseEditedValue(editValues[key] ?? '', originalValue);

        // 값이 바뀐 필드만 업데이트에 포함
        const originalComparable = JSON.stringify(originalValue ?? null);
        const parsedComparable = JSON.stringify(parsedValue ?? null);

        if (originalComparable !== parsedComparable) {
          acc[key] = parsedValue;
        }

        return acc;
      }, {} as Record<string, any>);

    if (Object.keys(updates).length === 0) {
      alert('변경된 내용이 없습니다.');
      return;
    }

    await updateCustomerInfo(selectedCustomer.id, updates);
  };

  const formatDate = (dateString: string) => {
    return toKstDateLabel(dateString);
  };

  const FIELD_LABELS: Record<string, string> = {
    role: '권한',
    name: '이름',
    english_name: '영문이름',
    email: '이메일',
    phone_number: '전화번호',
    created_at: '가입일',
    updated_at: '수정일',
    nickname: '닉네임',
    child_birth_date: '아동생년월일',
  };

  const toKoreanLabel = (key: string) => FIELD_LABELS[key] || key;
  const VISIBLE_FIELDS = [
    'role',
    'name',
    'english_name',
    'email',
    'phone_number',
    'nickname',
    'created_at',
    'updated_at',
    'child_birth_date',
  ];

  const activeCustomerCount = customers.filter((c) => {
    const daysSince = c.last_activity ? Math.floor((Date.now() - new Date(c.last_activity).getTime()) / (1000 * 60 * 60 * 24)) : 9999;
    return daysSince <= 7;
  }).length;
  const reservedCustomerCount = customers.filter((c) => c.confirmed_count && c.confirmed_count > 0).length;
  const newCustomerCount = customers.filter((c) => {
    const daysSince = c.created_at ? Math.floor((Date.now() - new Date(c.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 9999;
    return daysSince <= 30;
  }).length;

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-lg text-gray-600">로딩 중...</div>
    </div>;
  }

    return (
    <ManagerLayout title="👥 고객 관리" activeTab="customers">
      <div className="space-y-4">
        <div className="bg-white rounded-lg border border-gray-200 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-700">
            <span className="font-semibold">총 {customerCount}명</span>
            <span>활성 {activeCustomerCount}명</span>
            <span>예약 {reservedCustomerCount}명</span>
            <span>신규(30일) {newCustomerCount}명</span>
          </div>
        </div>

        <div className="mb-2 flex flex-row items-center gap-2">
          <div className="flex-1 min-w-0">
            <input
              type="text"
              placeholder="고객 이름 또는 이메일로 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void searchCustomers();
                }
              }}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button
            onClick={() => void searchCustomers()}
            disabled={searchLoading}
            className="shrink-0 px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-60 whitespace-nowrap"
          >
            {searchLoading ? '검색 중...' : '검색'}
          </button>
        </div>

        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          {!searched ? (
            <div className="py-8 text-center text-gray-500 text-sm">검색어를 입력 후 검색 버튼을 눌러주세요.</div>
          ) : customers.length === 0 ? (
            <div className="py-8 text-center text-gray-500 text-sm">검색 결과가 없습니다.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {customers
                .slice()
                .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
                .slice(0, 5)
                .map((customer) => (
                  <div key={customer.id} className="bg-gray-50 rounded-xl shadow-sm border border-gray-200 p-4 flex flex-col justify-between h-full">
                    <div className="mb-2">
                      <div className="text-base font-semibold text-gray-900">{customer.name || '이름 없음'}</div>
                      <div className="text-sm text-gray-500">{customer.email}</div>
                      {customer.phone_number && (
                        <div className="text-xs text-gray-400 mt-1">{customer.phone_number}</div>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mb-2">
                      {VISIBLE_FIELDS
                        .filter((key) => key in customer)
                        .map((key) => {
                          const value = customer[key];
                          const displayValue = value === null || value === undefined
                            ? ''
                            : typeof value === 'object'
                              ? JSON.stringify(value)
                              : String(value);
                          return (
                            <div key={key} className="mb-1">
                              <span className="font-semibold text-green-800">{toKoreanLabel(key)}:</span> <span className="text-gray-700 break-all">{displayValue}</span>
                            </div>
                          );
                        })}
                    </div>
                    <div className="flex items-center justify-between mt-2 gap-2">
                      <button
                        onClick={() => deleteCustomer(customer.id)}
                        className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs md:text-sm"
                      >🗑️ 삭제</button>
                      <button
                        onClick={() => resetCustomerPassword(customer.id, customer.email)}
                        className="bg-amber-500 hover:bg-amber-600 text-white px-2 py-1 rounded text-xs md:text-sm disabled:opacity-60"
                        disabled={resettingPasswordId === customer.id}
                      >{resettingPasswordId === customer.id ? '초기화 중...' : '🔑 비번초기화'}</button>
                      <button
                        onClick={() => viewCustomerDetail(customer.id)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs md:text-sm"
                      >상세보기</button>
                    </div>
                  </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* 고객 상세 모달 */}
      {showModal && selectedCustomer && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-8 mx-auto p-5 border w-11/12 md:w-3/4 lg:w-2/3 xl:w-1/2 shadow-lg rounded-md bg-white max-h-[90vh] overflow-y-auto">
            <div className="mt-3">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">고객 상세 정보</h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                {Object.keys(selectedCustomer)
                  .filter((key) => key !== 'quotes' && VISIBLE_FIELDS.includes(key))
                  .sort((a, b) => VISIBLE_FIELDS.indexOf(a) - VISIBLE_FIELDS.indexOf(b))
                  .map((key) => {
                    const originalValue = selectedCustomer[key];
                    const value = editValues[key] ?? '';

                    if (key === 'role') {
                      return (
                        <div key={key}>
                          <label className="block text-sm font-medium text-gray-700">{toKoreanLabel(key)}</label>
                          <select
                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 bg-white"
                            value={value}
                            onChange={(e) => setEditValues((prev) => ({ ...prev, [key]: e.target.value }))}
                          >
                            <option value="guest">guest</option>
                            <option value="member">member</option>
                            <option value="manager">manager</option>
                            <option value="admin">admin</option>
                            <option value="dispatcher">dispatcher</option>
                            {!['guest', 'member', 'manager', 'admin', 'dispatcher'].includes(value) && (
                              <option value={value}>{value}</option>
                            )}
                          </select>
                        </div>
                      );
                    }

                    if (typeof originalValue === 'boolean') {
                      return (
                        <div key={key}>
                          <label className="block text-sm font-medium text-gray-700">{toKoreanLabel(key)}</label>
                          <select
                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 bg-white"
                            value={value}
                            onChange={(e) => setEditValues((prev) => ({ ...prev, [key]: e.target.value }))}
                          >
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        </div>
                      );
                    }

                    if (originalValue && typeof originalValue === 'object') {
                      return (
                        <div key={key}>
                          <label className="block text-sm font-medium text-gray-700">{toKoreanLabel(key)}</label>
                          <textarea
                            value={value}
                            onChange={(e) => setEditValues((prev) => ({ ...prev, [key]: e.target.value }))}
                            rows={4}
                            className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2 font-mono text-xs"
                          />
                        </div>
                      );
                    }

                    return (
                      <div key={key}>
                        <label className="block text-sm font-medium text-gray-700">{toKoreanLabel(key)}</label>
                        <input
                          type="text"
                          value={value}
                          className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
                          onChange={(e) => setEditValues((prev) => ({ ...prev, [key]: e.target.value }))}
                        />
                      </div>
                    );
                  })}

                <div className="flex justify-between gap-2 pt-2">
                  <button
                    onClick={() => deleteCustomer(selectedCustomer.id)}
                    className="px-3 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
                    disabled={isSaving || isDeleting}
                  >
                    {isDeleting ? '삭제 중...' : '🗑️ 삭제'}
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowModal(false)}
                      className="px-3 py-2 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                      disabled={isSaving || isDeleting}
                    >
                      닫기
                    </button>
                    <button
                      onClick={handleSaveCustomer}
                      className="px-3 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                      disabled={isSaving || isDeleting}
                    >
                      {isSaving ? '저장 중...' : '저장'}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">견적 이력</label>
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-md">
                    {selectedCustomer.quotes?.length > 0 ? (
                      selectedCustomer.quotes.map((quote: any) => (
                        <div key={quote.id} className="p-3 border-b border-gray-100 last:border-b-0">
                          <div className="text-sm font-medium">
                            {quote.schedule_info?.name} • {quote.cruise_info?.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            체크인: {formatDate(quote.checkin)} • 상태: {quote.status}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-3 text-sm text-gray-500">견적 이력이 없습니다.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </ManagerLayout>
  );
}

