import React from 'react';

export default function Head() {
    return (
        <>
            {/* 기본 아이콘들: 우선순위 순서로 브라우저에 의해 사용됩니다 */}
            <link rel="icon" href="/favicon.ico" />
            <link rel="icon" type="image/png" sizes="32x32" href="/favicon.png" />
            <link rel="shortcut icon" href="/favicon.ico" />

            {/* 애플 터치 아이콘 및 고해상도 아이콘 */}
            <link rel="apple-touch-icon" sizes="180x180" href="/logo-160.png" />
            <link rel="icon" type="image/png" sizes="160x160" href="/logo-160.png" />

            {/* 전체 로고는 예비용으로도 등록 */}
            <link rel="manifest" href="/site.webmanifest" />
            <meta name="theme-color" content="#ffffff" />
        </>
    );
}
