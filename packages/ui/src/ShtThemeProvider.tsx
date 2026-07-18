'use client';

// 앱별 테마 설정을 불러와 문서 루트에 디자인 토큰을 적용하는 공급자
import { useEffect, type ReactNode } from 'react';
import {
  DEFAULT_SHT_THEME,
  getShtThemeDefinition,
  isShtThemeId,
  type ShtAppId,
  type ShtThemeId,
} from './theme';

const THEME_CACHE_PREFIX = 'sht-app-theme:v2:';
export const SHT_THEME_UPDATED_EVENT = 'sht-theme-updated';

type ThemeUpdatedDetail = {
  appId: ShtAppId;
  themeId: ShtThemeId;
};

function applyThemeToDocument(appId: ShtAppId, themeId: ShtThemeId) {
  const root = document.documentElement;

  root.dataset.shtApp = appId;
  Object.keys(getShtThemeDefinition(DEFAULT_SHT_THEME).tokens).forEach((key) => {
    const cssName = key.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
    root.style.removeProperty(`--sht-${cssName}`);
  });

  if (themeId === DEFAULT_SHT_THEME) {
    delete root.dataset.shtTheme;
    return;
  }

  const theme = getShtThemeDefinition(themeId);
  root.dataset.shtTheme = themeId;
  Object.entries(theme.tokens).forEach(([key, value]) => {
    const cssName = key.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
    root.style.setProperty(`--sht-${cssName}`, value);
  });
}

async function fetchAppTheme(appId: ShtAppId): Promise<ShtThemeId | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/app_theme_settings?app_id=eq.${encodeURIComponent(appId)}&select=theme_id`,
    {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
      cache: 'no-store',
    },
  );

  if (!response.ok) {
    return null;
  }

  const rows = (await response.json()) as Array<{ theme_id?: unknown }>;
  return isShtThemeId(rows[0]?.theme_id) ? rows[0].theme_id : null;
}

export function notifyShtThemeUpdated(appId: ShtAppId, themeId: ShtThemeId) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(`${THEME_CACHE_PREFIX}${appId}`, themeId);
  window.dispatchEvent(
    new CustomEvent<ThemeUpdatedDetail>(SHT_THEME_UPDATED_EVENT, {
      detail: { appId, themeId },
    }),
  );
}

export function ShtThemeProvider({
  appId,
  children,
}: {
  appId: ShtAppId;
  children: ReactNode;
}) {
  useEffect(() => {
    let active = true;
    const cacheKey = `${THEME_CACHE_PREFIX}${appId}`;
    const cachedTheme = window.localStorage.getItem(cacheKey);
    const initialTheme = isShtThemeId(cachedTheme) ? cachedTheme : DEFAULT_SHT_THEME;

    applyThemeToDocument(appId, initialTheme);

    fetchAppTheme(appId)
      .then((themeId) => {
        if (!active || !themeId) return;
        window.localStorage.setItem(cacheKey, themeId);
        applyThemeToDocument(appId, themeId);
      })
      .catch(() => {
        if (active) applyThemeToDocument(appId, initialTheme);
      });

    const handleThemeUpdated = (event: Event) => {
      const detail = (event as CustomEvent<ThemeUpdatedDetail>).detail;
      if (detail?.appId === appId && isShtThemeId(detail.themeId)) {
        applyThemeToDocument(appId, detail.themeId);
      }
    };

    window.addEventListener(SHT_THEME_UPDATED_EVENT, handleThemeUpdated);

    return () => {
      active = false;
      window.removeEventListener(SHT_THEME_UPDATED_EVENT, handleThemeUpdated);
    };
  }, [appId]);

  return children;
}
