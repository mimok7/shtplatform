import React from 'react';

export default function Spinner({ label }: { label?: string }) {
    return (
        <div className="flex flex-col justify-center items-center h-64">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500" />
            {label && <p className="mt-3 text-sm text-gray-600">{label}</p>}
        </div>
    );
}
