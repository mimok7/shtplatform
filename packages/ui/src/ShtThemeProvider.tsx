'use client';

// 앱별 테마 설정을 불러와 문서 루트에 디자인 토큰을 적용하는 공급자
import { useEffect, useState, type ReactNode } from 'react';
import {
  DEFAULT_SHT_THEME,
  getShtAppearanceStyle,
  getShtThemeDefinition,
  getShtThemeStyle,
  getShtTypographyStyle,
  isShtThemeId,
  normalizeShtAppearanceOverrides,
  normalizeShtTypographyOverrides,
  SHT_APPEARANCE_COLOR_FIELDS,
  type ShtAppearanceOverrides,
  type ShtAppId,
  type ShtThemeId,
  type ShtTypographyOverrides,
} from './theme';

const THEME_CACHE_PREFIX = 'sht-app-theme:v3:';
const PREVIEW_SESSION_PREFIX = 'sht-theme-preview:v1:';
export const SHT_THEME_PREVIEW_PARAM = 'sht_theme_preview';
export const SHT_THEME_UPDATED_EVENT = 'sht-theme-updated';

type ThemeUpdatedDetail = {
  appId: ShtAppId;
  themeId: ShtThemeId;
  typography: ShtTypographyOverrides;
  appearance: ShtAppearanceOverrides;
};

function applyThemeToDocument(
  appId: ShtAppId,
  themeId: ShtThemeId,
  typography: ShtTypographyOverrides = {},
  appearance: ShtAppearanceOverrides = {},
) {
  const root = document.documentElement;
  const normalizedTypography = normalizeShtTypographyOverrides(typography);
  const normalizedAppearance = normalizeShtAppearanceOverrides(appearance);

  root.dataset.shtApp = appId;
  delete root.dataset.shtTypography;
  delete root.dataset.shtTypeBody;
  delete root.dataset.shtTypeTitle;
  delete root.dataset.shtTypeHeading;
  delete root.dataset.shtTypeLabel;
  delete root.dataset.shtTypeButton;
  delete root.dataset.shtTypeMainMenu;
  delete root.dataset.shtTypeSubMenu;
  delete root.dataset.shtAppearance;
  [...SHT_APPEARANCE_COLOR_FIELDS, 'fontFamily'].forEach((field) => {
    delete root.dataset[`shtStyle${field.charAt(0).toUpperCase()}${field.slice(1)}`];
  });
  Object.keys(getShtThemeDefinition(DEFAULT_SHT_THEME).tokens).forEach((key) => {
    const cssName = key.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
    root.style.removeProperty(`--sht-${cssName}`);
  });
  root.style.removeProperty('--sht-heading-background');
  root.style.removeProperty('--sht-card-header-background');
  root.style.removeProperty('--sht-card-header-text');

  if (Object.keys(normalizedAppearance).length > 0) {
    root.dataset.shtAppearance = 'custom';
    Object.keys(normalizedAppearance).forEach((field) => {
      root.dataset[`shtStyle${field.charAt(0).toUpperCase()}${field.slice(1)}`] = 'custom';
    });
  }

  if (themeId === DEFAULT_SHT_THEME) {
    delete root.dataset.shtTheme;
    if (Object.keys(normalizedTypography).length > 0) {
      root.dataset.shtTypography = 'custom';
      Object.keys(normalizedTypography).forEach((field) => {
        root.dataset[`shtType${field.charAt(0).toUpperCase()}${field.slice(1)}`] = 'custom';
      });
    }
    Object.entries(getShtTypographyStyle(normalizedTypography)).forEach(([cssName, value]) => {
      root.style.setProperty(cssName, String(value));
    });
    Object.entries(getShtAppearanceStyle(normalizedAppearance)).forEach(([cssName, value]) => {
      root.style.setProperty(cssName, String(value));
    });
    return;
  }

  if (Object.keys(normalizedTypography).length > 0) {
    root.dataset.shtTypography = 'custom';
    Object.keys(normalizedTypography).forEach((field) => {
      root.dataset[`shtType${field.charAt(0).toUpperCase()}${field.slice(1)}`] = 'custom';
    });
  }

  root.dataset.shtTheme = themeId;
  Object.entries(getShtThemeStyle(themeId, normalizedTypography, normalizedAppearance)).forEach(([cssName, value]) => {
    root.style.setProperty(cssName, String(value));
  });
}

function parsePreview(value: string | null, appId: ShtAppId): ThemeUpdatedDetail | null {
  if (!value || value.length > 3000) return null;
  try {
    const raw = JSON.parse(value) as Record<string, unknown>;
    if (raw.appId !== appId || !isShtThemeId(raw.themeId)) return null;
    return {
      appId,
      themeId: raw.themeId,
      typography: normalizeShtTypographyOverrides(raw.typography),
      appearance: normalizeShtAppearanceOverrides(raw.appearance),
    };
  } catch {
    return null;
  }
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
    appearance: normalizeShtAppearanceOverrides(
      (rows[0]?.typography as Record<string, unknown> | null)?.appearance,
    ),
  };
}

export function notifyShtThemeUpdated(
  appId: ShtAppId,
  themeId: ShtThemeId,
  typography: ShtTypographyOverrides = {},
  appearance: ShtAppearanceOverrides = {},
) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(`${THEME_CACHE_PREFIX}${appId}`, themeId);
  window.dispatchEvent(
    new CustomEvent<ThemeUpdatedDetail>(SHT_THEME_UPDATED_EVENT, {
      detail: {
        appId,
        themeId,
        typography: normalizeShtTypographyOverrides(typography),
        appearance: normalizeShtAppearanceOverrides(appearance),
      },
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
  const [previewActive, setPreviewActive] = useState(false);

  useEffect(() => {
    let active = true;
    const cacheKey = `${THEME_CACHE_PREFIX}${appId}`;
    const cachedTheme = window.localStorage.getItem(cacheKey);
    const initialTheme = isShtThemeId(cachedTheme) ? cachedTheme : DEFAULT_SHT_THEME;
    const previewKey = `${PREVIEW_SESSION_PREFIX}${appId}`;
    const urlPreview = parsePreview(new URLSearchParams(window.location.search).get(SHT_THEME_PREVIEW_PARAM), appId);
    if (urlPreview) window.sessionStorage.setItem(previewKey, JSON.stringify(urlPreview));
    const preview = urlPreview ?? parsePreview(window.sessionStorage.getItem(previewKey), appId);
    setPreviewActive(Boolean(preview));

    if (preview) applyThemeToDocument(appId, preview.themeId, preview.typography, preview.appearance);
    else applyThemeToDocument(appId, initialTheme);

    fetchAppTheme(appId)
      .then((theme) => {
        if (!active || !theme || preview) return;
        window.localStorage.setItem(cacheKey, theme.themeId);
        applyThemeToDocument(appId, theme.themeId, theme.typography, theme.appearance);
      })
      .catch(() => {
        if (active && !preview) applyThemeToDocument(appId, initialTheme);
      });

    const handleThemeUpdated = (event: Event) => {
      const detail = (event as CustomEvent<ThemeUpdatedDetail>).detail;
      if (!preview && detail?.appId === appId && isShtThemeId(detail.themeId)) {
        applyThemeToDocument(appId, detail.themeId, detail.typography, detail.appearance);
      }
    };

    window.addEventListener(SHT_THEME_UPDATED_EVENT, handleThemeUpdated);

    return () => {
      active = false;
      window.removeEventListener(SHT_THEME_UPDATED_EVENT, handleThemeUpdated);
    };
  }, [appId]);

  const endPreview = () => {
    window.sessionStorage.removeItem(`${PREVIEW_SESSION_PREFIX}${appId}`);
    const url = new URL(window.location.href);
    url.searchParams.delete(SHT_THEME_PREVIEW_PARAM);
    window.location.assign(url.toString());
  };

  return <>
    {children}
    {previewActive && (
      <div className="sht-theme-preview-notice" role="status">
        <span>테마 미리보기 · 저장 전 화면</span>
        <button type="button" onClick={endPreview}>미리보기 종료</button>
      </div>
    )}
  </>;
}
