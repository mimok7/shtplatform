'use client';

// 앱별 계절 테마를 선택하고 실제 디자인 토큰을 미리보는 관리자 화면
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_SHT_THEME,
  getShtThemeDefinition,
  getShtThemeStyle,
  isShtThemeId,
  notifyShtThemeUpdated,
  normalizeShtAppearanceOverrides,
  SHT_APPEARANCE_COLOR_FIELDS,
  SHT_APP_IDS,
  SHT_APP_LABELS,
  SHT_FONT_OPTIONS,
  SHT_THEME_DEFINITIONS,
  SHT_THEME_PREVIEW_PARAM,
  SHT_TYPOGRAPHY_FIELDS,
  SHT_TYPOGRAPHY_OPTIONS,
  type ShtAppId,
  type ShtAppearanceColorField,
  type ShtAppearanceOverrides,
  type ShtThemeId,
  type ShtTypographyField,
  type ShtTypographyOverrides,
  normalizeShtTypographyOverrides,
} from '@sht/ui/theme';
import AdminLayout from '@/components/AdminLayout';
import supabase from '@/lib/supabase';

type ThemeSetting = {
  themeId: ShtThemeId;
  typography: ShtTypographyOverrides;
  appearance: ShtAppearanceOverrides;
};

type ThemeSettings = Record<ShtAppId, ThemeSetting>;

const TYPOGRAPHY_COLUMN_SQL = 'sql/122-app-theme-typography-settings-20260718.sql';
const THEME_SAVE_TIMEOUT_MS = 8_000;

const INITIAL_SETTINGS = Object.fromEntries(
  SHT_APP_IDS.map((appId) => [appId, { themeId: DEFAULT_SHT_THEME, typography: {}, appearance: {} }]),
) as ThemeSettings;

const APP_PREVIEW_URLS: Record<ShtAppId, string> = {
  admin: '/admin',
  customer: 'https://customer.stayhalong.com/',
  customer1: 'https://legacy.staycruise.kr/',
  manager: 'https://manager.stayhalong.com/manager/dashboard',
  manager1: 'https://manag.stayhalong.com/manager/dashboard',
  mobile: 'https://newmobile.stayhalong.com/manager/dashboard',
  partner: 'https://partner.stayhalong.com/partner/dashboard',
  quote: 'https://quote.stayhalong.com/',
  cancel: 'https://cancel.stayhalong.com/',
};

const APPEARANCE_COLOR_LABELS: Record<ShtAppearanceColorField, string> = {
  heading: '제목 글자색',
  headingBackground: '제목 바탕색',
  text: '본문 글자색',
  primary: '주요 버튼·머릿글 색상',
  primaryText: '주요 버튼·머릿글 글자색',
  surface: '카드 바탕색',
  cardHeaderBackground: '카드 제목 바탕색',
  cardHeaderText: '카드 제목 글자색',
};

function getAppearanceBaseColor(field: ShtAppearanceColorField, themeId: ShtThemeId): string {
  const tokens = getShtThemeDefinition(themeId).tokens;
  const colors: Record<ShtAppearanceColorField, string> = {
    heading: tokens.heading,
    headingBackground: tokens.primarySoft,
    text: tokens.text,
    primary: tokens.primary,
    primaryText: tokens.primaryText,
    surface: tokens.surface,
    cardHeaderBackground: tokens.primarySoft,
    cardHeaderText: tokens.heading,
  };
  return colors[field];
}

function getContrastRatio(first: string, second: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255);
    const [red, green, blue] = channels.map((channel) => (
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    ));
    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
  };
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

const TYPOGRAPHY_LABELS: Record<ShtTypographyField, string> = {
  body: '본문 글씨',
  title: '제목 글씨',
  heading: '소제목 글씨',
  label: '라벨 글씨',
  button: '버튼 글씨',
  mainMenu: '주메뉴 글씨',
  subMenu: '부메뉴 글씨',
};

export default function ThemeManagementPage() {
  const [settings, setSettings] = useState<ThemeSettings>(INITIAL_SETTINGS);
  const [selectedApp, setSelectedApp] = useState<ShtAppId>('admin');
  const [dirtyApps, setDirtyApps] = useState<Set<ShtAppId>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setLoadError('');

    const { data, error } = await supabase
      .from('app_theme_settings')
      .select('app_id, theme_id, typography');

    if (error) {
      setLoadError(
        error.code === '42P01'
          ? '테마 설정 테이블이 없습니다. sql/121-app-theme-settings-20260718.sql을 먼저 실행해 주세요.'
          : error.message.includes('typography')
            ? `글씨 크기 설정 컬럼이 없습니다. ${TYPOGRAPHY_COLUMN_SQL}을 먼저 실행해 주세요.`
          : `테마 설정을 불러오지 못했습니다. ${error.message}`,
      );
      setLoading(false);
      return;
    }

    const nextSettings = { ...INITIAL_SETTINGS };
    (data ?? []).forEach((row: { app_id?: unknown; theme_id?: unknown; typography?: unknown }) => {
      if (
        typeof row.app_id === 'string'
        && SHT_APP_IDS.includes(row.app_id as ShtAppId)
        && isShtThemeId(row.theme_id)
      ) {
        nextSettings[row.app_id as ShtAppId] = {
          themeId: row.theme_id,
          typography: normalizeShtTypographyOverrides(row.typography),
          appearance: normalizeShtAppearanceOverrides(
            (row.typography as Record<string, unknown> | null)?.appearance,
          ),
        };
      }
    });

    setSettings(nextSettings);
    setDirtyApps(new Set());
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const selectedSetting = settings[selectedApp];
  const selectedThemeId = selectedSetting.themeId;
  const selectedTheme = useMemo(
    () => SHT_THEME_DEFINITIONS.find((theme) => theme.id === selectedThemeId)
      ?? SHT_THEME_DEFINITIONS[0]!,
    [selectedThemeId],
  );
  const contrastWarnings = [
    ['주요 버튼·머릿글', selectedSetting.appearance.primary ?? selectedTheme.tokens.primary, selectedSetting.appearance.primaryText ?? selectedTheme.tokens.primaryText],
    ['카드 제목', selectedSetting.appearance.cardHeaderBackground ?? selectedTheme.tokens.primarySoft, selectedSetting.appearance.cardHeaderText ?? selectedTheme.tokens.heading],
    ['카드 내용', selectedSetting.appearance.surface ?? selectedTheme.tokens.surface, selectedSetting.appearance.text ?? selectedTheme.tokens.text],
    ...(selectedSetting.appearance.headingBackground
      ? [['제목', selectedSetting.appearance.headingBackground, selectedSetting.appearance.heading ?? selectedTheme.tokens.heading]]
      : []),
  ].filter(([, background, foreground]) => getContrastRatio(background, foreground) < 4.5)
    .map(([label]) => label);

  const selectTheme = (themeId: ShtThemeId) => {
    setSettings((current) => ({
      ...current,
      [selectedApp]: { ...current[selectedApp], themeId },
    }));
    setDirtyApps((current) => new Set(current).add(selectedApp));
    setMessage('미리보기만 변경했습니다. 저장하기 전에는 실제 앱에 적용되지 않습니다.');
  };

  const selectTypography = (field: ShtTypographyField, value: string) => {
    setSettings((current) => ({
      ...current,
      [selectedApp]: {
        ...current[selectedApp],
        typography: Object.fromEntries(
          Object.entries({ ...current[selectedApp].typography, [field]: value })
            .filter(([key, selected]) => selected !== SHT_TYPOGRAPHY_OPTIONS[key as ShtTypographyField].find((option) => option.label === '기본')?.value),
        ),
      },
    }));
    setDirtyApps((current) => new Set(current).add(selectedApp));
    setMessage('글씨 크기는 미리보기에서만 변경했습니다. 저장하기 전에는 실제 앱에 적용되지 않습니다.');
  };

  const selectAppearance = (field: ShtAppearanceColorField | 'fontFamily', value: string) => {
    setSettings((current) => ({
      ...current,
      [selectedApp]: {
        ...current[selectedApp],
        appearance: normalizeShtAppearanceOverrides({
          ...current[selectedApp].appearance,
          [field]: value,
        }),
      },
    }));
    setDirtyApps((current) => new Set(current).add(selectedApp));
    setMessage('세부 디자인은 미리보기에서만 변경했습니다. 저장해야 실제 앱에 반영됩니다.');
  };

  const openPreview = () => {
    const url = new URL(APP_PREVIEW_URLS[selectedApp], window.location.origin);
    url.searchParams.set(SHT_THEME_PREVIEW_PARAM, JSON.stringify({
      appId: selectedApp,
      themeId: selectedSetting.themeId,
      typography: selectedSetting.typography,
      appearance: selectedSetting.appearance,
    }));
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  };

  const resetAllThemes = () => {
    const themeChangedApps = SHT_APP_IDS.filter((appId) => settings[appId].themeId !== DEFAULT_SHT_THEME);

    if (themeChangedApps.length === 0) {
      setMessage('모든 앱이 이미 기본 테마입니다. 글씨 크기와 세부 디자인 설정은 그대로 유지했습니다.');
      return;
    }

    setSettings((current) => Object.fromEntries(
      SHT_APP_IDS.map((appId) => [appId, { ...current[appId], themeId: DEFAULT_SHT_THEME }]),
    ) as ThemeSettings);
    setDirtyApps((current) => new Set([...current, ...themeChangedApps]));
    setMessage('테마만 변경 전 기본 상태로 표시했습니다. 글씨 크기와 세부 디자인 설정은 유지됩니다. 저장해야 실제 앱에 반영됩니다.');
  };

  const saveSettings = async () => {
    if (dirtyApps.size === 0) {
      setMessage('저장할 변경사항이 없습니다.');
      return;
    }

    setSaving(true);
    setMessage('');

    const rows = Array.from(dirtyApps).map((appId) => ({
      app_id: appId,
      theme_id: settings[appId].themeId,
      typography: {
        ...settings[appId].typography,
        ...(Object.keys(settings[appId].appearance).length > 0
          ? { appearance: settings[appId].appearance }
          : {}),
      },
      updated_at: new Date().toISOString(),
    }));
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), THEME_SAVE_TIMEOUT_MS);

    try {
      const { error } = await supabase
        .from('app_theme_settings')
        .upsert(rows, { onConflict: 'app_id' })
        .abortSignal(controller.signal);

      if (error) {
        setMessage(
          error.message.includes('typography')
            ? `글씨 크기 설정 컬럼이 없습니다. ${TYPOGRAPHY_COLUMN_SQL}을 먼저 실행해 주세요.`
            : `저장하지 못했습니다. ${error.message}`,
        );
        return;
      }

      const { data: savedRows, error: verifyError } = await supabase
        .from('app_theme_settings')
        .select('app_id, theme_id, typography')
        .in('app_id', rows.map((row) => row.app_id))
        .abortSignal(controller.signal);
      const savedMatches = !verifyError && rows.every((row) => {
        const saved = savedRows?.find((item) => item.app_id === row.app_id);
        if (!saved || saved.theme_id !== row.theme_id) return false;
        const savedTypography = normalizeShtTypographyOverrides(saved.typography);
        const savedAppearance = normalizeShtAppearanceOverrides(
          (saved.typography as Record<string, unknown> | null)?.appearance,
        );
        return JSON.stringify(savedTypography) === JSON.stringify(normalizeShtTypographyOverrides(settings[row.app_id].typography))
          && JSON.stringify(savedAppearance) === JSON.stringify(normalizeShtAppearanceOverrides(settings[row.app_id].appearance));
      });
      if (!savedMatches) {
        setMessage(`저장 후 설정을 확인하지 못했습니다. ${verifyError?.message ?? '화면을 새로고침해 설정을 확인해 주세요.'}`);
        return;
      }

      rows.forEach((row) => notifyShtThemeUpdated(
        row.app_id,
        row.theme_id,
        settings[row.app_id].typography,
        settings[row.app_id].appearance,
      ));
      setDirtyApps(new Set());
      setMessage(`${rows.length}개 앱의 테마를 저장했습니다.`);
    } catch (error) {
      setMessage(
        error instanceof DOMException && error.name === 'AbortError'
          ? '저장 또는 확인 요청이 8초 안에 완료되지 않았습니다. 네트워크와 데이터베이스 연결을 확인한 뒤 다시 시도해 주세요.'
          : `저장하지 못했습니다. ${error instanceof Error ? error.message : '알 수 없는 오류입니다.'}`,
      );
    } finally {
      window.clearTimeout(timeout);
      setSaving(false);
    }
  };

  return (
    <AdminLayout activeTab="themes">
      <div className="mx-auto max-w-[1440px] space-y-5 px-2 pb-6 sm:px-4">
        <header className="rounded-xl border border-slate-200 bg-[var(--sht-surface)] px-5 py-5 sm:px-6">
          <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-[var(--sht-text-muted)]">테마 관리 · DESIGN SYSTEM / APP THEMES</p>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 data-sht-theme-ignore className="text-xl font-bold tracking-tight text-[var(--sht-heading)]">앱별 테마 설정</h1>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-[var(--sht-text-muted)]">
                계절 테마는 앱의 색상만 변경합니다. 글씨 크기는 아래 항목에서 별도로 선택한 경우에만 변경됩니다.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                data-sht-theme-ignore
                onClick={openPreview}
                disabled={loading}
                className="min-h-11 rounded-lg border border-[var(--sht-primary)] bg-[var(--sht-surface)] px-4 py-2 text-sm font-semibold text-[var(--sht-primary)] transition-colors hover:bg-[var(--sht-primary-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sht-focus)] disabled:pointer-events-none disabled:opacity-40"
              >
                선택 앱 미리보기
              </button>
              <button
                type="button"
                data-sht-theme-ignore
                onClick={resetAllThemes}
                disabled={saving || loading}
                className="min-h-11 rounded-lg border border-[var(--sht-border)] bg-[var(--sht-surface)] px-4 py-2 text-sm font-semibold text-[var(--sht-heading)] transition-colors hover:bg-[var(--sht-surface-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sht-focus)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40"
              >
                전체 테마만 변경 전으로 표시
              </button>
              <button
                type="button"
                data-sht-theme-ignore
                onClick={saveSettings}
                disabled={saving || loading || dirtyApps.size === 0}
                className="min-h-11 rounded-lg border border-[var(--sht-primary)] bg-[var(--sht-primary)] px-5 py-2 text-sm font-semibold text-[var(--sht-primary-text)] transition-colors hover:bg-[var(--sht-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sht-focus)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? '저장 중' : `변경사항 저장 ${dirtyApps.size > 0 ? `(${dirtyApps.size})` : ''}`}
              </button>
            </div>
          </div>
          {message && <p role="status" className="mt-4 rounded-lg border border-[var(--sht-border)] bg-[var(--sht-surface-muted)] px-3 py-2 text-sm text-[var(--sht-text)]">{message}</p>}
          {loadError && <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>}
        </header>

        <section className="rounded-xl border border-slate-200 bg-[var(--sht-surface)] p-4 sm:p-5">
          <p className="mb-3 text-xs font-semibold tracking-[0.12em] text-[var(--sht-text-muted)]">01 / 앱 선택</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
              {SHT_APP_IDS.map((appId) => {
                const active = selectedApp === appId;
                const theme = SHT_THEME_DEFINITIONS.find((item) => item.id === settings[appId].themeId);
                return (
                  <button
                    key={appId}
                    type="button"
                    data-sht-theme-ignore
                    aria-pressed={active}
                    onClick={() => setSelectedApp(appId)}
                    className={`flex min-h-[58px] min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sht-focus)] ${
                      active ? 'border-[var(--sht-primary)] bg-[var(--sht-primary-soft)]' : 'border-[var(--sht-border)] bg-[var(--sht-surface)] hover:bg-[var(--sht-surface-muted)]'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-[var(--sht-heading)]">{SHT_APP_LABELS[appId]}</span>
                      <span className="mt-0.5 block text-xs text-[var(--sht-text-muted)]">{theme?.label}</span>
                    </span>
                    {dirtyApps.has(appId) && (
                      <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-label="저장되지 않은 변경사항" />
                    )}
                  </button>
                );
              })}
          </div>
        </section>

        <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.75fr)] 2xl:items-start">
          <div className="min-w-0 space-y-5">
            <section className="rounded-xl border border-slate-200 bg-[var(--sht-surface)] p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="mb-1 text-xs font-semibold tracking-[0.12em] text-[var(--sht-text-muted)]">02 / 계절 테마</p>
                  <h2 className="text-lg font-bold text-[var(--sht-heading)]">{SHT_APP_LABELS[selectedApp]} 앱에 적용할 테마</h2>
                </div>
                <p className="text-xs font-medium text-amber-700">선택은 미리보기만 바꾸며 저장 전에는 실제 앱에 적용되지 않습니다.</p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-2">
                {SHT_THEME_DEFINITIONS.map((theme) => {
                  const active = selectedThemeId === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      data-sht-theme-ignore
                      aria-pressed={active}
                      onClick={() => selectTheme(theme.id)}
                      className={`min-h-[136px] rounded-lg border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sht-focus)] ${
                        active ? 'border-[var(--sht-primary)] bg-[var(--sht-primary-soft)]' : 'border-[var(--sht-border)] bg-[var(--sht-surface)] hover:bg-[var(--sht-surface-muted)]'
                      }`}
                    >
                      <span className="mb-3 flex items-center gap-1.5">
                        {[theme.tokens.primary, theme.tokens.accent, theme.tokens.canvas].map((color) => (
                          <span
                            key={color}
                            className="h-4 w-4 rounded-full border border-black/10"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </span>
                      <span className="block text-[10px] font-semibold tracking-[0.14em] text-[var(--sht-text-muted)]">{theme.eyebrow}</span>
                      <span className="mt-0.5 block text-base font-bold text-[var(--sht-heading)]">{theme.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-[var(--sht-text-muted)]">{theme.description}</span>
                      {theme.id === DEFAULT_SHT_THEME && (
                        <span className="mt-2 inline-block rounded bg-[var(--sht-surface-muted)] px-2 py-0.5 text-[11px] font-semibold text-[var(--sht-text-muted)]">
                          원래 UI 유지
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-[var(--sht-surface)] p-4 sm:p-5">
              <div className="mb-4">
                <p className="mb-1 text-xs font-semibold tracking-[0.12em] text-[var(--sht-text-muted)]">03 / 글씨 크기</p>
                <h2 className="text-lg font-bold text-[var(--sht-heading)]">{SHT_APP_LABELS[selectedApp]} 앱의 글씨 크기</h2>
                <p className="mt-1.5 text-sm leading-6 text-[var(--sht-text-muted)]">기본값은 각 앱의 기존 글씨 크기를 유지합니다. 항목별로 선택하면 저장 전 미리보기에 바로 반영되며, 테마 복원 시에도 유지됩니다.</p>
              </div>
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-2">
                {SHT_TYPOGRAPHY_FIELDS.map((field) => (
                  <label key={field} className="block text-sm font-semibold text-[var(--sht-heading)]">
                    <span className="mb-1.5 block">{TYPOGRAPHY_LABELS[field]}</span>
                    <select
                      data-sht-theme-ignore
                      value={selectedSetting.typography[field] ?? SHT_TYPOGRAPHY_OPTIONS[field].find((option) => option.label === '기본')?.value ?? ''}
                      onChange={(event) => selectTypography(field, event.target.value)}
                      className="min-h-11 w-full rounded-lg border border-[var(--sht-border)] bg-[var(--sht-surface)] px-3 py-2 text-sm font-medium text-[var(--sht-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--sht-focus)]"
                    >
                      {SHT_TYPOGRAPHY_OPTIONS[field].map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="mt-5 border-t border-[var(--sht-border)] pt-5">
                <h3 className="text-sm font-bold text-[var(--sht-heading)]">글꼴 모양</h3>
                <label className="mt-2 block max-w-sm text-sm font-semibold text-[var(--sht-heading)]">
                  <span className="mb-1.5 block">앱 글꼴</span>
                  <select
                    data-sht-theme-ignore
                    value={selectedSetting.appearance.fontFamily ?? ''}
                    onChange={(event) => selectAppearance('fontFamily', event.target.value)}
                    className="min-h-11 w-full rounded-lg border border-[var(--sht-border)] bg-[var(--sht-surface)] px-3 py-2 text-sm font-medium text-[var(--sht-text)]"
                  >
                    {SHT_FONT_OPTIONS.map((option) => (
                      <option key={option.label} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-5 border-t border-[var(--sht-border)] pt-5">
                <h3 className="text-sm font-bold text-[var(--sht-heading)]">세부 색상</h3>
                <p className="mt-1 text-xs text-[var(--sht-text-muted)]">기본값은 선택한 테마의 색상을 유지합니다. 색상을 지정한 항목만 별도로 적용됩니다.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {SHT_APPEARANCE_COLOR_FIELDS.map((field) => (
                    <div key={field} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-[var(--sht-border)] px-3 py-2">
                      <div className="min-w-0">
                        <label className="block text-sm font-semibold text-[var(--sht-heading)]" htmlFor={`theme-color-${field}`}>
                          {APPEARANCE_COLOR_LABELS[field]}
                        </label>
                        <span className="text-xs text-[var(--sht-text-muted)]">
                          {selectedSetting.appearance[field] ?? (field === 'headingBackground' ? '배경 없음' : '테마 기본값')}
                        </span>
                      </div>
                      <input
                        id={`theme-color-${field}`}
                        type="color"
                        data-sht-theme-ignore
                        value={selectedSetting.appearance[field] ?? getAppearanceBaseColor(field, selectedThemeId)}
                        onChange={(event) => selectAppearance(field, event.target.value)}
                        className="h-11 w-12 shrink-0 cursor-pointer rounded-md border border-[var(--sht-border)] bg-[var(--sht-surface)] p-1"
                      />
                      <button
                        type="button"
                        data-sht-theme-ignore
                        onClick={() => selectAppearance(
                          field,
                          selectedSetting.appearance[field] ? '' : getAppearanceBaseColor(field, selectedThemeId),
                        )}
                        className="min-h-11 shrink-0 text-xs font-medium text-[var(--sht-text-muted)] underline underline-offset-2"
                      >
                        {selectedSetting.appearance[field] ? '기본' : '적용'}
                      </button>
                    </div>
                  ))}
                </div>
                {contrastWarnings.length > 0 && (
                  <p role="status" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {contrastWarnings.join(', ')} 색상 대비가 낮습니다. 글자색이나 바탕색을 조정해 주세요.
                  </p>
                )}
              </div>
            </section>
          </div>

          <section className="min-w-0 rounded-xl border border-slate-200 bg-[var(--sht-surface)] p-4 sm:p-5 2xl:sticky 2xl:top-24">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold tracking-[0.12em] text-[var(--sht-text-muted)]">04 / 저장 전 미리보기</p>
                <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                  미리보기 전용 · 아직 적용되지 않음
                </span>
              </div>
              <div
                data-sht-theme={selectedTheme.id}
                data-sht-preview-font={selectedSetting.appearance.fontFamily ? 'custom' : undefined}
                className="sht-theme-preview min-w-0 overflow-hidden rounded-lg border p-5"
                style={getShtThemeStyle(selectedTheme.id, selectedSetting.typography, selectedSetting.appearance)}
              >
                <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(230px,0.8fr)] 2xl:grid-cols-1">
                  <div>
                    <p className="sht-theme-preview__label">{selectedTheme.eyebrow} / STAY HALONG</p>
                    <h3 className="sht-theme-preview__heading mt-3">여행을 더 선명하게 준비하세요.</h3>
                    <p className="mt-3 max-w-2xl text-sm leading-7" style={{ color: 'var(--sht-text)' }}>
                      계절 테마의 색상과 별도로 선택한 글씨 크기를 확인할 수 있습니다.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button type="button" data-sht-theme-ignore className="sht-theme-preview__button">예약 확인</button>
                      <button
                        type="button"
                        data-sht-theme-ignore
                        className="sht-theme-preview__button sht-theme-preview__button--secondary"
                      >
                        상세 보기
                      </button>
                    </div>
                    <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--sht-border)' }}>
                      <p className="sht-theme-preview__menu-main">예약 관리</p>
                      <p className="sht-theme-preview__menu-sub mt-2">예약 목록 · 예약 수정 · 결제 관리</p>
                    </div>
                  </div>
                  <div className="sht-theme-preview__card min-w-0">
                    <div className="sht-theme-preview__card-header px-5 py-3 font-bold">예약 정보</div>
                    <div className="sht-theme-preview__card-body p-5">
                      <label className="sht-theme-preview__label block" htmlFor="theme-preview-name">고객 이름</label>
                      <input
                        id="theme-preview-name"
                        readOnly
                        value="홍길동"
                        className="sht-theme-preview__input mt-2 w-full px-3 py-2 text-sm"
                      />
                      <div className="mt-5 border-t pt-4" style={{ borderColor: 'var(--sht-border)' }}>
                        <div className="flex items-center justify-between text-sm">
                          <span style={{ color: 'var(--sht-text-muted)' }}>선택 테마</span>
                          <strong style={{ color: 'var(--sht-heading)' }}>{selectedTheme.label}</strong>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-sm">
                          <span style={{ color: 'var(--sht-text-muted)' }}>카드 제목 색상</span>
                          <strong style={{ color: 'var(--sht-heading)' }}>{selectedTheme.tokens.primarySoft}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
          </section>
        </div>
      </div>
    </AdminLayout>
  );
}
