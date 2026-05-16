import type { Metadata, Viewport } from "next";
import "./globals.css";
import AuthGate from './_components/AuthGate';
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import PushNotificationManager from '@/components/PushNotificationManager';

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
    icon: "/icon-192.png",
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
      <body className="mobile-ui bg-gray-50 text-gray-900 antialiased">
        <ServiceWorkerRegister />
        <PushNotificationManager />
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
