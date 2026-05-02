# SHT Platform (v2)

스테이하롱 크루즈 예약/견적/제휴업체 시스템 — 단일 모노레포.

## ⚠️ 단일 저장소 원칙

모든 앱은 `sht-platform` 안에서만 관리합니다. 독립 저장소(`sht-customer`, `sht-manager`, `sht-quote` 등)는 더 이상 수정하지 않습니다.

## 구조

```
sht-platform/
├── apps/
│   ├── customer/        # 고객용 (포트 3000)
│   ├── quote/           # 견적 전용 앱 (포트 3002)
│   ├── manager/         # 매니저 (포트 3001)
│   ├── partner/         # 제휴업체 (포트 3003)
│   ├── admin/           # 관리자 (포트 3004)
│   ├── manager1/        # 빠른패널 (포트 3005)
│   └── customer1/       # 구고객 주문번호 조회 (포트 3006)
├── packages/
│   ├── config/          # 공유 ESLint/TS/Tailwind preset
│   ├── types/           # Zod 스키마 + 도메인 타입
│   ├── db/              # Supabase 클라이언트 팩토리
│   ├── auth/            # 인증 훅/헬퍼
│   ├── domain/          # 가격·시간·견적·예약 순수 함수
│   └── ui/              # 공통 React 컴포넌트
└── tooling/scripts/
```

## 빠른 시작

```bash
# 1) 의존성 설치
pnpm install

# 2) 환경변수 설정
cp .env.example .env.local
# 그리고 .env.local 의 Supabase 키 채우기

# 3) 개발 서버 (둘 다)
pnpm dev

# 또는 개별
pnpm dev:customer   # http://localhost:3000
pnpm dev:quote      # http://localhost:3002
pnpm dev:manager    # http://localhost:3001
```

## 주요 명령

| 명령 | 설명 |
|------|------|
| `pnpm dev` | 모든 앱 동시 실행 |
| `pnpm dev:quote` | 견적 앱 실행 |
| `pnpm build` | 전체 빌드 |
| `pnpm typecheck` | 타입 체크 |
| `pnpm lint` | 린트 |
| `pnpm lint:fix` | 린트 자동 수정 |
| `pnpm test` | 테스트 |

## 앱 목록

| 앱 | 패키지 | 포트 | 설명 |
|---|---|---:|---|
| `apps/customer` | `@sht/customer` | 3000 | 메인 고객 앱 |
| `apps/quote` | `@sht/quote` | 3002 | 견적 전용 앱 (`sht-quote` 이관본) |
| `apps/manager` | `@sht/manager` | 3001 | 메인 매니저 |
| `apps/partner` | `@sht/partner` | 3003 | 제휴업체 예약 시스템 |
| `apps/admin` | `@sht/admin` | 3004 | 관리자 대시보드 |
| `apps/manager1` | `@sht/manager1` | 3005 | 빠른패널 |
| `apps/customer1` | `@sht/customer1` | 3006 | 구고객 주문번호 조회 |

## 기술 스택

- **Next.js 15 App Router** + TypeScript strict
- **Supabase** (PostgreSQL + Auth + RLS) — 기존 프로젝트 그대로 사용
- **TanStack Query v5** + react-hook-form + Zod
- **Tailwind CSS v4** + shadcn/ui
- **Vitest** + Playwright + Sentry
- **pnpm 9** + Turborepo

## 코드 작성 및 파일 생성 안정성 원칙 (필수!)
⚠️ **모든 코드 변경/신규 파일 작성 시 반드시 지켜야 할 원칙**

### 안정성 우선 원칙
1. **기존 패턴 참고 필수**
   - 새로운 파일/기능 작성 시 **같은 디렉토리 또는 유사한 기능의 기존 파일 참고**
   - 예: 고객 앱 새로운 페이지 → `apps/customer/src/app/mypage/direct-booking/cruise/page.tsx` 참고
   - 예: 매니저 앱 새로운 훅 → `apps/manager/src/hooks/` 내 기존 훅 패턴 참고

2. **프로젝트 지침 검토 필수**
   - 코드 작성 전 다음 문서 확인:
     - 고객 프로젝트: `customer/.github/copilot-instructions.md`
     - 매니저 프로젝트: 스트래티지 및 기존 코드 패턴
     - 안정성 원칙 섹션, 코드 관례 섹션 필독

3. **독립적 방식 금지**
   - ❌ 프로젝트 전체와 다른 스타일/패턴으로 작성
   - ❌ 기존 코드와 무관하게 새로운 패턴 도입
   - ✅ 프로젝트 내 다른 페이지/컴포넌트와 **동일한 패턴, 네이밍, 구조** 사용

4. **오류 방지 체크리스트**
   - [ ] 유사한 기존 파일 검토 완료
   - [ ] 프로젝트 지침 확인 완료 (copilot-instructions.md)
   - [ ] try/catch/finally, cancelled 플래그, [] 의존성 확인 (비동기 코드)
   - [ ] 로딩 상태, 에러 처리, 권한 체크 일관성 확인
   - [ ] 팀의 다른 페이지/컴포넌트와 동일한 패턴 적용

### 신규 파일 작성 절차
1. **다른 페이지 참고** → 유사 기능의 기존 파일 구조 분석
2. **지침 검토** → 안정성 원칙, 코드 관례, 표준 패턴 확인
3. **동일 방식 적용** → 프로젝트 전체에서 사용하는 패턴으로 작성
4. **일관성 검증** → 다른 코드와 비교하여 스타일, 네이밍, 구조 동일 확인

## 안정성 원칙

1. `useAuth`는 캐시 우선 + `onAuthStateChange`만 (watchdog 없음)
2. 모든 init `useEffect`는 try/finally + cancelled 플래그 + `[]` 의존성
3. 시간은 `@sht/domain/datetime` 만 사용 (수동 ±9 금지)
4. 가격 조회는 단순 select + 별도 조회 (중첩 FK 조인 금지)
5. 예약 중복 방지: `(re_user_id, re_quote_id, re_type)` 유니크
