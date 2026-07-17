'use client';

// 홈페이지 상품 데이터 전송을 실행하고 결과를 표시하는 관리자 화면이다.
import { useEffect, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import supabase from '@/lib/supabase';

type TransformStatus = {
  rawCounts?: Record<string, number>;
  priceCounts?: Record<string, number>;
  productCounts?: Record<string, number>;
  detailCounts?: Record<string, number>;
  referenceCounts?: Record<string, number>;
  unconvertedPriceCounts?: Record<string, number>;
  unconvertedSourceCounts?: Record<string, number>;
  latestSourceSyncAt?: string | null;
};
type SyncResult = { received?: number; catalogCounts?: Record<string, number>; transformed?: Record<string, number>; status?: TransformStatus; error?: string };

export default function HomepageSyncPage() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [status, setStatus] = useState<TransformStatus | null>(null);

  async function request(method: 'GET' | 'POST', action?: 'transform') {
    const { data } = await supabase.auth.getSession();
    const response = await fetch('/api/admin/homepage-sync', {
      method,
      headers: {
        ...(data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {}),
        ...(action ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(action ? { body: JSON.stringify({ action }) } : {}),
    });
    return { response, body: await response.json().catch(() => ({ error: '응답을 해석하지 못했습니다.' })) };
  }

  async function loadStatus() {
    const { response, body } = await request('GET');
    if (response.ok) setStatus(body.status || null);
    else setResult({ error: body.error || '변환 현황을 조회하지 못했습니다.' });
  }

  useEffect(() => { void loadStatus(); }, []);

  async function sendNow() {
    setRunning(true);
    setResult(null);
    const { response, body } = await request('POST');
    setResult(response.ok ? body : { error: body.error || '전송에 실패했습니다.' });
    if (response.ok) setStatus(body.status || null);
    setRunning(false);
  }

  async function transformAll() {
    setRunning(true);
    setResult(null);
    const { response, body } = await request('POST', 'transform');
    setResult(response.ok ? body : { error: body.error || '전체 변환에 실패했습니다.' });
    if (response.ok) setStatus(body.status || null);
    setRunning(false);
  }

  const missingPriceCount = Object.values(status?.unconvertedPriceCounts || {}).reduce((sum, count) => sum + count, 0);
  const missingSourceCount = Object.values(status?.unconvertedSourceCounts || {}).reduce((sum, count) => sum + count, 0);
  const missingCount = missingPriceCount + missingSourceCount;

  return (
    <AdminLayout title="홈페이지 데이터 전송" activeTab="homepage-sync">
      <div className="max-w-3xl space-y-6">
        <section className="rounded-xl border border-blue-100 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">홈페이지 상품 데이터 전송</h2>
          <p className="mt-2 text-sm text-gray-600">크루즈, 호텔, 투어, 차량의 상품·요금 카탈로그만 홈페이지 DB로 전송합니다. 회원, 예약, 결제 데이터는 전송하지 않습니다.</p>
          <button type="button" onClick={sendNow} disabled={running} className="mt-5 rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400">
            {running ? '홈페이지로 전송 중...' : '지금 홈페이지로 전송'}
          </button>
          <button type="button" onClick={transformAll} disabled={running} className="mt-5 ml-3 rounded-lg border border-blue-600 bg-white px-5 py-3 font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400">
            {running ? '변환 처리 중...' : '가져온 데이터 전체 변환'}
          </button>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div><h3 className="font-semibold text-gray-900">자동 변환 현황</h3><p className="mt-2 text-sm text-gray-600">전송 후 자동 변환되며, 미변환 요금이 있으면 전체 변환 버튼으로 다시 처리할 수 있습니다.</p></div>
            <button type="button" onClick={() => void loadStatus()} disabled={running} className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">새로고침</button>
          </div>
          {status ? <div className="mt-4 space-y-2 text-sm"><p className={missingCount ? 'font-semibold text-amber-700' : 'font-semibold text-green-700'}>{missingCount ? `미변환 원본 또는 요금 ${missingCount}건이 있습니다.` : '모든 수신 원본과 요금이 자동 변환되었습니다.'}</p><p className="text-gray-600">원본 {Object.values(status.rawCounts || {}).reduce((sum, count) => sum + count, 0)}건 · v2 상품 {Object.values(status.productCounts || {}).reduce((sum, count) => sum + count, 0)}건 · v2 요금 {Object.values(status.priceCounts || {}).reduce((sum, count) => sum + count, 0)}건 · 상세 {Object.values(status.detailCounts || {}).reduce((sum, count) => sum + count, 0)}건 · 참조 {Object.values(status.referenceCounts || {}).reduce((sum, count) => sum + count, 0)}건</p>{Object.entries(status.unconvertedPriceCounts || {}).map(([table, count]) => <p className="text-amber-700" key={`price-${table}`}>{table}. 미변환 요금 {count}건</p>)}{Object.entries(status.unconvertedSourceCounts || {}).map(([table, count]) => <p className="text-amber-700" key={`source-${table}`}>{table}. 미변환 원본 {count}건</p>)}</div> : <p className="mt-4 text-sm text-gray-500">변환 현황을 불러오는 중입니다.</p>}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="font-semibold text-gray-900">자동 전송 일정</h3>
          <p className="mt-2 text-sm text-gray-600">매주 월요일 오전 3시(KST)에 자동 전송됩니다. Vercel Cron과 `CRON_SECRET` 설정이 필요합니다.</p>
        </section>

        {result && (
          <section className={`rounded-xl border p-6 ${result.error ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
            {result.error ? <p className="text-sm text-red-700">처리 실패. {result.error}</p> : <><p className="font-semibold text-green-800">처리가 완료됐습니다. 홈페이지가 {result.received || 0}건을 수신했고, 상품 {result.transformed?.products || 0}건·요금 {result.transformed?.prices || 0}건·상세 {result.transformed?.details || 0}건·참조 {result.transformed?.references || 0}건을 가공했습니다.</p><ul className="mt-3 space-y-1 text-sm text-green-700">{Object.entries(result.catalogCounts || {}).map(([name, count]) => <li key={name}>{name}. {count}건</li>)}</ul></>}
          </section>
        )}
      </div>
    </AdminLayout>
  );
}
