import React from 'react';
import { Inter } from 'next/font/google';
import NewHomeHeader from '../components/new-home/NewHomeHeader';
import NewHomeFooter from '../components/new-home/NewHomeFooter';
import AlertProvider from '../components/AlertProvider';
import ToastProvider from '../components/ToastProvider';
import AuthInitializer from '../components/AuthInitializer';
import QueryProvider from '../components/QueryProvider';
import '../styles/globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'SHT Customer',
  description: 'SHT Customer Portal',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className={`${inter.className} bg-background text-foreground antialiased flex flex-col min-h-screen`}>
        <QueryProvider>
          <AlertProvider>
            <ToastProvider>
              <AuthInitializer />
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
