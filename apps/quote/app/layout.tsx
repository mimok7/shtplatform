import React from 'react';
import { Inter } from 'next/font/google';
import NewHomeHeader from '../components/new-home/NewHomeHeader';
import NewHomeFooter from '../components/new-home/NewHomeFooter';
import AlertProvider from '../components/AlertProvider';
import AuthInitializer from '../components/AuthInitializer';
import TabSessionGuard from '../components/TabSessionGuard';
import QueryProvider from '../components/QueryProvider';
import ServiceWorkerRegister from './components/ServiceWorkerRegister';
import PushNotificationManager from './components/PushNotificationManager';
import '../styles/globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'SHT Quote',
  description: '스테이하롱 견적 시스템',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className={`${inter.className} bg-white text-gray-900 antialiased flex flex-col min-h-screen`}>
        <ServiceWorkerRegister />
        <PushNotificationManager />
        <QueryProvider>
          <AlertProvider>
            <AuthInitializer />
            <TabSessionGuard loginPath="/login" />
            <NewHomeHeader />
            <main className="flex-1 w-full">
              {children}
            </main>
            <NewHomeFooter />
          </AlertProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
