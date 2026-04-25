/**
 * 앱 내 토스트 알림 디스패처
 * CustomEvent 기반 → ToastProvider 가 리스닝
 */
export type ToastType = 'info' | 'warning' | 'error' | 'success';

export interface ToastPayload {
    message: string;
    type?: ToastType;
    /** 자동 닫힘 대기 시간(ms). 0 이면 수동 닫기만 가능. 기본 5000 */
    duration?: number;
    /** "다시 시도" 버튼 클릭 시 실행할 콜백 */
    onRetry?: () => void;
}

export function showToast(payload: ToastPayload | string): void {
    if (typeof window === 'undefined') return;
    const detail: ToastPayload =
        typeof payload === 'string' ? { message: payload } : payload;
    window.dispatchEvent(new CustomEvent('app:toast', { detail }));
}
