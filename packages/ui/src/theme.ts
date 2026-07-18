// 스테이하롱 전체 앱에서 공유하는 테마 정의와 디자인 토큰
import type { CSSProperties } from 'react';

export const SHT_APP_IDS = [
  'admin',
  'customer',
  'customer1',
  'manager',
  'manager1',
  'mobile',
  'partner',
  'quote',
  'cancel',
] as const;

export const SHT_THEME_IDS = [
  'default',
  'spring',
  'summer',
  'autumn',
  'winter',
  'christmas',
] as const;

export type ShtAppId = (typeof SHT_APP_IDS)[number];
export type ShtThemeId = (typeof SHT_THEME_IDS)[number];

export type ShtThemeTokens = {
  canvas: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textMuted: string;
  heading: string;
  primary: string;
  primaryHover: string;
  primaryText: string;
  primarySoft: string;
  accent: string;
  border: string;
  focus: string;
  fontFamily: string;
  fontSizeBody: string;
  fontSizeTitle: string;
  fontSizeHeading: string;
  fontSizeLabel: string;
  buttonRadius: string;
  buttonHeight: string;
  buttonPaddingX: string;
  buttonFontSize: string;
  buttonFontWeight: string;
  buttonLetterSpacing: string;
  inputRadius: string;
  cardRadius: string;
  cardShadow: string;
};

export type ShtThemeDefinition = {
  id: ShtThemeId;
  label: string;
  eyebrow: string;
  description: string;
  recommendedFor: ShtAppId[];
  tokens: ShtThemeTokens;
};

export const SHT_APP_LABELS: Record<ShtAppId, string> = {
  admin: '관리자',
  customer: '고객 예약',
  customer1: '주문 조회',
  manager: '매니저',
  manager1: '퀵 매니저',
  mobile: '모바일',
  partner: '파트너',
  quote: '견적',
  cancel: '예약 취소',
};

export const SHT_THEME_DEFINITIONS: readonly ShtThemeDefinition[] = [
  {
    id: 'default',
    label: '스테이하롱 기본',
    eyebrow: 'YEAR ROUND',
    description: '딥 틸과 애시드 옐로를 사용하는 선명한 여행 에디토리얼 테마입니다.',
    recommendedFor: ['admin', 'manager', 'manager1', 'partner'],
    tokens: {
      canvas: '#f4f4ed',
      surface: '#ffffff',
      surfaceMuted: '#ebeee7',
      text: '#173437',
      textMuted: '#6f817d',
      heading: '#062f33',
      primary: '#062f33',
      primaryHover: '#0a464b',
      primaryText: '#ffffff',
      primarySoft: '#e4eed4',
      accent: '#d9ff72',
      border: 'rgba(6, 47, 51, 0.18)',
      focus: '#bce94b',
      fontFamily: "'Pretendard Variable', 'Pretendard', 'Noto Sans KR', sans-serif",
      fontSizeBody: '15px',
      fontSizeTitle: 'clamp(2rem, 4vw, 3.75rem)',
      fontSizeHeading: 'clamp(1.25rem, 2vw, 1.75rem)',
      fontSizeLabel: '12px',
      buttonRadius: '2px',
      buttonHeight: '40px',
      buttonPaddingX: '16px',
      buttonFontSize: '13px',
      buttonFontWeight: '700',
      buttonLetterSpacing: '-0.01em',
      inputRadius: '2px',
      cardRadius: '2px',
      cardShadow: 'none',
    },
  },
  {
    id: 'spring',
    label: '봄',
    eyebrow: 'SPRING',
    description: '새잎 녹색과 꽃잎 코랄로 예약 탐색 화면을 산뜻하게 만듭니다.',
    recommendedFor: ['customer', 'customer1', 'quote'],
    tokens: {
      canvas: '#f7f8f0',
      surface: '#fffef9',
      surfaceMuted: '#eef4e9',
      text: '#2d3d30',
      textMuted: '#71806f',
      heading: '#234c32',
      primary: '#477a59',
      primaryHover: '#365f45',
      primaryText: '#ffffff',
      primarySoft: '#dfeede',
      accent: '#ef8ea7',
      border: '#cbd9c8',
      focus: '#e26f8e',
      fontFamily: "'Noto Sans KR', 'Pretendard Variable', 'Pretendard', sans-serif",
      fontSizeBody: '15px',
      fontSizeTitle: 'clamp(2rem, 4vw, 3.6rem)',
      fontSizeHeading: 'clamp(1.25rem, 2vw, 1.7rem)',
      fontSizeLabel: '12px',
      buttonRadius: '10px',
      buttonHeight: '42px',
      buttonPaddingX: '18px',
      buttonFontSize: '14px',
      buttonFontWeight: '700',
      buttonLetterSpacing: '-0.015em',
      inputRadius: '8px',
      cardRadius: '12px',
      cardShadow: '0 8px 22px rgba(45, 84, 55, 0.08)',
    },
  },
  {
    id: 'summer',
    label: '여름',
    eyebrow: 'SUMMER',
    description: '하롱베이의 바다색과 밝은 아쿠아 포인트를 사용한 활기찬 테마입니다.',
    recommendedFor: ['customer', 'mobile', 'quote', 'cancel'],
    tokens: {
      canvas: '#eef9f8',
      surface: '#ffffff',
      surfaceMuted: '#def3f1',
      text: '#173c40',
      textMuted: '#5d7e80',
      heading: '#005f65',
      primary: '#007c83',
      primaryHover: '#005f65',
      primaryText: '#ffffff',
      primarySoft: '#cceeed',
      accent: '#54d7e0',
      border: '#b9dcda',
      focus: '#00aeb8',
      fontFamily: "'SUIT', 'Pretendard Variable', 'Pretendard', 'Noto Sans KR', sans-serif",
      fontSizeBody: '15px',
      fontSizeTitle: 'clamp(2.1rem, 4vw, 3.8rem)',
      fontSizeHeading: 'clamp(1.25rem, 2vw, 1.75rem)',
      fontSizeLabel: '12px',
      buttonRadius: '4px',
      buttonHeight: '42px',
      buttonPaddingX: '18px',
      buttonFontSize: '14px',
      buttonFontWeight: '750',
      buttonLetterSpacing: '-0.01em',
      inputRadius: '4px',
      cardRadius: '6px',
      cardShadow: '0 8px 20px rgba(0, 95, 101, 0.08)',
    },
  },
  {
    id: 'autumn',
    label: '가을',
    eyebrow: 'AUTUMN',
    description: '따뜻한 종이색과 클레이·오커 포인트로 정보가 차분하게 읽히는 테마입니다.',
    recommendedFor: ['partner', 'quote', 'manager'],
    tokens: {
      canvas: '#faf3e7',
      surface: '#fffdf8',
      surfaceMuted: '#f3e5d2',
      text: '#49372c',
      textMuted: '#806f61',
      heading: '#713a25',
      primary: '#9a4f2b',
      primaryHover: '#763a20',
      primaryText: '#ffffff',
      primarySoft: '#f2d9bf',
      accent: '#e9a23b',
      border: '#dec8ad',
      focus: '#c97822',
      fontFamily: "'Spoqa Han Sans Neo', 'Pretendard Variable', 'Pretendard', sans-serif",
      fontSizeBody: '15px',
      fontSizeTitle: 'clamp(2rem, 4vw, 3.55rem)',
      fontSizeHeading: 'clamp(1.25rem, 2vw, 1.7rem)',
      fontSizeLabel: '12px',
      buttonRadius: '2px',
      buttonHeight: '40px',
      buttonPaddingX: '17px',
      buttonFontSize: '13px',
      buttonFontWeight: '700',
      buttonLetterSpacing: '0',
      inputRadius: '2px',
      cardRadius: '2px',
      cardShadow: '0 7px 18px rgba(113, 58, 37, 0.07)',
    },
  },
  {
    id: 'winter',
    label: '겨울',
    eyebrow: 'WINTER',
    description: '슬레이트 블루와 아이스 컬러로 운영 화면에 맑고 안정적인 대비를 줍니다.',
    recommendedFor: ['admin', 'manager', 'manager1', 'mobile'],
    tokens: {
      canvas: '#f0f5f8',
      surface: '#ffffff',
      surfaceMuted: '#e3edf3',
      text: '#263b4b',
      textMuted: '#657b8a',
      heading: '#243f57',
      primary: '#385570',
      primaryHover: '#243f57',
      primaryText: '#ffffff',
      primarySoft: '#d7e7f1',
      accent: '#a9d8f5',
      border: '#c4d5df',
      focus: '#70b8e4',
      fontFamily: "'Pretendard Variable', 'Pretendard', 'Noto Sans KR', sans-serif",
      fontSizeBody: '14px',
      fontSizeTitle: 'clamp(1.9rem, 4vw, 3.45rem)',
      fontSizeHeading: 'clamp(1.2rem, 2vw, 1.65rem)',
      fontSizeLabel: '11px',
      buttonRadius: '6px',
      buttonHeight: '40px',
      buttonPaddingX: '16px',
      buttonFontSize: '13px',
      buttonFontWeight: '700',
      buttonLetterSpacing: '-0.005em',
      inputRadius: '6px',
      cardRadius: '8px',
      cardShadow: '0 8px 18px rgba(36, 63, 87, 0.07)',
    },
  },
  {
    id: 'christmas',
    label: '크리스마스',
    eyebrow: 'CHRISTMAS',
    description: '에버그린과 크랜베리 포인트를 절제해 사용하는 연말 시즌 테마입니다.',
    recommendedFor: ['customer', 'customer1', 'cancel'],
    tokens: {
      canvas: '#f6f3eb',
      surface: '#fffef9',
      surfaceMuted: '#e9efe8',
      text: '#263a31',
      textMuted: '#6d7b73',
      heading: '#0c4939',
      primary: '#0c5b45',
      primaryHover: '#084735',
      primaryText: '#ffffff',
      primarySoft: '#dce9df',
      accent: '#be2f3b',
      border: '#c7d2c8',
      focus: '#be2f3b',
      fontFamily: "'Noto Sans KR', 'Pretendard Variable', 'Pretendard', sans-serif",
      fontSizeBody: '15px',
      fontSizeTitle: 'clamp(2rem, 4vw, 3.6rem)',
      fontSizeHeading: 'clamp(1.25rem, 2vw, 1.7rem)',
      fontSizeLabel: '12px',
      buttonRadius: '2px',
      buttonHeight: '42px',
      buttonPaddingX: '18px',
      buttonFontSize: '14px',
      buttonFontWeight: '750',
      buttonLetterSpacing: '-0.01em',
      inputRadius: '2px',
      cardRadius: '3px',
      cardShadow: '0 8px 18px rgba(12, 73, 57, 0.08)',
    },
  },
] as const;

export const DEFAULT_SHT_THEME: ShtThemeId = 'default';

export function isShtThemeId(value: unknown): value is ShtThemeId {
  return typeof value === 'string' && SHT_THEME_IDS.includes(value as ShtThemeId);
}

export function getShtThemeDefinition(themeId: ShtThemeId): ShtThemeDefinition {
  return SHT_THEME_DEFINITIONS.find((theme) => theme.id === themeId) ?? SHT_THEME_DEFINITIONS[0]!;
}

export function getShtThemeStyle(themeId: ShtThemeId): CSSProperties {
  const tokens = getShtThemeDefinition(themeId).tokens;

  return {
    '--sht-canvas': tokens.canvas,
    '--sht-surface': tokens.surface,
    '--sht-surface-muted': tokens.surfaceMuted,
    '--sht-text': tokens.text,
    '--sht-text-muted': tokens.textMuted,
    '--sht-heading': tokens.heading,
    '--sht-primary': tokens.primary,
    '--sht-primary-hover': tokens.primaryHover,
    '--sht-primary-text': tokens.primaryText,
    '--sht-primary-soft': tokens.primarySoft,
    '--sht-accent': tokens.accent,
    '--sht-border': tokens.border,
    '--sht-focus': tokens.focus,
    '--sht-font-family': tokens.fontFamily,
    '--sht-font-size-body': tokens.fontSizeBody,
    '--sht-font-size-title': tokens.fontSizeTitle,
    '--sht-font-size-heading': tokens.fontSizeHeading,
    '--sht-font-size-label': tokens.fontSizeLabel,
    '--sht-button-radius': tokens.buttonRadius,
    '--sht-button-height': tokens.buttonHeight,
    '--sht-button-padding-x': tokens.buttonPaddingX,
    '--sht-button-font-size': tokens.buttonFontSize,
    '--sht-button-font-weight': tokens.buttonFontWeight,
    '--sht-button-letter-spacing': tokens.buttonLetterSpacing,
    '--sht-input-radius': tokens.inputRadius,
    '--sht-card-radius': tokens.cardRadius,
    '--sht-card-shadow': tokens.cardShadow,
  } as CSSProperties;
}
