import React from 'react';
import '../styles/globals.css';
import Header from '@/components/Header';
import AlertProvider from '@/components/AlertProvider';
import GlobalNotificationWrapper from '@/components/GlobalNotificationWrapper';
import AuthInitializer from '@/components/AuthInitializer';
import TabSessionGuard from '@/components/TabSessionGuard';
import QueryProvider from '@/components/QueryProvider';
import ConsoleErrorOnly from '@/components/ConsoleErrorOnly';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';

export const metadata = {
  title: '스테이하롱 - 매니저',
  description: '스테이하롱 예약 관리 시스템',
  manifest: '/manifest.json',
  icons: {
    icon: '/sht-manager.png',
    shortcut: '/sht-manager.png',
    apple: '/sht-manager.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="bg-background text-foreground">
        <ServiceWorkerRegister />
        <ConsoleErrorOnly />
        <QueryProvider>
          <AlertProvider siteName="스테이 하롱 트레블">
            <AuthInitializer />
            <TabSessionGuard loginPath="/login" />
            {/* ✅ 머릿글 */}
            <Header />

            {/* ✅ 본문: 전체 너비 사용 (페이지별 레이아웃에서 여백 처리) */}
            <main className="w-full">{children}</main>

            {/* ✅ 전역 알림 팝업 */}
            <GlobalNotificationWrapper />
          </AlertProvider>
        </QueryProvider>
      </body>
    </html>
  );
}

