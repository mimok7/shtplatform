import './../styles/globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
    title: '예약 취소 신청 | Stay Halong',
    description: '스테이하롱 예약 취소 전용 페이지',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="ko">
            <body className="bg-background text-foreground antialiased flex flex-col min-h-screen">
                <header
                    className="w-full relative bg-[#0052cc] bg-cover bg-center"
                    style={{ backgroundImage: "url('/images/index_15.gif')" }}
                >
                    <div className="w-full">
                        <div className="w-full max-w-[600px] mx-auto px-2 md:px-4 py-2">
                            <div className="flex w-full items-center justify-start">
                                <Link href="/">
                                    <img
                                        src="/images/logo.png"
                                        width="723"
                                        height="196"
                                        alt="Home"
                                        className="block w-auto h-auto max-h-[40px] object-contain cursor-pointer"
                                    />
                                </Link>
                            </div>
                        </div>
                    </div>
                </header>
                <main className="flex-1 w-full">{children}</main>
                <footer className="w-full bg-white pb-6 border-t border-gray-100">
                    <div className="w-full max-w-[600px] mx-auto px-4 mt-6">
                        <div className="w-full flex justify-start opacity-80">
                            <img
                                src="/images/index_16.gif"
                                alt="Footer Logos"
                                className="block w-full h-auto object-contain"
                            />
                        </div>
                    </div>
                </footer>
            </body>
        </html>
    );
}
