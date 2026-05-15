import React from 'react';
import { Inter } from 'next/font/google';
import AlertProvider from '../components/AlertProvider';
import QueryProvider from '../components/QueryProvider';
import TabSessionGuard from '../components/TabSessionGuard';
import ServiceWorkerRegister from '../components/ServiceWorkerRegister';
import '../styles/globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: '스테이하롱 - 주문조회',
  description: '스테이하롱 예약 확인 시스템',
  manifest: '/manifest.json',
  icons: {
    icon: '/sht-oldcustomer.png',
    shortcut: '/sht-oldcustomer.png',
    apple: '/sht-oldcustomer.png',
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
        <QueryProvider>
          <AlertProvider>
            <TabSessionGuard loginPath="/login" />
            <main className="flex-1 w-full">
              {children}
            </main>
          </AlertProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
