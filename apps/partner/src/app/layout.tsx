import React from 'react';
import '../styles/globals.css';

export const metadata = {
    title: '스테이하롱 제휴업체',
    description: '스테이하롱 제휴업체 예약 시스템',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="ko">
            <body className="bg-background text-foreground">
                {children}
            </body>
        </html>
    );
}
