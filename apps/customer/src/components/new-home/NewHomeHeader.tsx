import React from 'react';
import Link from 'next/link';

export default function NewHomeHeader() {
    return (
        <header
            className="w-full relative bg-[#0052cc] bg-cover bg-center"
            style={{ backgroundImage: "url('/images/index_15.gif')" }}
        >

            {/* Navigation Row (constrained on large screens) */}
            <div className="w-full">
                <div className="w-full max-w-[600px] mx-auto px-2 md:px-4 py-2">
                    <div className="flex w-full items-center justify-start">
                        <Link href="/">
                            <img
                                src="/images/logo.png"
                                width="723"
                                height="196"
                                alt="Home"
                                className="block w-auto h-auto max-h-[40px] object-contain cursor-pointer"
                            />
                        </Link>
                    </div>
                </div>
            </div>
        </header>
    );
}
