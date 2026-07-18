import React from 'react';
import '../styles/globals.css';
import '@sht/ui/theme.css';
import { ShtThemeProvider } from '@sht/ui/theme';
import TabSessionGuard from '@/components/TabSessionGuard';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import PushNotificationManager from '@/components/PushNotificationManager';

export const metadata = {
    title: '스테이하롱 - 파트너',
    description: '스테이하롱 제휴업체 예약 시스템',
    manifest: '/manifest.json',
    icons: {
        icon: '/icon-192.png',
        shortcut: '/icon-192.png',
        apple: '/icon-192.png',
    },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="ko">
            <body className="bg-background text-foreground">
                <ShtThemeProvider appId="partner">
                    <ServiceWorkerRegister />
                    <PushNotificationManager />
                    <TabSessionGuard loginPath="/partner/login" />
                    {children}
                </ShtThemeProvider>
            </body>
        </html>
    );
}
