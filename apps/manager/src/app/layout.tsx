import React from 'react';
import '../styles/globals.css';
import Header from '@/components/Header';
import AlertProvider from '@/components/AlertProvider';
import GlobalNotificationWrapper from '@/components/GlobalNotificationWrapper';
import AuthInitializer from '@/components/AuthInitializer';
import QueryProvider from '@/components/QueryProvider';

export const metadata = {
  title: '스테이하롱 예약',
  description: '스테이하롱 자유여행 예약 시스템',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/logo.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-background text-foreground">
        <QueryProvider>
          <AlertProvider siteName="스테이 하롱 트레블">
            <AuthInitializer />
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
