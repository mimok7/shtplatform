'use client';

import { useEffect, useRef, useState } from 'react';
import supabase from '@/lib/supabase';
import { getNotificationDeviceLabel, getOrCreateNotificationDeviceId, NOTIFICATION_RECEIVER_PREFERENCE_TABLE } from '@/lib/notificationReceiverDevice';

const LEADER_STALE_MS = 12000;
const LEADER_HEARTBEAT_MS = 4000;
const PRESENCE_HEARTBEAT_MS = 5000;
const NOTIFICATION_RUNTIME_SETTINGS_TABLE = 'notification_runtime_settings';
const RESERVATION_RUNTIME_SETTING_KEY = 'reservation_realtime_enabled';
const NOTIFICATION_SOURCE_APP = 'manager1';
const UPSERT_NOTIFICATION_PRESENCE_RPC = 'upsert_manager_notification_presence';
const DELETE_NOTIFICATION_PRESENCE_RPC = 'delete_manager_notification_presence';

type ReservationPayload = {
  re_id?: string;
  re_type?: string;
  re_status?: string;
  re_created_at?: string;
};

type ReservationNotification = {
  id: string;
  type: string;
  status: string;
  createdAt: string;
};

function normalizeReservation(payload: ReservationPayload): ReservationNotification | null {
  if (!payload?.re_id) return null;
  return {
    id: payload.re_id,
    type: payload.re_type || 'reservation',
    status: payload.re_status || 'pending',
    createdAt: payload.re_created_at || new Date().toISOString(),
  };
}

function playNotificationTone() {
  if (typeof window === 'undefined') return;
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;

  try {
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gainNode.gain.setValueAtTime(0.0001, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);

    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.35);
    oscillator.onended = () => {
      void context.close().catch(() => undefined);
    };
  } catch {
    // 브라우저 자동재생 정책 등으로 실패할 수 있으므로 무시한다.
  }
}

function showBrowserNotification(notification: ReservationNotification) {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;

  try {
    const browserNotification = new Notification('새 예약이 접수되었습니다', {
      body: `${notification.type} 예약이 들어왔습니다. 상태: ${notification.status}`,
      icon: '/logo.png',
      tag: `reservation-${notification.id}`,
      requireInteraction: false,
      silent: false,
    });

    browserNotification.onclick = () => {
      window.focus();
      browserNotification.close();
    };
  } catch {
    // 일부 모바일 브라우저는 생성 시 예외가 날 수 있으므로 무시한다.
  }
}

function buildLeaderKey(scope: string) {
  return `manager1:reservation-notification-leader:${scope}`;
}

function readLeader(lockKey: string): { tabId: string; updatedAt: number } | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(lockKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { tabId?: string; updatedAt?: number };
    if (!parsed?.tabId || typeof parsed.updatedAt !== 'number') return null;
    return { tabId: parsed.tabId, updatedAt: parsed.updatedAt };
  } catch {
    return null;
  }
}

function writeLeader(lockKey: string, tabId: string) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(lockKey, JSON.stringify({ tabId, updatedAt: Date.now() }));
  } catch {
    // noop
  }
}

function removeLeader(lockKey: string, tabId: string) {
  if (typeof window === 'undefined') return;

  try {
    const leader = readLeader(lockKey);
    if (leader?.tabId === tabId) {
      window.localStorage.removeItem(lockKey);
    }
  } catch {
    // noop
  }
}

export function useReservationListener(enabled: boolean, leaderScope: string) {
  const [latestReservation, setLatestReservation] = useState<ReservationNotification | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isCurrentDevicePreferred, setIsCurrentDevicePreferred] = useState(true);
  const [isRuntimeEnabled, setIsRuntimeEnabled] = useState(true);
  const lastSeenReservationIdRef = useRef<string | null>(null);
  const clearToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<any>(null);
  const tabIdRef = useRef(`tab-${Math.random().toString(36).slice(2)}-${Date.now()}`);
  const leaderHeartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const preferenceChannelRef = useRef<any>(null);
  const deviceIdRef = useRef('server');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      deviceIdRef.current = getOrCreateNotificationDeviceId();
    }
  }, []);

  useEffect(() => {
    if (!enabled || !leaderScope) return;

    let cancelled = false;
    const lockKey = buildLeaderKey(leaderScope || 'default');
    const deviceLabel = getNotificationDeviceLabel();

    const syncPresence = async () => {
      if (cancelled) return;
      const leader = readLeader(lockKey);
      const now = Date.now();
      const isLeader = !!leader && leader.tabId === tabIdRef.current && now - leader.updatedAt <= LEADER_STALE_MS;

      try {
        const { error } = await supabase.rpc(UPSERT_NOTIFICATION_PRESENCE_RPC, {
          p_app_name: NOTIFICATION_SOURCE_APP,
          p_tab_id: tabIdRef.current,
          p_device_id: deviceIdRef.current,
          p_device_label: deviceLabel,
          p_is_leader: isLeader,
        });
        if (error) {
          console.warn('알림 접속 상태 저장 실패:', error.message);
        }
      } catch (error) {
        console.warn('알림 접속 상태 저장 예외:', error);
      }
    };

    const clearPresence = async () => {
      try {
        const { error } = await supabase.rpc(DELETE_NOTIFICATION_PRESENCE_RPC, {
          p_app_name: NOTIFICATION_SOURCE_APP,
          p_tab_id: tabIdRef.current,
        });
        if (error) {
          console.warn('알림 접속 상태 삭제 실패:', error.message);
        }
      } catch (error) {
        console.warn('알림 접속 상태 삭제 예외:', error);
      }
    };

    const handleBeforeUnload = () => {
      void clearPresence();
    };

    void syncPresence();
    const timer = window.setInterval(() => {
      void syncPresence();
    }, PRESENCE_HEARTBEAT_MS);

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      cancelled = true;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.clearInterval(timer);
      void clearPresence();
    };
  }, [enabled, leaderScope, isCurrentDevicePreferred, isRuntimeEnabled]);

  useEffect(() => {
    let cancelled = false;
    const channel = supabase
      .channel('manager1-notification-runtime-setting')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: NOTIFICATION_RUNTIME_SETTINGS_TABLE,
          filter: `setting_key=eq.${RESERVATION_RUNTIME_SETTING_KEY}`,
        },
        (payload) => {
          if (cancelled) return;
          if (payload.eventType === 'DELETE') {
            setIsRuntimeEnabled(true);
            return;
          }

          const nextValue = (payload.new as { setting_value_bool?: boolean } | null)?.setting_value_bool;
          setIsRuntimeEnabled(nextValue !== false);
        }
      )
      .subscribe();

    const loadRuntimeSetting = async () => {
      try {
        const { data, error } = await supabase
          .from(NOTIFICATION_RUNTIME_SETTINGS_TABLE)
          .select('setting_value_bool')
          .eq('setting_key', RESERVATION_RUNTIME_SETTING_KEY)
          .maybeSingle();

        if (cancelled || error) return;
        setIsRuntimeEnabled(data?.setting_value_bool !== false);
      } catch {
        // 설정 테이블 미적용 시 기본값(true) 유지
      }
    };

    void loadRuntimeSetting();

    return () => {
      cancelled = true;
      try {
        void supabase.removeChannel?.(channel);
      } catch {
        try {
          channel.unsubscribe();
        } catch {
          // noop
        }
      }
    };
  }, []);

  useEffect(() => {
    if (!enabled || !isRuntimeEnabled) return;

    let cancelled = false;
    const lockKey = buildLeaderKey(leaderScope || 'default');

    const stopRealtimeSubscription = () => {
      const activeChannel = channelRef.current;
      if (!activeChannel) return;

      try {
        void supabase.removeChannel?.(activeChannel);
      } catch {
        try {
          activeChannel.unsubscribe();
        } catch {
          // noop
        }
      }

      channelRef.current = null;
    };

    const stopLeadership = () => {
      if (leaderHeartbeatRef.current) {
        clearInterval(leaderHeartbeatRef.current);
        leaderHeartbeatRef.current = null;
      }
      removeLeader(lockKey, tabIdRef.current);
      stopRealtimeSubscription();
    };

    const stopPreferenceSubscription = () => {
      const preferenceChannel = preferenceChannelRef.current;
      if (!preferenceChannel) return;

      try {
        void supabase.removeChannel?.(preferenceChannel);
      } catch {
        try {
          preferenceChannel.unsubscribe();
        } catch {
          // noop
        }
      }

      preferenceChannelRef.current = null;
    };

    const startRealtimeSubscription = () => {
      if (channelRef.current) return;

      channelRef.current = supabase
        .channel('manager1-new-reservations')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'reservation',
          },
          (payload) => {
            if (cancelled) return;

            const notification = normalizeReservation(payload.new as ReservationPayload);
            if (!notification) return;
            if (lastSeenReservationIdRef.current === notification.id) return;

            lastSeenReservationIdRef.current = notification.id;
            setLatestReservation(notification);
            setUnreadCount((prev) => prev + 1);
            playNotificationTone();
            showBrowserNotification(notification);

            if (clearToastTimerRef.current) {
              clearTimeout(clearToastTimerRef.current);
            }

            clearToastTimerRef.current = setTimeout(() => {
              if (!cancelled) {
                setLatestReservation(null);
              }
            }, 6000);
          }
        )
        .subscribe();
    };

    const claimLeadership = () => {
      writeLeader(lockKey, tabIdRef.current);
      startRealtimeSubscription();

      if (!leaderHeartbeatRef.current) {
        leaderHeartbeatRef.current = setInterval(() => {
          writeLeader(lockKey, tabIdRef.current);
        }, LEADER_HEARTBEAT_MS);
      }
    };

    const tryBecomeLeader = () => {
      if (cancelled || typeof window === 'undefined') return;

      if (!isCurrentDevicePreferred) {
        if (leaderHeartbeatRef.current) {
          clearInterval(leaderHeartbeatRef.current);
          leaderHeartbeatRef.current = null;
        }
        stopRealtimeSubscription();
        return;
      }

      const leader = readLeader(lockKey);
      const now = Date.now();
      const isLeaderMissing = !leader || now - leader.updatedAt > LEADER_STALE_MS;
      const isCurrentLeader = leader?.tabId === tabIdRef.current;

      if (isCurrentLeader || isLeaderMissing) {
        claimLeadership();
        return;
      }

      if (leaderHeartbeatRef.current) {
        clearInterval(leaderHeartbeatRef.current);
        leaderHeartbeatRef.current = null;
      }
      stopRealtimeSubscription();
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === lockKey) {
        tryBecomeLeader();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (!isCurrentDevicePreferred) return;
        // 현재 보이는 탭이 즉시 알림을 받도록 리더를 재선점한다.
        claimLeadership();
      }
    };

    const handleBeforeUnload = () => {
      stopLeadership();
    };

    const applyPreference = (preferredDeviceId: string | null) => {
      const isPreferred = !preferredDeviceId || preferredDeviceId === deviceIdRef.current;
      setIsCurrentDevicePreferred(isPreferred);
      if (!isPreferred) {
        stopLeadership();
      } else {
        tryBecomeLeader();
      }
    };

    const loadPreference = async () => {
      if (!leaderScope) {
        setIsCurrentDevicePreferred(true);
        return;
      }

      try {
        const { data, error } = await supabase
          .from(NOTIFICATION_RECEIVER_PREFERENCE_TABLE)
          .select('preferred_device_id')
          .eq('user_id', leaderScope)
          .maybeSingle();

        if (cancelled) return;
        if (error) {
          setIsCurrentDevicePreferred(true);
          return;
        }

        applyPreference(data?.preferred_device_id || null);
      } catch {
        if (!cancelled) {
          setIsCurrentDevicePreferred(true);
        }
      }
    };

    const startPreferenceSubscription = () => {
      if (!leaderScope || preferenceChannelRef.current) return;

      preferenceChannelRef.current = supabase
        .channel(`manager1-notification-preference-${leaderScope}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: NOTIFICATION_RECEIVER_PREFERENCE_TABLE,
            filter: `user_id=eq.${leaderScope}`,
          },
          (payload) => {
            if (cancelled) return;
            if (payload.eventType === 'DELETE') {
              applyPreference(null);
              return;
            }

            const nextDeviceId = (payload.new as { preferred_device_id?: string } | null)?.preferred_device_id || null;
            applyPreference(nextDeviceId);
          }
        )
        .subscribe();
    };

    if (typeof window !== 'undefined' && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission().catch(() => undefined);
    }

    void loadPreference();
    startPreferenceSubscription();
    window.addEventListener('storage', handleStorage);
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const fallbackLeaderCheck = window.setInterval(tryBecomeLeader, LEADER_HEARTBEAT_MS);

    return () => {
      cancelled = true;
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(fallbackLeaderCheck);
      if (clearToastTimerRef.current) {
        clearTimeout(clearToastTimerRef.current);
        clearToastTimerRef.current = null;
      }
      stopPreferenceSubscription();
      stopLeadership();
    };
  }, [enabled, isCurrentDevicePreferred, isRuntimeEnabled, leaderScope]);

  const clearLatestReservation = () => {
    setLatestReservation(null);
  };

  return {
    latestReservation,
    unreadCount,
    clearLatestReservation,
    currentDeviceId: deviceIdRef.current,
    currentDeviceLabel: getNotificationDeviceLabel(),
    isCurrentDevicePreferred,
    isRuntimeEnabled,
  };
}