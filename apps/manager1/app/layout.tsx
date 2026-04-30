import React from 'react';
import '../styles/globals.css';

export const metadata = {
  title: '스테이하롱 퀵매니저',
  description: '스테이하롱 즐겨찾기 빠른 운영 패널',
  icons: {
    icon: '/logo.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-background text-foreground">
        <main className="w-full">{children}</main>
      </body>
    </html>
  );
}
