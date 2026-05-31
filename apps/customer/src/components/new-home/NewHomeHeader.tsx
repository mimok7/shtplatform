import React from 'react';

export default function NewHomeHeader() {
    return (
        <header className="sticky top-0 z-10 w-full border-b border-slate-300 bg-white">
            <div className="w-full max-w-[600px] mx-auto px-3 py-3 flex items-center justify-between">
                <img
                    src="/images/logo.png"
                    width="723"
                    height="196"
                    alt="Logo"
                    className="w-auto h-auto max-h-[32px] object-contain"
                />
            </div>
        </header>
    );
}
