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
import '@sht/ui/theme.css';
import { ShtThemeProvider } from '@sht/ui/theme';

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
    icon: '/sht-2.png',
    shortcut: '/sht-2.png',
    apple: '/sht-2.png',
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
        <ShtThemeProvider appId="customer">
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
        </ShtThemeProvider>
      </body>
    </html>
  );
}
