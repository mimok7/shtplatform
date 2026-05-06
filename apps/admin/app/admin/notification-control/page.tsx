'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminLayout from '@/components/AdminLayout';
import supabase from '@/lib/supabase';
import { NOTIFICATION_RECEIVER_PREFERENCE_TABLE } from '@/lib/notificationReceiverDevice';

const NOTIFICATION_RUNTIME_SETTINGS_TABLE = 'notification_runtime_settings';
const RESERVATION_RUNTIME_SETTING_KEY = 'reservation_realtime_enabled';
const NOTIFICATION_PRESENCE_TABLE = 'manager_notification_presence';
const STATUS_RPC = 'admin_get_manager_notification_status';

type ManagerStatusRow = {
  user_id: string;
  email: string | null;
  name: string | null;
  nickname: string | null;
  role: string | null;
  preferred_device_id: string | null;
  preferred_device_label: string | null;
  preference_updated_at: string | null;
  app_name: string | null;
  tab_id: string | null;
  device_id: string | null;
  device_label: string | null;
  is_leader: boolean | null;
  last_seen: string | null;
  is_active: boolean | null;
};

type ManagerAccount = {
  user_id: string;
  email: string;
  name: string | null;
  nickname: string | null;
  role: string | null;
  preferred_device_id: string | null;
  preferred_device_label: string | null;
  preference_updated_at: string | null;
};

function accountLabel(account: ManagerAccount | null) {
  if (!account) return '-';
  const name = account.name || account.nickname;
  return name ? `${account.email} (${name})` : account.email;
}

export default function NotificationControlPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [adminUserId, setAdminUserId] = useState<string | null>(null);
  const [statusRows, setStatusRows] = useState<ManagerStatusRow[]>([]);
  const [selectedManagerId, setSelectedManagerId] = useState('');
  const [runtimeEnabled, setRuntimeEnabled] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const managerAccounts = useMemo(() => {
    const accountMap = new Map<string, ManagerAccount>();

    statusRows.forEach((row) => {
      if (!row.user_id || accountMap.has(row.user_id)) return;
      accountMap.set(row.user_id, {
        user_id: row.user_id,
        email: row.email || row.user_id,
        name: row.name,
        nickname: row.nickname,
        role: row.role,
        preferred_device_id: row.preferred_device_id,
        preferred_device_label: row.preferred_device_label,
        preference_updated_at: row.preference_updated_at,
      });
    });

    return Array.from(accountMap.values()).sort((a, b) => a.email.localeCompare(b.email));
  }, [statusRows]);

  const selectedManager = managerAccounts.find((account) => account.user_id === selectedManagerId) || null;

  const activeRows = useMemo(() => {
    return statusRows.filter((row) => row.app_name && row.tab_id && row.device_id && row.is_active !== false);
  }, [statusRows]);

  const selectedActiveRows = useMemo(() => {
    if (!selectedManagerId) return [];
    return activeRows.filter((row) => row.user_id === selectedManagerId);
  }, [activeRows, selectedManagerId]);

  const loadStatus = async () => {
    const { data, error } = await supabase.rpc(STATUS_RPC);
    if (error) {
      setErrorMessage('매니저 계정 상태 조회 함수가 필요합니다. sql/027-admin-manager-notification-status-rpc.sql 을 실행해 주세요.');
      setStatusRows([]);
      return;
    }

    const rows = (data as ManagerStatusRow[] | null) || [];
    setStatusRows(rows);
    setErrorMessage(null);

    const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean)));
    setSelectedManagerId((prev) => {
      if (prev && userIds.includes(prev)) return prev;
      return userIds[0] || '';
    });
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        const authUser = data?.user;
        if (cancelled) return;

        if (error || !authUser) {
          setErrorMessage('로그인 정보를 확인할 수 없습니다. 다시 로그인해 주세요.');
          return;
        }

        setAdminUserId(authUser.id);

        const { data: runtimeRow, error: runtimeError } = await supabase
          .from(NOTIFICATION_RUNTIME_SETTINGS_TABLE)
          .select('setting_value_bool')
          .eq('setting_key', RESERVATION_RUNTIME_SETTING_KEY)
          .maybeSingle();

        if (!cancelled && !runtimeError) {
          setRuntimeEnabled(runtimeRow?.setting_value_bool !== false);
        }

        if (!cancelled) {
          await loadStatus();
        }

        const presenceChannel = supabase
          .channel('admin-notification-presence-status')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: NOTIFICATION_PRESENCE_TABLE },
            () => {
              void loadStatus();
            }
          )
          .subscribe();

        const preferenceChannel = supabase
          .channel('admin-notification-preference-status')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: NOTIFICATION_RECEIVER_PREFERENCE_TABLE },
            () => {
              void loadStatus();
            }
          )
          .subscribe();

        const refreshTimer = window.setInterval(() => {
          void loadStatus();
        }, 10000);

        return () => {
          window.clearInterval(refreshTimer);
          [presenceChannel, preferenceChannel].forEach((channel) => {
            try {
              void supabase.removeChannel?.(channel);
            } catch {
              try {
                channel.unsubscribe();
              } catch {
                // noop
              }
            }
          });
        };
      } catch (error) {
        if (!cancelled) {
          console.error('알림 제어 설정 로드 실패:', error);
          setErrorMessage('알림 제어 설정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    let cleanup: (() => void) | undefined;
    void load().then((fn) => {
      cleanup = fn;
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  const saveRuntimeEnabled = async (nextValue: boolean) => {
    try {
      setSaving(true);
      setErrorMessage(null);

      const { error } = await supabase.from(NOTIFICATION_RUNTIME_SETTINGS_TABLE).upsert(
        {
          setting_key: RESERVATION_RUNTIME_SETTING_KEY,
          setting_value_bool: nextValue,
          updated_by: adminUserId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'setting_key' }
      );

      if (error) throw error;
      setRuntimeEnabled(nextValue);
    } catch (error) {
      console.error('전역 알림 상태 저장 실패:', error);
      setErrorMessage('전역 알림 설정 저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const setReceiverDevice = async (managerId: string, deviceId: string, deviceLabel: string | null) => {
    if (!managerId || !deviceId) return;

    try {
      setSaving(true);
      setErrorMessage(null);

      const { error } = await supabase.from(NOTIFICATION_RECEIVER_PREFERENCE_TABLE).upsert(
        {
          user_id: managerId,
          preferred_device_id: deviceId,
          preferred_device_label: deviceLabel,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      if (error) throw error;
      await loadStatus();
      alert('선택한 매니저 계정의 수신 기기를 지정했습니다.');
    } catch (error) {
      console.error('알림 기기 설정 저장 실패:', error);
      setErrorMessage('알림 수신 기기 저장에 실패했습니다. sql/026-admin-manager-notification-preference-access.sql 실행 여부를 확인해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  const clearPreference = async () => {
    if (!selectedManagerId) return;

    try {
      setSaving(true);
      setErrorMessage(null);

      const { error } = await supabase
        .from(NOTIFICATION_RECEIVER_PREFERENCE_TABLE)
        .delete()
        .eq('user_id', selectedManagerId);

      if (error) throw error;
      await loadStatus();
      alert('선택한 매니저 계정의 기기 지정이 해제되었습니다.');
    } catch (error) {
      console.error('알림 기기 설정 해제 실패:', error);
      setErrorMessage('알림 수신 기기 해제에 실패했습니다. sql/026-admin-manager-notification-preference-access.sql 실행 여부를 확인해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="알림 제어" activeTab="notification-control">
        <div className="flex items-center justify-center h-64">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-blue-500" />
          <p className="ml-4 text-gray-600">알림 제어 설정을 불러오는 중...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="알림 제어" activeTab="notification-control">
      <div className="max-w-6xl space-y-6">
        {errorMessage && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800">전역 알림 ON/OFF</h2>
          <p className="mt-2 text-sm text-gray-600">
            시스템 이상 시 즉시 OFF 하면 manager/manager1의 예약 실시간 알림 구독이 중단됩니다.
          </p>
          <div className="mt-4 flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50 p-4">
            <div>
              <p className="font-medium text-gray-800">현재 상태: {runtimeEnabled ? 'ON (활성)' : 'OFF (중지)'}</p>
              <p className="mt-1 text-xs text-gray-500">reservation_realtime_enabled 설정값 기준</p>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveRuntimeEnabled(!runtimeEnabled)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${runtimeEnabled ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
            >
              {runtimeEnabled ? '즉시 OFF' : '다시 ON'}
            </button>
          </div>
        </div>

        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h3 className="text-base font-semibold text-gray-800">매니저 계정 선택</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <select
              value={selectedManagerId}
              onChange={(event) => setSelectedManagerId(event.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              {managerAccounts.length === 0 && <option value="">표시할 매니저 계정 없음</option>}
              {managerAccounts.map((account) => (
                <option key={account.user_id} value={account.user_id}>
                  {accountLabel(account)} · {account.role || '-'}
                </option>
              ))}
            </select>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              선택 계정: <span className="font-semibold">{accountLabel(selectedManager)}</span>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-lg bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold text-gray-800">선택 계정의 저장된 수신 기기</h3>
            <div className="mt-4 space-y-3 rounded-lg border border-blue-100 bg-blue-50 p-4">
              <p className="text-sm text-gray-700">계정: <span className="font-semibold">{accountLabel(selectedManager)}</span></p>
              <p className="text-sm text-gray-700">선택 기기: <span className="font-semibold">{selectedManager?.preferred_device_label || '-'}</span></p>
              <p className="text-xs text-gray-500">기기 ID: {selectedManager?.preferred_device_id || '-'}</p>
              <p className="text-xs text-gray-500">최근 변경: {selectedManager?.preference_updated_at ? new Date(selectedManager.preference_updated_at).toLocaleString('ko-KR') : '-'}</p>
            </div>
            <button
              type="button"
              onClick={clearPreference}
              disabled={saving || !selectedManagerId}
              className="mt-4 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              선택 계정 기기 지정 해제
            </button>
          </div>

          <div className="rounded-lg bg-white p-6 shadow-sm">
            <h3 className="text-base font-semibold text-gray-800">선택 계정의 접속 탭</h3>
            {selectedActiveRows.length === 0 ? (
              <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                최근 90초 안에 감지된 접속 탭이 없습니다.
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {selectedActiveRows.map((row) => (
                  <button
                    key={`${row.app_name}-${row.tab_id}`}
                    type="button"
                    disabled={saving || !row.device_id}
                    onClick={() => void setReceiverDevice(row.user_id, row.device_id || '', row.device_label)}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 p-3 text-left text-sm transition-colors hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50"
                  >
                    <p className="font-semibold text-gray-800">{row.device_label || row.device_id}</p>
                    <p className="mt-1 text-xs text-gray-500">{row.app_name} · {row.is_leader ? '리더 탭' : '일반 탭'} · {row.last_seen ? new Date(row.last_seen).toLocaleTimeString('ko-KR') : '-'}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg bg-white p-6 shadow-sm">
          <h3 className="text-base font-semibold text-gray-800">전체 매니저 접속 탭 목록 (최근 90초)</h3>
          {activeRows.length === 0 ? (
            <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              현재 감지된 접속 탭이 없습니다.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-600">
                    <th className="px-3 py-2">계정</th>
                    <th className="px-3 py-2">역할</th>
                    <th className="px-3 py-2">앱</th>
                    <th className="px-3 py-2">기기</th>
                    <th className="px-3 py-2">탭 ID</th>
                    <th className="px-3 py-2">리더 탭</th>
                    <th className="px-3 py-2">최근 신호</th>
                    <th className="px-3 py-2">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRows.map((row) => {
                    const account = managerAccounts.find((item) => item.user_id === row.user_id) || null;
                    return (
                      <tr key={`${row.user_id}-${row.app_name}-${row.tab_id}`} className="border-b border-gray-100 text-gray-700">
                        <td className="px-3 py-2">{accountLabel(account)}</td>
                        <td className="px-3 py-2">{account?.role || '-'}</td>
                        <td className="px-3 py-2">{row.app_name}</td>
                        <td className="px-3 py-2">{row.device_label || row.device_id}</td>
                        <td className="px-3 py-2 font-mono text-xs">{row.tab_id}</td>
                        <td className="px-3 py-2">{row.is_leader ? '예' : '아니오'}</td>
                        <td className="px-3 py-2">{row.last_seen ? new Date(row.last_seen).toLocaleTimeString('ko-KR') : '-'}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            disabled={saving || !row.device_id}
                            onClick={() => void setReceiverDevice(row.user_id, row.device_id || '', row.device_label)}
                            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            이 기기로 지정
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}