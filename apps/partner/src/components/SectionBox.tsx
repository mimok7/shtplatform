'use client';

import React from 'react';

export default function SectionBox({
    title,
    icon,
    children,
}: {
    title?: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="p-4 bg-white border border-gray-200 rounded mb-4 shadow-sm">
            {(title || icon) && (
                <h3 className="font-medium text-sm mb-2 flex items-center gap-1 text-gray-700">
                    {icon}
                    {title}
                </h3>
            )}
            <div className="space-y-3">{children}</div>
        </div>
    );
}
