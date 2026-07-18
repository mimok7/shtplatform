import type { Metadata, Viewport } from "next";
import "./globals.css";
import "@sht/ui/theme.css";
import { ShtThemeProvider } from "@sht/ui/theme";
import AuthGate from './_components/AuthGate';

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "스하모바일",
  description: "스하모바일 예약 관리 모바일",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "스하모바일",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/icon-192.png",
    apple: "/icon-192.png",
    other: [
      {
        rel: "icon",
        url: "/icon-192.png",
      },
      {
        rel: "apple-touch-icon",
        url: "/icon-192.png",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="mobile-ui bg-slate-100 text-gray-900 antialiased">
        <ShtThemeProvider appId="mobile">
          {/* 글로벌 로고 헤더 */}
          <header className="sticky top-0 z-50 bg-white border-b border-gray-300 px-3 py-2">
            <img
              src="/logo.png"
              alt="스테이하롱 로고"
              style={{ height: '24px', width: 'auto' }}
            />
          </header>

          <AuthGate>{children}</AuthGate>
        </ShtThemeProvider>
      </body>
    </html>
  );
}
