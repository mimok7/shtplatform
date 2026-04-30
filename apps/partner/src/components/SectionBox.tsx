'use client';

import React from 'react';

export default function SectionBox({
    title,
    icon,
    actions,
    padding = true,
    children,
}: {
    title?: string;
    icon?: React.ReactNode;
    actions?: React.ReactNode;
    padding?: boolean;
    children: React.ReactNode;
}) {
    return (
        <section className="bg-white/80 backdrop-blur-sm border border-gray-200/70 rounded-2xl shadow-sm shadow-gray-200/50 mb-4 overflow-hidden">
            {(title || icon || actions) && (
                <header className="flex items-center justify-between gap-3 px-4 lg:px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-gray-50/50 to-white">
                    <div className="flex items-center gap-2 min-w-0">
                        {icon && <span className="text-gray-500 flex-shrink-0">{icon}</span>}
                        {title && (
                            <h3 className="text-sm font-semibold text-gray-800 truncate">{title}</h3>
                        )}
                    </div>
                    {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
                </header>
            )}
            <div className={padding ? 'px-4 lg:px-5 py-4 space-y-3' : ''}>{children}</div>
        </section>
    );
}
