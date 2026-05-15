import React from 'react';
import '../styles/globals.css';
import TabSessionGuard from '@/components/TabSessionGuard';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';

export const metadata = {
    title: '스테이하롱 - 파트너',
    description: '스테이하롱 제휴업체 예약 시스템',
    manifest: '/manifest.json',
    icons: {
        icon: '/sht-partner.png',
        shortcut: '/sht-partner.png',
        apple: '/sht-partner.png',
    },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="ko">
            <body className="bg-background text-foreground">
                <ServiceWorkerRegister />
                <TabSessionGuard loginPath="/partner/login" />
                {children}
            </body>
        </html>
    );
}
