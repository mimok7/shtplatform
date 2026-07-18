import React from 'react';
import '../styles/globals.css';
import '@sht/ui/theme.css';
import { ShtThemeProvider } from '@sht/ui/theme';
import AlertProvider from '@/components/AlertProvider';
import AuthInitializer from '@/components/AuthInitializer';
import TabSessionGuard from '@/components/TabSessionGuard';
import QueryProvider from '@/components/QueryProvider';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import PushNotificationManager from '@/components/PushNotificationManager';

export const metadata = {
  title: '스테이하롱 관리자',
  description: '스테이하롱 관리자 전용 시스템',
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
      <body className="bg-background text-foreground" suppressHydrationWarning>
        <ShtThemeProvider appId="admin">
          <ServiceWorkerRegister />
          <PushNotificationManager />
          <QueryProvider>
            <AlertProvider siteName="스테이 하롱 관리자">
              <AuthInitializer />
              <TabSessionGuard loginPath="/login" />
              <main className="w-full">{children}</main>
            </AlertProvider>
          </QueryProvider>
        </ShtThemeProvider>
      </body>
    </html>
  );
}
