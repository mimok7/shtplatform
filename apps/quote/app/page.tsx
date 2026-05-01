import React from 'react';
import SignupPage from './signup/page';
import HomeRedirector from '@/components/HomeRedirector';

export default function Page() {
    // Render the signup page immediately (quote system).
    // Logged-in users will be redirected in the background.
    return (
        <>
            <HomeRedirector />
            <SignupPage />
        </>
    );
}
