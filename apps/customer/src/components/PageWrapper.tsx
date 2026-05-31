import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Home } from 'lucide-react';

interface PageWrapperProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  actions?: React.ReactNode;
}

export default function PageWrapper({ children, title, description, actions }: PageWrapperProps) {
  const router = useRouter();

  return (
    <div className="max-w-7xl mx-auto">
      {(title || description) && (
        <>
          {/* 모바일 앱과 동일한 헤더 */}
          <div className="bg-white border-b border-black shadow-sm px-3 py-3 sticky top-0 z-40">
          <div className="flex items-center gap-2">
              <button
                onClick={() => router.back()}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition flex-shrink-0"
                aria-label="뒤로가기"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <h1 className="text-base font-bold text-gray-800 flex-1 text-center">{title}</h1>
              <button
                onClick={() => router.push('/mypage')}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition flex-shrink-0"
                aria-label="홈"
              >
                <Home className="w-5 h-5 text-gray-600" />
              </button>
            </div>
          </div>
          
          {description && (
            <div className="px-4 sm:px-6 lg:px-8 py-2">
              <p className="text-sm text-gray-600">{description}</p>
            </div>
          )}
          
          {actions && (
            <div className="px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-2">
              {actions}
            </div>
          )}
        </>
      )}
      
      <main className="px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
