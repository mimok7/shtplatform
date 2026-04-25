"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ToastPayload, ToastType } from "@/lib/toast";

interface ToastItem extends ToastPayload {
    id: number;
}

const ICONS: Record<ToastType, string> = {
    info: "ℹ️",
    success: "✅",
    warning: "⚠️",
    error: "❌",
};

const BG: Record<ToastType, string> = {
    info: "#2563eb",
    success: "#16a34a",
    warning: "#ca8a04",
    error: "#dc2626",
};

let idSeq = 0;

export default function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const [isMounted, setIsMounted] = useState(false);
    const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const dismiss = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        const t = timers.current.get(id);
        if (t) { clearTimeout(t); timers.current.delete(id); }
    }, []);

    useEffect(() => {
        const handler = (e: Event) => {
            const payload = (e as CustomEvent<ToastPayload>).detail;
            const id = ++idSeq;
            const duration = payload.duration ?? 5000;

            setToasts((prev) => [...prev, { ...payload, id }]);

            if (duration > 0) {
                const timer = setTimeout(() => dismiss(id), duration);
                timers.current.set(id, timer);
            }
        };

        window.addEventListener("app:toast", handler);
        return () => window.removeEventListener("app:toast", handler);
    }, [dismiss]);

    useEffect(() => {
        return () => { timers.current.forEach((t) => clearTimeout(t)); };
    }, []);

    const containerStyle: React.CSSProperties = {
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 9998,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        width: "min(360px, 92vw)",
    };

    if (!isMounted || !document.body) {
        return children;
    }

    return (
        <>
            {children}
            {createPortal(
                <div aria-live="polite" style={containerStyle}>
                    {toasts.map((toast) => {
                        const type = toast.type ?? "info";
                        return (
                            <div
                                key={toast.id}
                                role="alert"
                                style={{
                                    display: "flex",
                                    alignItems: "flex-start",
                                    gap: 12,
                                    borderRadius: 12,
                                    boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
                                    color: "#fff",
                                    padding: "12px 16px",
                                    background: BG[type],
                                    fontFamily: "system-ui, -apple-system, sans-serif",
                                }}
                            >
                                <span style={{ fontSize: 18, lineHeight: 1, marginTop: 2, flexShrink: 0 }}>
                                    {ICONS[type]}
                                </span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ margin: 0, fontSize: 14, lineHeight: 1.4, wordBreak: "break-word" }}>
                                        {toast.message}
                                    </p>
                                    {toast.onRetry && (
                                        <button
                                            type="button"
                                            onClick={() => { toast.onRetry?.(); dismiss(toast.id); }}
                                            style={{
                                                marginTop: 6,
                                                fontSize: 12,
                                                fontWeight: 600,
                                                textDecoration: "underline",
                                                color: "#fff",
                                                background: "none",
                                                border: "none",
                                                cursor: "pointer",
                                                padding: 0,
                                                opacity: 0.9,
                                            }}
                                        >
                                            페이지 새로고침
                                        </button>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => dismiss(toast.id)}
                                    aria-label="닫기"
                                    style={{
                                        flexShrink: 0,
                                        background: "none",
                                        border: "none",
                                        color: "#fff",
                                        fontSize: 20,
                                        cursor: "pointer",
                                        lineHeight: 1,
                                        opacity: 0.7,
                                        padding: 0,
                                    }}
                                >
                                    ×
                                </button>
                            </div>
                        );
                    })}
                </div>,
                document.body
            )}
        </>
    );
}
