'use client';

// 앱별 계절 테마를 선택하고 실제 디자인 토큰을 미리보는 관리자 화면
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_SHT_THEME,
  getShtThemeStyle,
  isShtThemeId,
  notifyShtThemeUpdated,
  SHT_APP_IDS,
  SHT_APP_LABELS,
  SHT_THEME_DEFINITIONS,
  SHT_TYPOGRAPHY_FIELDS,
  SHT_TYPOGRAPHY_OPTIONS,
  type ShtAppId,
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
};

type ThemeSettings = Record<ShtAppId, ThemeSetting>;

const TYPOGRAPHY_COLUMN_SQL = 'sql/122-app-theme-typography-settings-20260718.sql';

const INITIAL_SETTINGS = Object.fromEntries(
  SHT_APP_IDS.map((appId) => [appId, { themeId: DEFAULT_SHT_THEME, typography: {} }]),
) as ThemeSettings;

const TYPOGRAPHY_LABELS: Record<ShtTypographyField, string> = {
  body: '본문 글씨',
  title: '제목 글씨',
  heading: '소제목 글씨',
  label: '라벨 글씨',
  button: '버튼 글씨',
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

  const resetAllThemes = () => {
    setSettings({ ...INITIAL_SETTINGS });
    setDirtyApps(new Set(SHT_APP_IDS));
    setMessage('모든 앱을 변경 전 원래 디자인으로 표시했습니다. 저장해야 실제 앱에 반영됩니다.');
  };

  const saveSettings = async () => {
    if (dirtyApps.size === 0) {
      setMessage('저장할 변경사항이 없습니다.');
      return;
    }

    setSaving(true);
    setMessage('');

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const rows = Array.from(dirtyApps).map((appId) => ({
      app_id: appId,
      theme_id: settings[appId].themeId,
      typography: settings[appId].typography,
      updated_by: session?.user.id ?? null,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from('app_theme_settings')
      .upsert(rows, { onConflict: 'app_id' });

    if (error) {
      setMessage(
        error.message.includes('typography')
          ? `글씨 크기 설정 컬럼이 없습니다. ${TYPOGRAPHY_COLUMN_SQL}을 먼저 실행해 주세요.`
          : `저장하지 못했습니다. ${error.message}`,
      );
      setSaving(false);
      return;
    }

    rows.forEach((row) => notifyShtThemeUpdated(row.app_id, row.theme_id, row.typography));
    setDirtyApps(new Set());
    setMessage(`${rows.length}개 앱의 테마를 저장했습니다.`);
    setSaving(false);
  };

  return (
    <AdminLayout title="테마 관리" activeTab="themes">
      <div className="mx-auto max-w-[1440px] space-y-8 px-4 py-6 md:px-8">
        <header className="border-b border-gray-300 pb-6">
          <p className="mb-3 text-xs font-bold tracking-[0.16em] text-gray-500">DESIGN SYSTEM / APP THEMES</p>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 data-sht-theme-ignore className="text-xl font-extrabold tracking-tight text-gray-900">앱별 테마 설정</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-gray-600">
                기능과 문구는 그대로 유지하면서 앱별 글꼴, 글씨 크기, 버튼 색상과 모양,
                입력창, 카드, 표, 내비게이션 디자인을 한 번에 변경합니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                data-sht-theme-ignore
                onClick={resetAllThemes}
                disabled={saving || loading}
                className="border border-gray-400 bg-white px-5 py-3 text-sm font-bold text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                전체 변경 전으로 표시
              </button>
              <button
                type="button"
                data-sht-theme-ignore
                onClick={saveSettings}
                disabled={saving || loading || dirtyApps.size === 0}
                className="border border-[#062f33] bg-[#062f33] px-6 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {saving ? '저장 중' : `변경사항 저장 ${dirtyApps.size > 0 ? `(${dirtyApps.size})` : ''}`}
              </button>
            </div>
          </div>
          {message && <p className="mt-4 border-l-4 border-[#d9ff72] pl-3 text-sm text-gray-700">{message}</p>}
          {loadError && <p className="mt-4 border-l-4 border-red-500 pl-3 text-sm text-red-700">{loadError}</p>}
        </header>

        <section className="grid gap-8 xl:grid-cols-[260px_minmax(0,1fr)]">
          <aside>
            <p className="mb-3 text-xs font-bold tracking-[0.14em] text-gray-500">01 / 앱 선택</p>
            <div className="border-y border-gray-300">
              {SHT_APP_IDS.map((appId) => {
                const active = selectedApp === appId;
                const theme = SHT_THEME_DEFINITIONS.find((item) => item.id === settings[appId].themeId);
                return (
                  <button
                    key={appId}
                    type="button"
                    data-sht-theme-ignore
                    onClick={() => setSelectedApp(appId)}
                    className={`flex min-h-[58px] w-full items-center justify-between border-b border-gray-200 px-3 text-left transition-colors last:border-b-0 ${
                      active ? 'border-l-4 border-l-[#062f33] bg-[#e4eed4]' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span>
                      <span className="block text-sm font-bold text-gray-900">{SHT_APP_LABELS[appId]}</span>
                      <span className="mt-1 block text-xs text-gray-500">{theme?.label}</span>
                    </span>
                    {dirtyApps.has(appId) && (
                      <span className="h-2 w-2 bg-[#ff725e]" aria-label="저장되지 않은 변경사항" />
                    )}
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="min-w-0 space-y-10">
            <section>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="mb-2 text-xs font-bold tracking-[0.14em] text-gray-500">02 / 계절 테마</p>
                  <h2 className="text-xl font-bold text-gray-900">{SHT_APP_LABELS[selectedApp]} 앱에 적용할 테마</h2>
                </div>
                <p className="text-xs font-medium text-amber-700">선택은 미리보기만 바꾸며 저장 전에는 실제 앱에 적용되지 않습니다.</p>
              </div>

              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {SHT_THEME_DEFINITIONS.map((theme) => {
                  const active = selectedThemeId === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      data-sht-theme-ignore
                      aria-pressed={active}
                      onClick={() => selectTheme(theme.id)}
                      className={`min-h-[152px] border p-5 text-left transition-colors ${
                        active ? 'border-[#062f33] bg-[#f4f4ed]' : 'border-gray-300 bg-white hover:border-gray-500'
                      }`}
                    >
                      <span className="mb-5 flex items-center gap-2">
                        {[theme.tokens.primary, theme.tokens.accent, theme.tokens.canvas].map((color) => (
                          <span
                            key={color}
                            className="h-5 w-5 border border-black/10"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </span>
                      <span className="block text-[10px] font-bold tracking-[0.16em] text-gray-500">{theme.eyebrow}</span>
                      <span className="mt-1 block text-base font-extrabold text-gray-900">{theme.label}</span>
                      <span className="mt-2 block text-xs leading-5 text-gray-600">{theme.description}</span>
                      {theme.id === DEFAULT_SHT_THEME && (
                        <span className="mt-3 inline-block bg-gray-100 px-2 py-1 text-[11px] font-bold text-gray-600">
                          원래 UI 유지
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <div className="mb-4">
                <p className="mb-2 text-xs font-bold tracking-[0.14em] text-gray-500">03 / 글씨 크기</p>
                <h2 className="text-xl font-bold text-gray-900">{SHT_APP_LABELS[selectedApp]} 앱의 글씨 크기</h2>
                <p className="mt-2 text-sm text-gray-600">기본값은 모든 계절 테마에서 동일합니다. 항목별로 선택하면 저장 전 미리보기에 바로 반영됩니다.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {SHT_TYPOGRAPHY_FIELDS.map((field) => (
                  <label key={field} className="border border-gray-300 bg-white p-4 text-sm font-bold text-gray-800">
                    <span className="mb-2 block">{TYPOGRAPHY_LABELS[field]}</span>
                    <select
                      data-sht-theme-ignore
                      value={selectedSetting.typography[field] ?? SHT_TYPOGRAPHY_OPTIONS[field].find((option) => option.label === '기본')?.value ?? ''}
                      onChange={(event) => selectTypography(field, event.target.value)}
                      className="w-full border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800"
                    >
                      {SHT_TYPOGRAPHY_OPTIONS[field].map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </section>

            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold tracking-[0.14em] text-gray-500">04 / 저장 전 미리보기</p>
                <span className="bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">
                  미리보기 전용 · 아직 적용되지 않음
                </span>
              </div>
              <div
                data-sht-theme={selectedTheme.id}
                className="sht-theme-preview border p-5 md:p-8"
                style={getShtThemeStyle(selectedTheme.id, selectedSetting.typography)}
              >
                <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div>
                    <p className="sht-theme-preview__label">{selectedTheme.eyebrow} / STAY HALONG</p>
                    <h3 className="sht-theme-preview__heading mt-3">여행을 더 선명하게 준비하세요.</h3>
                    <p className="mt-3 max-w-2xl text-sm leading-7" style={{ color: 'var(--sht-text-muted)' }}>
                      제목과 본문 글꼴, 글씨 크기, 버튼 안의 글자 굵기와 간격까지 선택한 테마 토큰으로 표시됩니다.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <button type="button" data-sht-theme-ignore className="sht-theme-preview__button">예약 확인</button>
                      <button
                        type="button"
                        data-sht-theme-ignore
                        className="sht-theme-preview__button sht-theme-preview__button--secondary"
                      >
                        상세 보기
                      </button>
                    </div>
                  </div>
                  <div className="sht-theme-preview__card p-5">
                    <label className="sht-theme-preview__label block" htmlFor="theme-preview-name">CUSTOMER NAME</label>
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
                        <span style={{ color: 'var(--sht-text-muted)' }}>버튼 모서리</span>
                        <strong style={{ color: 'var(--sht-heading)' }}>{selectedTheme.tokens.buttonRadius}</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
