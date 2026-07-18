'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from './cn';

export interface NavItem {
  href: string;
  label: string;
  icon?: ReactNode;
}

export interface AppShellProps {
  brand: string;
  nav: NavItem[];
  rightSlot?: ReactNode;
  children: ReactNode;
}

export function AppShell({ brand, nav, rightSlot, children }: AppShellProps) {
  const pathname = usePathname() || '/';
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-base font-semibold text-gray-700">
              {brand}
            </Link>
            <nav className="hidden gap-3 md:flex">
              {nav.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href as never}
                    data-sht-menu="main"
                    className={cn(
                      'rounded px-3 py-1.5 text-sm transition',
                      active
                        ? 'bg-brand-50 text-brand-600'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-700',
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">{rightSlot}</div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href as never}
                data-sht-menu="main"
                className={cn(
                  'whitespace-nowrap rounded px-2 py-1 text-xs',
                  active ? 'bg-brand-50 text-brand-600' : 'text-gray-500',
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main>{children}</main>
    </div>
  );
}
