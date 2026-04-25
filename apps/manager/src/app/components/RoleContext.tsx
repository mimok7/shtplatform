'use client';
import React from 'react';

export type AppRole = 'guest' | 'member' | 'manager' | 'admin' | null;

export interface RoleContextValue {
    role: AppRole;
    user: any;
    setRole?: (r: AppRole) => void;
}

export const RoleContext = React.createContext<RoleContextValue>({ role: null, user: null });

export const useRole = () => React.useContext(RoleContext);
