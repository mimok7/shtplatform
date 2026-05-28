import './../styles/globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: '예약 취소 신청 | Stay Halong',
    description: '스테이하롱 예약 취소 전용 페이지',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="ko">
            <body className="min-h-screen bg-gray-50 text-gray-900">
                <header className="border-b bg-white">
                    <div className="mx-auto flex max-w-3xl items-center justify-between p-4">
                        <a href="/" className="font-bold">예약 취소 신청</a>
                        <span className="text-xs text-gray-500">cancel.stayhalong.com</span>
                    </div>
                </header>
                <main className="mx-auto max-w-3xl p-4">{children}</main>
                <footer className="mx-auto max-w-3xl p-4 text-center text-xs text-gray-400">
                    © Stay Halong — 본 페이지는 예약 취소 전용입니다.
                </footer>
            </body>
        </html>
    );
}
