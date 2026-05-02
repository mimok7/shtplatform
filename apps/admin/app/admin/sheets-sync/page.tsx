'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, ExternalLink, RefreshCw, Table2, XCircle } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { getSupabase } from '@/lib/supabase';

type EnvStatus = {
  supabaseUrl: boolean;
  serviceRole: boolean;
  googleSpreadsheetId: boolean;
  googleServiceAccount: boolean;
  spreadsheetId: string;
  serviceAccountEmail: string;
};

type SyncSheet = { title: string; rows: number; columns: number };

export default function SheetsSyncPage() {
  const [env, setEnv] = useState<EnvStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [syncedAt, setSyncedAt] = useState('');
  const [sheets, setSheets] = useState<SyncSheet[]>([]);
  const [spreadsheetIdInput, setSpreadsheetIdInput] = useState('');

  const authHeaders = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await getSupabase().auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  };

  const loadStatus = async () => {
    setLoading(true);
    setMessage('');
    try {
      const headers = await authHeaders();
      const query = spreadsheetIdInput.trim() ? `?spreadsheetId=${encodeURIComponent(spreadsheetIdInput.trim())}` : '';
      const res = await fetch(`/api/admin/sheets-sync${query}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '상태 확인 실패');
      setEnv(data.env);
    } catch (error: any) {
      setMessage(`상태 확인 실패: ${error.message || error}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const ready = useMemo(() => {
    if (!env) return false;
    return env.supabaseUrl && env.serviceRole && env.googleSpreadsheetId && env.googleServiceAccount;
  }, [env]);

  const runSync = async () => {
    setSyncing(true);
    setMessage('');
    try {
      const headers = await authHeaders();
      const query = spreadsheetIdInput.trim() ? `?spreadsheetId=${encodeURIComponent(spreadsheetIdInput.trim())}` : '';
      const res = await fetch(`/api/admin/sheets-sync${query}`, { method: 'POST', headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '동기화 실패');
      setSyncedAt(data.syncedAt);
      setSheets(data.sheets || []);
      setMessage('동기화가 완료되었습니다.');
      await loadStatus();
    } catch (error: any) {
      setMessage(`동기화 실패: ${error.message || error}`);
    } finally {
      setSyncing(false);
    }
  };

  const statusItems = [
    { label: 'Supabase URL', ok: env?.supabaseUrl },
    { label: 'Service Role Key', ok: env?.serviceRole },
    { label: 'Google Sheet ID', ok: env?.googleSpreadsheetId },
    { label: 'Google Service Account', ok: env?.googleServiceAccount },
  ];

  return (
    <AdminLayout title="구글시트 동기화" activeTab="sheets-sync">
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Table2 className="w-6 h-6 text-blue-600" />
                DB 데이터를 구글시트로 내보내기
              </h2>
              <p className="text-sm text-gray-600 mt-2">
                예약자별 예약 조회, 크루즈 예약 상세, 크루즈 가격 안내를 관계 매핑된 시트로 생성합니다.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={loadStatus}
                disabled={loading || syncing}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                상태 확인
              </button>
              <button
                onClick={runSync}
                disabled={!ready || syncing || loading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? '동기화 중' : '동기화 실행'}
              </button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
            <input
              type="text"
              value={spreadsheetIdInput}
              onChange={(e) => setSpreadsheetIdInput(e.target.value)}
              placeholder="Google Sheet ID (선택: 환경변수 미설정 시 여기 입력)"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={loadStatus}
              disabled={loading || syncing}
              className="inline-flex items-center justify-center px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              입력값으로 재확인
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {statusItems.map((item) => (
            <div key={item.label} className="bg-white rounded-lg shadow-sm p-4 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">{item.label}</span>
              {item.ok ? <CheckCircle className="w-5 h-5 text-green-600" /> : <XCircle className="w-5 h-5 text-red-500" />}
            </div>
          ))}
        </div>

        {env && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-3">연결 정보</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="border rounded-md p-3">
                <div className="text-gray-500">시트 ID</div>
                <div className="font-mono text-gray-900 mt-1">{env.spreadsheetId || '미설정'}</div>
              </div>
              <div className="border rounded-md p-3">
                <div className="text-gray-500">서비스 계정</div>
                <div className="font-mono text-gray-900 mt-1 break-all">{env.serviceAccountEmail || '미설정'}</div>
              </div>
            </div>
          </div>
        )}

        {!ready && !loading && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 text-sm text-amber-900">
            <div className="font-semibold mb-2">필요 환경변수</div>
            <div className="font-mono text-xs space-y-1">
              <div>NEXT_PUBLIC_SUPABASE_URL</div>
              <div>SUPABASE_SERVICE_ROLE_KEY</div>
              <div>GOOGLE_SHEETS_SPREADSHEET_ID</div>
              <div>GOOGLE_SERVICE_ACCOUNT_JSON 또는 GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY</div>
            </div>
          </div>
        )}

        {message && (
          <div className={`rounded-lg p-4 text-sm ${message.includes('실패') ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-green-50 border border-green-200 text-green-700'}`}>
            {message}
          </div>
        )}

        {syncedAt && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">동기화 결과</h3>
              <span className="text-xs text-gray-500">{new Date(syncedAt).toLocaleString('ko-KR')}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-600">
                    <th className="py-2 pr-4">시트</th>
                    <th className="py-2 pr-4">행</th>
                    <th className="py-2 pr-4">열</th>
                  </tr>
                </thead>
                <tbody>
                  {sheets.map((sheet) => (
                    <tr key={sheet.title} className="border-b last:border-b-0">
                      <td className="py-2 pr-4 font-medium text-gray-900">{sheet.title}</td>
                      <td className="py-2 pr-4">{sheet.rows.toLocaleString('ko-KR')}</td>
                      <td className="py-2 pr-4">{sheet.columns.toLocaleString('ko-KR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 text-sm text-blue-900">
          <div className="font-semibold mb-2">생성되는 탭</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {['동기화_상태', '관계_매핑', '예약자별_예약조회', '크루즈예약_상세', '크루즈가격_안내', '예약자_목록'].map((name) => (
              <div key={name} className="bg-white border border-blue-100 rounded-md px-3 py-2 flex items-center gap-2">
                <ExternalLink className="w-4 h-4 text-blue-600" />
                <span className="font-medium">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
