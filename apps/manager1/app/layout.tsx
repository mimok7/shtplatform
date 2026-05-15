import React from 'react';
import '../styles/globals.css';
import ConsoleErrorOnly from '@/components/ConsoleErrorOnly';
import TabSessionGuard from '@/components/TabSessionGuard';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';

export const metadata = {
  title: '스테이하롱 - 쿽매니저',
  description: '스테이하롱 즐겨찾기 빠른 운영 패널',
  manifest: '/manifest.json',
  icons: {
    icon: '/sht-manag.png',
    shortcut: '/sht-manag.png',
    apple: '/sht-manag.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="bg-background text-foreground">
        <ServiceWorkerRegister />
        <ConsoleErrorOnly />
        <TabSessionGuard loginPath="/login" />
        <main className="w-full">{children}</main>
      </body>
    </html>
  );
}
