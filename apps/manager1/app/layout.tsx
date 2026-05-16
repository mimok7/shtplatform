import React from 'react';
import '../styles/globals.css';
import ConsoleErrorOnly from '@/components/ConsoleErrorOnly';
import TabSessionGuard from '@/components/TabSessionGuard';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import PushNotificationManager from '@/components/PushNotificationManager';

export const metadata = {
  title: '스테이하롱 - 쿽매니저',
  description: '스테이하롱 즐겨찾기 빠른 운영 패널',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-192.png',
    shortcut: '/icon-192.png',
    apple: '/icon-192.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="bg-background text-foreground">
        <ServiceWorkerRegister />
        <PushNotificationManager />
        <ConsoleErrorOnly />
        <TabSessionGuard loginPath="/login" />
        <main className="w-full">{children}</main>
      </body>
    </html>
  );
}
