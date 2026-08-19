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
  supplementalCounts?: Record<string, number>;
  unconvertedPriceCounts?: Record<string, number>;
  unconvertedSourceCounts?: Record<string, number>;
  latestSourceSyncAt?: string | null;
  latestRunAt?: string | null;
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
  const total = (counts?: Record<string, number>) => Object.values(counts || {}).reduce((sum, count) => sum + count, 0);
  const receivedCount = total(status?.rawCounts);
  const productCount = total(status?.productCounts);
  const priceCount = total(status?.priceCounts);
  const detailCount = total(status?.detailCounts);
  const referenceCount = total(status?.referenceCounts);
  const supplementalCount = total(status?.supplementalCounts);
  const formatTime = (value?: string | null) => value ? new Date(value).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : '아직 기록 없음';

  return (
    <AdminLayout title="홈페이지 데이터 전송" activeTab="homepage-sync">
      <div className="max-w-5xl space-y-6 pb-10">
        <section className="border border-[#062f33] bg-[#06272a] px-6 py-7 text-white sm:px-8">
          <p className="text-[11px] font-bold tracking-[0.16em] text-[#d9ff72]">01 / HOMEPAGE DATA PIPELINE</p>
          <h2 className="mt-3 text-2xl font-bold tracking-[-0.045em] text-white">플랫폼 상품을 홈페이지에<br />안전하게 반영합니다.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#d3dfdc]">전송은 플랫폼의 공개 상품 원본을 홈페이지 전용 저장소에 복제한 뒤, 목록과 상세 화면에 맞는 상품·요금·객실 데이터로 가공합니다. 회원, 예약, 결제 정보는 이 흐름에 포함되지 않습니다.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={sendNow} disabled={running} className="min-h-11 bg-[#d9ff72] px-5 py-3 text-sm font-bold text-[#06272a] hover:bg-[#c8ed64] disabled:cursor-not-allowed disabled:bg-[#9db77a]">
              {running ? '홈페이지로 전송 중...' : '지금 홈페이지로 전송 →'}
            </button>
            <button type="button" onClick={transformAll} disabled={running} className="min-h-11 border border-white/70 px-5 py-3 text-sm font-bold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:border-white/30 disabled:text-white/50">
              {running ? '변환 처리 중...' : '가져온 데이터 전체 변환'}
            </button>
          </div>
        </section>

        <section className="border-y border-[#062f33]/20 bg-[#f4f4ed] px-6 py-5 sm:px-8">
          <p className="text-[11px] font-bold tracking-[0.16em] text-[#6f817d]">HOW IT WORKS</p>
          <div className="mt-4 grid gap-px bg-[#062f33]/20 md:grid-cols-3">
            {[
              ['01', '홈페이지로 전송', '플랫폼의 크루즈·호텔·투어·차량 원본을 전체 스냅샷으로 보냅니다. 전송 직후 홈페이지용 카탈로그와 크루즈 공개 캐시를 함께 갱신합니다.'],
              ['02', '가져온 데이터 전체 변환', '새 전송 없이 홈페이지에 이미 수신된 원본을 다시 가공합니다. 변환 규칙을 배포한 뒤 또는 현황 경고를 재점검할 때 사용합니다.'],
              ['03', '현황 새로고침', '데이터를 변경하지 않고 마지막 수신 시각과 실제 미변환 행만 다시 조회합니다. 원본·요금·상세 수는 역할이 달라 서로 합산하지 않습니다.'],
            ].map(([index, title, description]) => <article key={index} className="bg-white px-5 py-5"><span className="text-xs font-bold tracking-[0.14em] text-[#ff725e]">{index}</span><h3 className="mt-3 text-base font-bold text-[#06272a]">{title}</h3><p className="mt-2 text-sm leading-6 text-[#526966]">{description}</p></article>)}
          </div>
        </section>

        <section className="border border-[#062f33]/20 bg-white px-6 py-6 sm:px-8">
          <div className="flex items-center justify-between gap-4">
            <div><p className="text-[11px] font-bold tracking-[0.16em] text-[#6f817d]">02 / TRANSFORMATION STATUS</p><h3 className="mt-2 text-xl font-bold tracking-[-0.035em] text-[#06272a]">자동 변환 현황</h3><p className="mt-2 text-sm leading-6 text-[#526966]">경고는 실제로 홈페이지 카탈로그에 연결되지 않은 원본만 계산합니다. 이미지와 표현 오버라이드 같은 보조자료는 별도로 수신 상태만 표시합니다.</p></div>
            <button type="button" onClick={() => void loadStatus()} disabled={running} className="min-h-11 border border-[#062f33] px-4 py-2 text-sm font-bold text-[#06272a] hover:bg-[#f4f4ed] disabled:cursor-not-allowed disabled:border-[#6f817d] disabled:text-[#6f817d]">현황 새로고침</button>
          </div>
          {status ? <div className="mt-5"><p className={`border-l-4 px-4 py-3 text-sm font-bold ${missingCount ? 'border-[#ff725e] bg-[#fff1ed] text-[#a53729]' : 'border-[#d9ff72] bg-[#f4f4ed] text-[#06272a]'}`}>{missingCount ? `점검이 필요한 미변환 행이 ${missingCount.toLocaleString('ko-KR')}건 있습니다.` : '모든 카탈로그 원본과 요금이 홈페이지 변환 흐름에 연결됐습니다.'}</p><div className="mt-4 grid grid-cols-2 gap-px bg-[#062f33]/20 sm:grid-cols-3 lg:grid-cols-5"><StatusMetric label="수신 원본" value={receivedCount} description="전송된 원본 행" /><StatusMetric label="상품" value={productCount} description="목록에 쓰는 상품" /><StatusMetric label="요금" value={priceCount} description="기간·객실별 요금" /><StatusMetric label="상세" value={detailCount} description="상품 상세 원본" /><StatusMetric label="참조" value={referenceCount} description="위치·읽기 전용 자료" /></div><div className="mt-4 grid gap-2 text-sm text-[#526966] sm:grid-cols-2"><p>마지막 원본 수신. <strong className="font-semibold text-[#06272a]">{formatTime(status.latestSourceSyncAt)}</strong></p><p>마지막 전송 실행. <strong className="font-semibold text-[#06272a]">{formatTime(status.latestRunAt)}</strong></p><p className="sm:col-span-2">홈페이지 표현 보조자료. <strong className="font-semibold text-[#06272a]">{supplementalCount.toLocaleString('ko-KR')}건</strong>. 공항명·이미지·태그·객실 표현·관리자 오버라이드이며 일반 카탈로그 미변환 경고에는 포함하지 않습니다.</p></div>{Object.entries(status.unconvertedPriceCounts || {}).map(([table, count]) => <p className="mt-2 border-l-4 border-[#ff725e] pl-3 text-sm font-semibold text-[#a53729]" key={`price-${table}`}>{table}. 미변환 요금 {count.toLocaleString('ko-KR')}건</p>)}{Object.entries(status.unconvertedSourceCounts || {}).map(([table, count]) => <p className="mt-2 border-l-4 border-[#ff725e] pl-3 text-sm font-semibold text-[#a53729]" key={`source-${table}`}>{table}. 미변환 상세·참조 원본 {count.toLocaleString('ko-KR')}건</p>)}</div> : <p className="mt-5 border-l-4 border-[#d9ff72] bg-[#f4f4ed] px-4 py-3 text-sm text-[#526966]">변환 현황을 불러오는 중입니다.</p>}
        </section>

        <section className="border-y border-[#062f33]/20 bg-[#f4f4ed] px-6 py-5 sm:px-8">
          <p className="text-[11px] font-bold tracking-[0.16em] text-[#6f817d]">03 / AUTOMATIC SCHEDULE</p>
          <h3 className="mt-2 text-lg font-bold tracking-[-0.03em] text-[#06272a]">매일 오전 3시(KST)에 전체 상품을 대조 전송합니다.</h3>
          <p className="mt-2 text-sm leading-6 text-[#526966]">관리자에서 상품을 저장할 때는 연결된 홈페이지 캐시가 즉시 갱신될 수 있으며, 정기 전송은 누락이나 변경분을 다시 대조합니다. 자동 실행에는 Vercel Cron과 `CRON_SECRET` 설정이 필요합니다.</p>
        </section>

        {result && (
          <section className={`border px-6 py-5 sm:px-8 ${result.error ? 'border-[#ff725e] bg-[#fff1ed]' : 'border-[#062f33] bg-[#d9ff72]'}`}>
            {result.error ? <p className="text-sm font-semibold text-[#a53729]">처리 실패. {result.error}</p> : <><p className="text-sm font-bold text-[#06272a]">처리가 완료됐습니다. 홈페이지가 {(result.received || 0).toLocaleString('ko-KR')}건을 수신했고, 상품 {(result.transformed?.products || 0).toLocaleString('ko-KR')}건·요금 {(result.transformed?.prices || 0).toLocaleString('ko-KR')}건·상세 {(result.transformed?.details || 0).toLocaleString('ko-KR')}건·참조 {(result.transformed?.references || 0).toLocaleString('ko-KR')}건을 가공했습니다.</p><ul className="mt-3 grid gap-x-5 gap-y-1 text-sm text-[#294c4a] sm:grid-cols-2">{Object.entries(result.catalogCounts || {}).map(([name, count]) => <li key={name}>{name}. {count.toLocaleString('ko-KR')}건</li>)}</ul></>}
          </section>
        )}
      </div>
    </AdminLayout>
  );
}

function StatusMetric({ label, value, description }: { label: string; value: number; description: string }) {
  return <div className="min-h-28 bg-white px-4 py-4"><span className="block text-[11px] font-bold tracking-[0.12em] text-[#6f817d]">{label}</span><strong className="mt-2 block text-2xl font-bold tracking-[-0.04em] text-[#06272a]">{value.toLocaleString('ko-KR')}</strong><small className="mt-1 block text-xs text-[#6f817d]">{description}</small></div>;
}
