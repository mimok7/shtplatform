'use client';

// 앱별 테마 설정을 불러와 문서 루트에 디자인 토큰을 적용하는 공급자
import { useEffect, type ReactNode } from 'react';
import {
  DEFAULT_SHT_THEME,
  getShtThemeDefinition,
  getShtThemeStyle,
  getShtTypographyStyle,
  isShtThemeId,
  normalizeShtTypographyOverrides,
  type ShtAppId,
  type ShtThemeId,
  type ShtTypographyOverrides,
} from './theme';

const THEME_CACHE_PREFIX = 'sht-app-theme:v3:';
export const SHT_THEME_UPDATED_EVENT = 'sht-theme-updated';

type ThemeUpdatedDetail = {
  appId: ShtAppId;
  themeId: ShtThemeId;
  typography: ShtTypographyOverrides;
};

function applyThemeToDocument(
  appId: ShtAppId,
  themeId: ShtThemeId,
  typography: ShtTypographyOverrides = {},
) {
  const root = document.documentElement;
  const normalizedTypography = normalizeShtTypographyOverrides(typography);

  root.dataset.shtApp = appId;
  delete root.dataset.shtTypography;
  delete root.dataset.shtTypeBody;
  delete root.dataset.shtTypeTitle;
  delete root.dataset.shtTypeHeading;
  delete root.dataset.shtTypeLabel;
  delete root.dataset.shtTypeButton;
  Object.keys(getShtThemeDefinition(DEFAULT_SHT_THEME).tokens).forEach((key) => {
    const cssName = key.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
    root.style.removeProperty(`--sht-${cssName}`);
  });

  if (themeId === DEFAULT_SHT_THEME) {
    delete root.dataset.shtTheme;
    if (Object.keys(normalizedTypography).length === 0) return;

    root.dataset.shtTypography = 'custom';
    Object.keys(normalizedTypography).forEach((field) => {
      root.dataset[`shtType${field.charAt(0).toUpperCase()}${field.slice(1)}`] = 'custom';
    });
    Object.entries(getShtTypographyStyle(normalizedTypography)).forEach(([cssName, value]) => {
      root.style.setProperty(cssName, String(value));
    });
    return;
  }

  root.dataset.shtTheme = themeId;
  Object.entries(getShtThemeStyle(themeId, normalizedTypography)).forEach(([cssName, value]) => {
    root.style.setProperty(cssName, String(value));
  });
}

async function fetchAppTheme(appId: ShtAppId): Promise<ThemeUpdatedDetail | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/app_theme_settings?app_id=eq.${encodeURIComponent(appId)}&select=theme_id,typography`,
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

  const rows = (await response.json()) as Array<{ theme_id?: unknown; typography?: unknown }>;
  const themeId = rows[0]?.theme_id;
  if (!isShtThemeId(themeId)) return null;

  return {
    appId,
    themeId,
    typography: normalizeShtTypographyOverrides(rows[0]?.typography),
  };
}

export function notifyShtThemeUpdated(
  appId: ShtAppId,
  themeId: ShtThemeId,
  typography: ShtTypographyOverrides = {},
) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(`${THEME_CACHE_PREFIX}${appId}`, themeId);
  window.dispatchEvent(
    new CustomEvent<ThemeUpdatedDetail>(SHT_THEME_UPDATED_EVENT, {
      detail: { appId, themeId, typography: normalizeShtTypographyOverrides(typography) },
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
      .then((theme) => {
        if (!active || !theme) return;
        window.localStorage.setItem(cacheKey, theme.themeId);
        applyThemeToDocument(appId, theme.themeId, theme.typography);
      })
      .catch(() => {
        if (active) applyThemeToDocument(appId, initialTheme);
      });

    const handleThemeUpdated = (event: Event) => {
      const detail = (event as CustomEvent<ThemeUpdatedDetail>).detail;
      if (detail?.appId === appId && isShtThemeId(detail.themeId)) {
        applyThemeToDocument(appId, detail.themeId, detail.typography);
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
