import React from 'react';
import type { Metadata, Viewport } from 'next';
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

export const metadata: Metadata = {
  title: '스테이하롱 - 고객예약',
  description: '스테이하롱 크루즈 예약 시스템',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: '스하고객',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: ['/icon-192.png'],
    apple: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#1f3a93',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className={`${inter.className} bg-slate-100 text-foreground antialiased flex flex-col min-h-screen`}>
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
