---
description: 모바일(@sht/mobile) ↔ manager1(@sht/manager1) 기능 동기화 규칙. manager1이 변경되면 모바일은 단순화된 형태로 동일 기능을 따라가야 함.
applyTo: "apps/mobile/**, apps/manager1/**"
---

# 📱 Mobile (apps/mobile) — manager1 Mirror & Mobile-Optimized 규칙

## 🎯 프로젝트 정체성
- **위치**: `apps/mobile` (모노레포 내부)
- **이름**: `@sht/mobile`
- **포트**: `3007` (`pnpm --filter @sht/mobile dev`)
- **목표**: `apps/manager1`(즐겨찾기 빠른패널)의 기능을 **모바일 전용**으로 제공
- **원본 위치(아카이브)**: `c:\SHT-DATA\mobile` — 더 이상 단독 수정하지 않음. 모든 작업은 `apps/mobile`에서 수행

## 📌 모바일 앱 정체성 원칙 (최우선)
- **mobile은 manager1을 베이스로 구축된 앱** — 기능 로직은 manager1과 동일해야 함
- **UI만 모바일 최적화** — 사이드바 제거, 카드 레이아웃, 터치 친화 UI 적용
- **기능 동등성 원칙**: manager1에서 동작하는 모든 서비스(크루즈, 차량, 공항, 호텔, 투어, 렌터카 등)는 mobile에서도 동일하게 동작해야 함
- **데이터 조회 로직**: Supabase 쿼리·필터·데이터 매핑은 manager1과 100% 동일하게 유지
- **Copilot 작업 규칙**: mobile 수정 시 반드시 manager1 동일 파일을 참고하여 기능 누락·불일치 방지

## ⚖️ manager1 ↔ mobile 동기화 원칙 (필수)
1. **manager1 변경 시 mobile 동반 수정 검토 필수**
   - `apps/manager1/app/manager/<feature>/page.tsx`가 변경되면
   - `apps/mobile/app/<feature>/page.tsx`에도 동일 기능을 반영해야 함
2. **사이드바는 미러링 대상이 아님**
   - manager1: 좌측 고정 사이드바 (`ManagerSidebar.tsx` — 즐겨찾기 + 관리 기타 2섹션)
   - mobile: 사이드바 없음. 홈(`app/page.tsx`)의 즐겨찾기 카드 그리드가 진입점
   - 홈 카드의 **순서·라벨·아이콘 색**은 manager1 즐겨찾기와 동일하게 유지
3. **신규 기능 우선순위**: 필요할 때만 추가 (`AGENTS.md` "필요 시에만 반영" 원칙)
   - 미구현 항목은 홈에서 `comingSoon: true`로 표시 (alert로 안내)

## 🪶 모바일 단순화 규칙 (코드 가볍게)
manager1을 그대로 복사하지 말고, 다음을 **제거/단순화**:
- ❌ 데스크톱 전용 컴포넌트(`ManagerSidebar`, `ManagerLayout`, 데스크톱 모달)
- ❌ PDF/엑셀 출력(`html2pdf.js`, 시트 동기화 등 — 모바일에서 잘 안 씀)
- ❌ 다단 그리드/넓은 테이블 — `flex-col` + 카드 리스트로 대체
- ❌ hover 전용 인터랙션 — `active:scale-[0.98]` 등 터치 친화로 교체
- ❌ 무거운 차트/리포트 — 핵심 수치만 큰 글씨로
- ✅ 핵심 데이터 흐름(supabase 쿼리·필터·저장 로직)은 그대로 차용

## 📐 모바일 UI 표준
- **세로 우선(portrait)**, 가로폭 100% 사용
- 콘텐츠 컨테이너: `max-w-md mx-auto p-4` 정도. 큰 데스크톱 너비 금지
- 주요 액션: 최소 `h-12` (44px+) 터치 영역
- 헤더: 페이지 상단에 `← 뒤로` + 타이틀(고정 또는 sticky)
- 리스트: 카드형(`bg-white rounded-2xl shadow-sm p-4`) — 테이블 금지
- 폼: 한 줄 한 필드(`grid-cols-1`) + 큰 입력(`py-3 text-base`)
- 색상은 manager1과 동일 톤(슬레이트/블루 계열) 유지

### 📝 텍스트 줄바꿈 규칙 (필수)
- **인라인 라벨/상태 표시** (버튼 텍스트, 상태 라벨, 선택 표시 등): `whitespace-nowrap` 적용해서 **항상 1행 표시**
- **의도**: 화면 폭이 좁아지면 텍스트를 자르거나 축약하되, 2행 이상 표시 금지
- **예시**:
  - ✅ "현재 수정: 픽업" → `<span className="whitespace-nowrap">현재 수정: {activeCategory}</span>`
  - ✅ "좌석" → `whitespace-nowrap` (버튼 내 텍스트)
  - ✅ "목록으로" → `whitespace-nowrap` (링크/버튼)
- **장문 콘텐츠** (설명, 메모 등): 자동 줄바꿈 허용 (단, 2행 이상이 자연스러운 경우만)
- **체크리스트**: 수정 시 버튼·라벨이 2행 이상 표시되는지 확인

### 🎯 화면 공간 최대 활용 (필수)
**모바일은 화면이 작으므로 불필요한 공간을 제거하고 화면을 100% 활용해야 함:**
- ✅ **모달/팝업**: `items-end` (모바일 기본) + `sm:items-start` (데스크톱 상단)
- ✅ **높이**: 모달 `max-h-[95vh]` (모바일) / `max-h-[90vh]` (sm: 이상)
- ✅ **시작점**: 모달은 위쪽부터(`pt-0 sm:pt-2`)
- ✅ **리스트 카드**: 한 줄에 필요한 정보만. 여유 margin 최소화
- ✅ **헤더/푸터**: `py-2` 이하로 최소화 (데스크톱처럼 큰 패딩 금지)
- ❌ **기준선 정렬**: 텍스트 센터링·자간 확보 등 데스크톱 스타일 금지
- ❌ **empty space**: 위/아래 불필요한 여백. 콘텐츠가 뷰포트를 가득 채우도록

### 📏 좌우 여백 최소화 (필수)
**모바일은 화면이 좁으므로 불필요한 좌우 여백을 제거해야 함:**
- ✅ **페이지 전체 패딩**: `px-4` → `px-2` 또는 `px-3` (좌우 여백 최소화)
- ✅ **콘텐츠 컨테이너**: `max-w-md mx-auto` 제거 또는 `max-w-full` 사용 (가로폭 100% 활용)
- ✅ **섹션 박스/카드**: `px-4` → `px-3` (내부 여백도 최소화)
- ✅ **폼 입력/필드**: 전체 너비 사용 (`w-full`) — 좌우 제약 금지
- ❌ **과도한 margin**: `mx-4`, `mx-6` 등 불필요한 좌우 마진 금지
- ❌ **centered 레이아웃**: `flex justify-center` 수평 중앙정렬 금지 (화면 좁음)
- **체크리스트**: 페이지 좌우에 불필요한 공간이 없는지 확인

### 🎯 모든 페이지 공간 최대 활용 (필수)
**모든 모바일 페이지에서 화면 가로/세로를 100% 활용해야 함:**
- ✅ **전역 레이아웃** (`layout.tsx`): 최상위 `<div>`는 `w-full`이고 패딩 최소 (`px-0 ~ px-2`)
- ✅ **각 페이지** (`page.tsx`): 콘텐츠는 화면 폭을 가득 채워야 함 (양쪽 여백 없음)
- ✅ **공유 컴포넌트** (`_components/`): 항상 `w-full` 사용, 고정 너비 금지
- ✅ **카드/섹션**: 패딩 `p-6` → `p-4` 또는 `p-3` (내부 여백만 있고 좌우는 바짝)
- ✅ **그리드/리스트**: gap `gap-4` → `gap-2` 또는 `gap-3`으로 줄임
- ✅ **여백 규칙**:
  - 페이지 level: `px-1` ~ `px-2` (최소)
  - 섹션 level: `px-2` ~ `px-3` (경계)
  - 내용 level: `px-3` ~ `px-4` (편안함)
- ❌ **불필요한 `max-w-*`**: 페이지가 너무 좁아지는 제약 금지
- ❌ **세로 여백 낭비**: 위/아래 여유 공간은 필요할 때만 추가
- **점검 항목**:
  1. 개발 도구 모바일 모드 (375px)에서 페이지 열기
  2. 좌/우에 빈 공간이 있는지 확인
  3. 모든 텍스트가 깔끔하게 정렬되었는지 확인

## 🛠 기술 스택 (현재 lock-in)
- **Next.js 16** (App Router) + **React 19** + **Tailwind v4** + **TypeScript 5**
- Supabase 클라이언트: `lib/supabase.ts` 단일 인스턴스
- 인증: `lib/auth.ts` + `app/_components/AuthGate.tsx` — 자체 인증 로직 신규 작성 금지
- 아이콘: `lucide-react`만 사용

> ⚠️ 플랫폼의 다른 앱들(Next 15)과 버전이 다름. `apps/mobile/package.json`의 의존성 변경 시 반드시 명시적 합의 후 진행.

## 🔐 인증·세션 패턴
- 신규 페이지에서 `supabase.auth.getUser/getSession` 직접 호출 금지
- `AuthGate`가 라우트 가드를 담당하므로, 페이지에서는 `supabase.auth.getSession()` 결과만 신뢰
- `canAccessManagerApp()`는 `lib/auth.ts`만 사용 (중복 구현 금지)

## 📁 디렉토리 규약
```
apps/mobile/
├── app/
│   ├── layout.tsx              # 전역 레이아웃 (AuthGate 포함)
│   ├── page.tsx                # 홈 = manager1 즐겨찾기 카드 그리드
│   ├── _components/            # mobile 전용 공유 컴포넌트
│   ├── login/                  # 로그인 (manager 권한만)
│   ├── schedule/               # 신/구 구분
│   ├── reservations/           # 예약 처리
│   ├── reservation-edit/       # 예약 수정 (cruise/airport/vehicle ...)
│   ├── quotes/                 # 견적 입력/목록 (예정)
│   ├── payment-processing/     # 결제 처리 (예정)
│   ├── sht-car/                # 스하 차량 (예정)
│   └── reservations/requests/  # 요청사항 (예정)
├── lib/                        # supabase, auth 등 공유 유틸
├── public/
└── package.json                # @sht/mobile, port 3007
```

## ✅ 새 페이지 추가 체크리스트
- [ ] manager1의 동일 기능 페이지를 먼저 읽고 데이터 흐름 파악
- [ ] 모바일 단순화 규칙으로 불필요 부분 제외
- [ ] `app/page.tsx`의 `FAVORITES` 배열에서 `comingSoon: true` 제거
- [ ] 카드 그리드(2열)에 어울리는 짧은 라벨 유지
- [ ] 페이지 상단에 뒤로 버튼(`<Link href="/">`) 제공
- [ ] 컨테이너 폭 `max-w-md` 준수

## 🚫 금지 사항
- `c:\SHT-DATA\mobile`(아카이브 폴더) 직접 수정 — 항상 `apps/mobile`에서만
- manager1의 데스크톱 사이드바·모달을 그대로 복사
- 자체 Supabase 클라이언트 인스턴스 생성
- 페이지마다 자체 인증 useEffect 작성

## 🚨 모바일 UI 최적화 강제 규칙 (필수, 2026.05.14 추가)
**manager1에서 코드를 가져올 때 UI는 반드시 모바일에 맞게 다운사이징해야 함. 그대로 가져오기 금지.**

### 가로 스크롤 절대 금지
- 모든 페이지에서 `overflow-x-auto`, `whitespace-nowrap` 사용 신중히 (불가피한 경우만)
- 고정 폭(`w-[600px]`, `min-w-[400px]` 등) 절대 금지
- 테이블 → 카드 리스트로 변환
- flex 자식에 `min-w-0` 추가하여 truncate 가능하게

### 모바일 폰트 표준
- 본문/입력: `text-xs` (기본) 또는 `text-sm`
- 페이지 제목: `text-base font-semibold` (`text-lg/xl/2xl` 금지)
- 버튼: `text-xs px-2 py-1` 또는 `text-sm px-3 py-1.5`
- 라벨: `text-[11px]` 또는 `text-xs text-gray-600`
- 절대 사용 금지: `text-2xl`, `text-3xl`, `text-xl` (페이지 본문에서)

### 공간 최소화
- 통계 카드: 단일 행 텍스트 요약. 큰 박스 카드 금지
- 패딩: `p-2` 또는 `p-3` (manager1의 `p-6`, `p-8` 금지)
- gap: `gap-1` 또는 `gap-2` (`gap-4`, `gap-6` 지양)
- 헤더 높이: `h-10` ~ `h-12`
- 컨테이너 폭: `w-full px-2` (전체 사용) 또는 `max-w-md mx-auto`

### manager1 → mobile 다운사이징 작업 흐름
1. 기능 코드(useState, 핸들러, supabase 호출)는 그대로 유지
2. JSX의 className만 모바일 사이즈로 일괄 치환
3. 데스크톱 컴포넌트(ManagerLayout 등)는 모바일 wrapper로 교체
4. 가로로 긴 그리드(`grid-cols-4` 이상)는 `grid-cols-2`로 축소
5. 모달은 bottom sheet 스타일(`items-end`, `rounded-t-2xl`)

