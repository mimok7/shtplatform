'use client';

// 홈페이지 상품 데이터 전송을 실행하고 결과를 표시하는 관리자 화면이다.
import { useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import supabase from '@/lib/supabase';

type SyncResult = { received?: number; catalogCounts?: Record<string, number>; error?: string };

export default function HomepageSyncPage() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);

  async function sendNow() {
    setRunning(true);
    setResult(null);
    const { data } = await supabase.auth.getSession();
    const response = await fetch('/api/admin/homepage-sync', {
      method: 'POST',
      headers: data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {},
    });
    const body = await response.json().catch(() => ({ error: '응답을 해석하지 못했습니다.' }));
    setResult(response.ok ? body : { error: body.error || '전송에 실패했습니다.' });
    setRunning(false);
  }

  return (
    <AdminLayout title="홈페이지 데이터 전송" activeTab="homepage-sync">
      <div className="max-w-3xl space-y-6">
        <section className="rounded-xl border border-blue-100 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">홈페이지 상품 데이터 전송</h2>
          <p className="mt-2 text-sm text-gray-600">크루즈, 호텔, 투어, 차량의 상품·요금 카탈로그만 홈페이지 DB로 전송합니다. 회원, 예약, 결제 데이터는 전송하지 않습니다.</p>
          <button type="button" onClick={sendNow} disabled={running} className="mt-5 rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400">
            {running ? '홈페이지로 전송 중...' : '지금 홈페이지로 전송'}
          </button>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="font-semibold text-gray-900">자동 전송 일정</h3>
          <p className="mt-2 text-sm text-gray-600">매주 월요일 오전 3시(KST)에 자동 전송됩니다. Vercel Cron과 `CRON_SECRET` 설정이 필요합니다.</p>
        </section>

        {result && (
          <section className={`rounded-xl border p-6 ${result.error ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
            {result.error ? <p className="text-sm text-red-700">전송 실패. {result.error}</p> : <><p className="font-semibold text-green-800">전송 완료. 홈페이지가 {result.received || 0}건을 수신했습니다.</p><ul className="mt-3 space-y-1 text-sm text-green-700">{Object.entries(result.catalogCounts || {}).map(([name, count]) => <li key={name}>{name}. {count}건</li>)}</ul></>}
          </section>
        )}
      </div>
    </AdminLayout>
  );
}
