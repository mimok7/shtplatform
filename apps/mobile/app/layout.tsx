import type { Metadata, Viewport } from "next";
import "./globals.css";
import AuthGate from './_components/AuthGate';

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "스테이하롱 모바일",
  description: "스테이하롱 예약 관리 모바일",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "스테이하롱",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/logo-160.png",
    apple: "/logo-160.png",
    other: [
      {
        rel: "icon",
        url: "/logo-160.png",
      },
      {
        rel: "apple-touch-icon",
        url: "/logo-160.png",
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
      <body className="mobile-ui bg-gray-50 text-gray-900 antialiased">
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
