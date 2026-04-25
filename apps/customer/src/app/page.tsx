import React from 'react';
import LoginPage from './login/page';
import HomeRedirector from '@/components/HomeRedirector';

export default function Page() {
    // Render the login page immediately.
    // Logged-in users will be redirected in the background.
    return (
        <>
            <HomeRedirector />
            <LoginPage />
        </>
    );
}
