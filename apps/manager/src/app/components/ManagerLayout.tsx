import React from 'react';

export default function ManagerLayout({ children, title, activeTab }: { children: React.ReactNode; title?: string; activeTab?: string }) {
  return (
    <div className="manager-layout">
      {title && <div className="mb-4 text-sm text-gray-600">{title}</div>}
      {children}
    </div>
  );
}

