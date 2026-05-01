import React from 'react';
import { Inter } from 'next/font/google';
import NewHomeHeader from '../components/new-home/NewHomeHeader';
import NewHomeFooter from '../components/new-home/NewHomeFooter';
import AlertProvider from '../components/AlertProvider';
import AuthInitializer from '../components/AuthInitializer';
import QueryProvider from '../components/QueryProvider';
import '../styles/globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'SHT Quote',
  description: '스테이하롱 견적 시스템',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className={`${inter.className} bg-white text-gray-900 antialiased flex flex-col min-h-screen`}>
        <QueryProvider>
          <AlertProvider>
            <AuthInitializer />
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
