'use client';

import { useEffect } from 'react';

declare global {
  interface Window {
    __consoleErrorOnlyApplied?: boolean;
  }
}

const noop = () => {};

export default function ConsoleErrorOnly() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.__consoleErrorOnlyApplied) return;

    window.__consoleErrorOnlyApplied = true;
    console.log = noop;
    console.info = noop;
    console.warn = noop;
    console.debug = noop;
  }, []);

  return null;
}
