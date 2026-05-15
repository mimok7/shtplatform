import React from 'react';
import { Inter } from 'next/font/google';
import NewHomeHeader from '../components/new-home/NewHomeHeader';
import NewHomeFooter from '../components/new-home/NewHomeFooter';
import AlertProvider from '../components/AlertProvider';
import ToastProvider from '../components/ToastProvider';
import AuthInitializer from '../components/AuthInitializer';
import TabSessionGuard from '../components/TabSessionGuard';
import QueryProvider from '../components/QueryProvider';
import ServiceWorkerRegister from '../components/ServiceWorkerRegister';
import PushNotificationManager from '../components/PushNotificationManager';
import '../styles/globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: '스테이하롱 - 고객예약',
  description: '스테이하롱 크루즈 예약 시스템',
  manifest: '/manifest.json',
  icons: {
    icon: '/sht-customer.png',
    shortcut: '/sht-customer.png',
    apple: '/sht-customer.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className={`${inter.className} bg-background text-foreground antialiased flex flex-col min-h-screen`}>
        <ServiceWorkerRegister />
        <PushNotificationManager />
        <QueryProvider>
          <AlertProvider>
            <ToastProvider>
              <AuthInitializer />
              <TabSessionGuard loginPath="/login" />
              <NewHomeHeader />
              <main className="flex-1 w-full">
                {children}
              </main>
              <NewHomeFooter />
            </ToastProvider>
          </AlertProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
