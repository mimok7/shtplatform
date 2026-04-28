# Copilot Instructions for AI Agents

## 🚨 매니저 3종 프로젝트 동시 수정 규칙 (최우선 - 필수)
매니저(`apps/manager`) 관련 수정은 항상 아래 **3개 프로젝트**에 동일하게 반영해야 한다. 한쪽만 수정 금지.

| 프로젝트 | 경로 | 수정 규칙 |
|---------|------|----------|
| **sht-manager** (단독 저장소) | `c:\Users\saint\SH_DATA\sht-manager` | 항상 동일 수정 |
| **sht-manager1** (단독 저장소) | `c:\Users\saint\SH_DATA\sht-manager1` | **해당 메뉴/파일이 존재할 때만 수정. 없으면 스킵** |
| **sht-platform/apps/manager** (모노레포) | `c:\Users\saint\SH_DATA\sht-platform\apps\manager` | 항상 동일 수정 |

### 작업 절차
1. 먼저 `sht-manager1`에 해당 메뉴/파일 존재 여부 확인 (`file_search` 또는 `list_dir` 활용)
2. 존재하면 3개 프로젝트 모두 동일 수정, 존재하지 않으면 `sht-manager` + `sht-platform/apps/manager` 2개만 수정
3. 미러링 시 바이트 단위 일치 확인 권장 (한글 인코딩 문제 방지)

### 미러링 체크리스트
- [ ] `sht-manager1`에 메뉴/파일 존재 여부 확인 완료
- [ ] `sht-manager` 수정 완료
- [ ] `sht-platform/apps/manager` 수정 완료
- [ ] (해당 시) `sht-manager1` 수정 완료
- [ ] 3개(또는 2개) 프로젝트 모두 동일한 코드/디자인 유지 확인

> 참고: 고객(`apps/customer`) 수정은 `sht-customer` + `sht-platform/apps/customer` 2개 프로젝트 동시 수정 규칙을 따른다 (아래 "이중 프로젝트 동시 수정 규칙" 섹션).

## 🚫 sht-manager1 사이드바 수정 금지 (2026.04.27 추가 - 필수)

### sht-manager1의 ManagerSidebar.tsx는 절대 임의 수정 금지
- **`sht-manager1/components/ManagerSidebar.tsx`는 항상 고정 구조 유지**
- sht-manager1의 사이드바는 **"⭐ 즐겨찾기"** + **"📂 관리 기타"** 2개 섹션만 존재
- sht-manager의 사이드바(6개 그룹: 견적관리, 예약조회, 수정/배정, 결제관련, 리포트, 관리도구)와 **구조가 완전히 다름**
- 사이드바 메뉴 변경을 명시적으로 요청받지 않은 한, ManagerSidebar.tsx를 건드리지 말 것
- 새로운 페이지를 sht-manager1에 추가하더라도 사이드바에 자동으로 추가하지 말 것

### 위반 사례 (금지)
- ❌ sht-manager의 sidebar 구조를 sht-manager1에 그대로 복사/미러링
- ❌ "크루즈정보", "크루즈룸" 등 신규 메뉴를 사이드바에 임의 추가
- ❌ 2개 섹션 구조를 6개 그룹 구조로 변환

### 허용 사례
- ✅ 사이드바 수정을 **명시적으로 요청**받은 경우에만 수정

## 프로젝트 개요
**스테이하롱 크루즈 예약 시스템** - Next.js 15.3.5 App Router + Supabase PostgreSQL 기반 견적/예약 관리 웹앱.

## 핵심 아키텍처

### 사용자 역할 시스템
- **견적자 (Guest)**: Supabase 인증만, users 테이블 미등록. 견적 생성/조회만 가능
- **예약자 (Member)**: 예약 시 users 테이블 등록 (`role: 'member'`), 예약 관리 권한
- **매니저 (Manager)**: `role: 'manager'`, 견적 승인/예약 처리
- **관리자 (Admin)**: `role: 'admin'`, 시스템 전체 관리

### 데이터베이스 구조
- **중앙 모델**: `quote` → `quote_item` → 서비스 테이블 (`room`, `car`, `airport`, `hotel`, `rentcar`, `tour`)
- **예약 구조**: `reservation` (메인) → `reservation_*` (서비스별 상세: `reservation_cruise`, `reservation_airport` 등)
- **가격 시스템**: `*_price` 테이블 (room_price, car_price 등)로 동적 가격 계산

### 표준 예약 저장 패턴
```tsx
// 1. 메인 예약 생성
const { data: reservation } = await supabase.from('reservation').insert({
  re_user_id: user.id,
  re_quote_id: quoteId,
  re_type: 'cruise', // 'airport', 'hotel', 'tour', 'rentcar'
  re_status: 'pending'
}).select().single();

// 2. 서비스별 상세 저장 (단일 행, request_note에 추가 서비스 기록)
await supabase.from('reservation_cruise').insert({
  reservation_id: reservation.re_id,
  room_price_code: selectedRoom.room_code,
  checkin: form.checkin,
  guest_count: form.adult_count,
  request_note: additionalServices.join('\n')
});
```

## 성능 최적화 패턴

### React Query 사용 (hooks/useQueries.ts)
```tsx
// 데이터 캐싱 및 자동 리페칭
import { useReservations, usePaymentMethods, useReservationAdditionalData } from '@/hooks/useQueries';

const { data: reservations, isLoading } = useReservations(userId);
const { data: methods } = usePaymentMethods(); // 1시간 캐싱
```

### 컴포넌트 최적화
```tsx
// useCallback으로 함수 메모이제이션
const loadData = useCallback(async () => {
  const { data } = await supabase.from('table').select('*');
}, [dependencies]);

// useMemo로 계산 결과 캐싱
const total = useMemo(() => items.reduce((sum, item) => sum + item.price, 0), [items]);
```

### DB 쿼리 병렬화
```tsx
// 여러 테이블 동시 조회
const [cruiseRes, carRes, airportRes] = await Promise.all([
  supabase.from('reservation_cruise').select('*').in('reservation_id', ids),
  supabase.from('reservation_cruise_car').select('*').in('reservation_id', ids),
  supabase.from('reservation_airport').select('*').in('reservation_id', ids)
]);
```

## 🧹 코드 수정 시 정리 원칙
### 필수 규칙: 불필요한 코드는 반드시 삭제 또는 덮어쓰기
- **수정 시 원칙**: 기존 코드를 `replace_string_in_file` 또는 `multi_replace_string_in_file`로 정확히 **덮어쓰기** (주석만 남겨서도 안 됨)
- **중복 제거**: 코드 구조 변경 후 남은 중복 코드, 미사용 변수, 불필요한 조건문은 **반드시 정리**
- **예시 (잘못된 예)**:
  ```tsx
  // ❌ 기존 코드와 새 코드가 공존 → 혼란 + 버그 원인
  // 이전 방식 (이제 사용 안 함)
  if (oldCondition) { /* ... */ }
  // 새로운 방식
  if (newCondition) { /* ... */ }
  ```
- **예시 (올바른 예)**:
  ```tsx
  // ✅ 기존 코드 완전 제거 후 새 코드로 통일
  if (newCondition) { /* ... */ }
  ```
- **검증**: 수정 후 `useEffect` 의존성, 사용 중인 변수, 호출 함수를 재점검하여 불필요한 상태값/함수 제거
- **파일 사이즈 관리**: 코드 라인이 증가하는 것을 피하고, 리팩토링은 **축약된 형태**로 구현

## 개발 워크플로우

### 주요 명령어
```bash
npm run dev          # 개발 서버 (http://localhost:3000)
npm run build        # 프로덕션 빌드 (타입 체크 무시)
npm run typecheck    # TypeScript 타입 체크만
npm run lint:fix     # ESLint 자동 수정
npm run apply-sql    # SQL 파일 실행 (scripts/apply-sql.js)
```

### 환경 변수 (.env.local)
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```


### 🔄 이중 프로젝트 동시 수정 규칙 (필수!)
⚠️ **두 쌍의 프로젝트가 1:1로 미러링됨** — 한쪽만 수정 시 운영/배포 불일치 발생

**프로젝트 매핑 (필수 동시 수정):**
| 쌍 | 단독 저장소 | 모노레포 위치 | 푸시 명령 |
|----|------------|--------------|----------|
| **고객 앱** | `c:\Users\saint\SH_DATA\sht-customer` | `c:\Users\saint\SH_DATA\sht-platform\apps\customer` | sht-customer: `git push origin main` / sht-platform: `git push customer main` |
| **매니저 앱** | `c:\Users\saint\SH_DATA\sht-manager` (있는 경우) | `c:\Users\saint\SH_DATA\sht-platform\apps\manager` | sht-manager: `git push origin main` / sht-platform: `git push` |

**작업 기본 원칙:**
- **동일 수정 (필수 미러링)**: UI/페이지/훅/lib/컴포넌트 변경 시 → **반드시 단독 저장소 + 모노레포 양쪽 모두 적용**
  - 고객 페이지 수정 → `sht-customer` + `sht-platform/apps/customer` **둘 다**
  - 매니저 페이지 수정 → `sht-manager` + `sht-platform/apps/manager` **둘 다**
- **공유 라이브러리** (`packages/*`): 모노레포에서만 수정, 두 앱 모두 빌드 검증
- **단독 수정 가능**: 각 앱 고유의 페이지/로직만 (예: 고객의 `/mypage`, 매니저의 `/manager`)

**미러링 표준 절차:**
1. 모노레포(`sht-platform/apps/<app>`) 먼저 수정 → 빌드/타입체크
2. 단독 저장소(`sht-<app>`)에 **바이트 단위 동일 복사** (`[System.IO.File]::ReadAllBytes`/`WriteAllBytes` — 한글 인코딩 안전)
3. 단독 저장소에서도 빌드 검증
4. 양쪽 각각 커밋 + 푸시

**이중 수정 체크리스트:**
- [ ] 모노레포(`sht-platform/apps/<app>`) 수정 완료
- [ ] 단독 저장소(`sht-<app>/`) 동일 미러링 완료 (바이트 일치 확인)
- [ ] 양쪽 빌드/타입체크 통과
- [ ] 양쪽 커밋 + 푸시 완료

**예시 (고객 앱):**
```powershell
# 1. 모노레포 수정 후 미러링
$src='c:\Users\saint\SH_DATA\sht-platform\apps\customer\src\app\.../page.tsx'
$dst='c:\Users\saint\SH_DATA\sht-customer\app\.../page.tsx'
[System.IO.File]::WriteAllBytes($dst,[System.IO.File]::ReadAllBytes($src))

# 2. 빌드
pnpm --filter @sht/customer build
npm --prefix c:\Users\saint\SH_DATA\sht-customer run build

# 3. 양쪽 푸시
cd c:\Users\saint\SH_DATA\sht-platform; git add . ; git commit -m "..."; git push customer main
cd c:\Users\saint\SH_DATA\sht-customer; git add . ; git commit -m "..."; git push origin main
```

**공유 라이브러리 변경 시:**
- `packages/ui`, `packages/types` 등 변경 → 두 앱 모두 `pnpm install` / `npm install` 필요
- `turbo.json`, `pnpm-workspace.yaml` 등 → 반드시 두 프로젝트에서 빌드 검증

### 🛡️ 독립 코드/인증/세션 생성 금지 (필수!)
⚠️ **새 페이지/기능 작성 시 절대 독자적인 패턴 도입 금지** — 운영 중 인증 깨짐, 무한 로딩, 예약 중단 버그의 주요 원인

**금지 사항 (오류의 원인):**
- ❌ 자체 `useEffect` + `supabase.auth.getUser/getSession` 직접 호출 (이미 `useAuth` 훅 존재)
- ❌ 자체 `setTimeout` watchdog/`refreshSession()` 강제 호출 (Supabase `autoRefreshToken`이 처리)
- ❌ 자체 `localStorage` 세션 캐시 (이미 `lib/authCache.ts` 존재)
- ❌ 자체 토스트/스피너/모달 컴포넌트 (이미 `components/` 존재)
- ❌ 자체 Supabase 클라이언트 인스턴스 생성 (`@/lib/supabase` 단일 인스턴스 사용)
- ❌ 다른 페이지와 다른 로딩/에러/권한 체크 패턴

**필수 절차 (오류 예방):**
1. **유사 기존 페이지 먼저 읽기** — 새 페이지 작성 전 동일 카테고리(`direct-booking/cruise`, `direct-booking/airport` 등)의 기존 페이지 구조를 그대로 따른다
2. **표준 훅/유틸 사용**:
   - 인증: `useAuth` (hooks/useAuth.ts) — 절대 자체 구현 금지
   - 세션 조회: `getSessionUser` / `refreshAuthBeforeSubmit` (lib/authHelpers.ts)
   - DB 쿼리 캐싱: `useQueries.ts`의 React Query 훅
   - 로딩 타임아웃: `useLoadingTimeout`
3. **컴포넌트 재사용**: `PageWrapper`, `SectionBox`, `Spinner` 등 — 신규 생성 금지
4. **이 문서의 안정성 패턴 준수**:
   - 무한 로딩 버그 해결 (try-catch-finally + cancelled 플래그 + `[]` 의존성)
   - 예약 작업 중단 버그 해결 (watchdog 제거, `getSession()`만 사용, 강제 로그아웃 금지)

**신규 파일 작성 체크리스트:**
- [ ] 유사 기존 페이지 검토 완료 (어느 파일 참조했는지 명시)
- [ ] `useAuth` 훅 사용 (자체 인증 로직 없음)
- [ ] 표준 컴포넌트(`PageWrapper`, `SectionBox`) 사용
- [ ] 로딩/에러 처리 패턴이 다른 페이지와 동일
- [ ] try-catch-finally + cancelled 플래그 + `[]` 의존성 적용
- [ ] 두 프로젝트 모두 동일 적용

## 코드 관례

### 인증 및 권한 체크
```tsx
// hooks/useAuth.ts 사용
import { useAuth } from '@/hooks/useAuth';

const { user, profile, loading } = useAuth(['member']); // 예약자 권한 필요
if (loading) return <Spinner />;
```

### 데이터 조회 패턴
```tsx
// 중첩 조인으로 관련 데이터 한 번에 조회
const { data } = await supabase
  .from('reservation')
  .select(`
    *,
    quote:re_quote_id(title, status),
    user:re_user_id(name, email)
  `)
  .eq('re_user_id', userId);
```

### UI 컴포넌트 구조
```tsx
import PageWrapper from '@/components/PageWrapper';
import SectionBox from '@/components/SectionBox';

<PageWrapper>
  <SectionBox title="섹션 제목">
    {loading ? <Spinner /> : <Content />}
  </SectionBox>
</PageWrapper>
```

### 로딩 상태 표준화
```tsx
if (loading) return (
  <div className="flex justify-center items-center h-72">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
  </div>
);
```

## 프로젝트 구조
```
sht-customer/
├── app/                      # Next.js App Router
│   ├── mypage/              # 사용자 페이지
│   │   ├── quotes/         # 견적 관리
│   │   ├── reservations/   # 예약 관리
│   │   └── direct-booking/ # 직접 예약 (cruise, airport, hotel, tour, rentcar)
│   ├── admin/              # 관리자 페이지 (별도 관리)
│   └── api/                # API Routes
├── components/              # 재사용 컴포넌트
│   ├── PageWrapper.tsx
│   ├── SectionBox.tsx
│   └── ...
├── hooks/                   # 커스텀 훅
│   ├── useAuth.ts          # 인증 및 권한 관리
│   └── useQueries.ts       # React Query 훅 (예약, 견적, 가격 등)
├── lib/                     # Supabase 클라이언트 및 유틸리티
│   ├── supabase.ts
│   ├── queryClient.ts      # React Query 설정
│   └── *Price*.ts          # 가격 계산 로직
├── sql/                     # DB 스키마 및 마이그레이션
│   ├── db.csv              # 테이블 구조 정의
│   └── performance_indexes.sql # 성능 인덱스 (Supabase에서 실행 필요)
└── scripts/                 # 유틸리티 스크립트
    └── apply-sql.js        # SQL 실행 스크립트
```

## 코드 작성 및 파일 생성 안정성 원칙 (필수!)
⚠️ **모든 코드 변경/신규 파일 작성 시 반드시 지켜야 할 원칙**

### 안정성 우선 원칙
1. **기존 패턴 참고 필수**
   - 새로운 파일/기능 작성 시 **같은 디렉토리 또는 유사한 기능의 기존 파일 참고**
   - 예: 새로운 페이지 작성 → `app/mypage/direct-booking/cruise/page.tsx` 참고
   - 예: 새로운 훅 작성 → `hooks/useAuth.ts`, `hooks/useQueries.ts` 패턴 참고

2. **프로젝트 지침 검토 필수**
   - 코드 작성 전 다음 지침 확인:
     - 이 문서 (`.github/copilot-instructions.md`)
     - 안정성 원칙 섹션 (무한 로딩, 예약 작업 중단 버그 해결 패턴)
     - 코드 관례 섹션 (인증, 데이터 조회, 컴포넌트 구조 패턴)

3. **독립적 방식 금지**
   - ❌ 프로젝트 전체와 다른 스타일/패턴으로 작성
   - ❌ 기존 코드와 무관하게 새로운 패턴 도입
   - ✅ 프로젝트 내 다른 페이지/컴포넌트와 **동일한 패턴, 네이밍, 구조** 사용

4. **오류 방지 체크리스트**
   - [ ] 유사한 기존 파일 검토 완료
   - [ ] 프로젝트 지침(이 문서) 확인 완료
   - [ ] try/catch/finally, cancelled 플래그, [] 의존성 확인
   - [ ] 로딩 상태, 에러 처리, 권한 체크 일관성 확인
   - [ ] 팀의 다른 페이지/컴포넌트와 동일한 패턴 적용

### 신규 파일 작성 절차
1. **다른 페이지 참고** → 유사 기능의 기존 파일 구조 분석
2. **지침 검토** → 안정성 원칙, 코드 관례, 표준 패턴 확인
3. **동일 방식 적용** → 프로젝트 전체에서 사용하는 패턴으로 작성
4. **일관성 검증** → 다른 코드와 비교하여 스타일, 네이밍, 구조 동일 확인

## 호텔 추가 절차 (필수 체크리스트!)
⚠️ **호텔을 추가한 후에는 반드시 호텔 가격 싱크 쿼리를 실행해야 견적/예약 페이지에 표시됩니다.**

### 단계 1: 호텔 SQL 파일 생성 및 실행
- 파일 위치: `sql/00X-호텔명-data.sql` (예: `009-l7-hotel-hanoi-2026-data.sql`)
- 선행 조건: `001-hotel-system-v3-tables-2026.sql` 실행 완료
- 포함 내용:
  - `hotel_info`: 호텔 기본정보 (호텔명, 위치, 체크인/아웃 시간 등)
  - `room_type`: 객실 타입 (7-8개 객실 구성)
  - `pricing_model`: 가격 정보 (2026년 전체 시즌)

### 단계 2: 호텔 가격 싱크 실행 (필수!)
**이 단계를 건너뛰면 호텔이 UI에 표시되지 않습니다:**
```
Supabase Dashboard → SQL Editor에서 아래 파일 실행:
sql/010-sync-hotel-price-2026.sql
```
- 역할: v3 테이블(hotel_info, room_type, pricing_model) → hotel_price 테이블로 자동 변환
- 시간: 보통 1-2초 소요
- 검증: 파일의 주석 처리된 검증 쿼리 실행하여 데이터 확인

### 단계 3: 페이지 확인
호텔이 정상 표시되는지 확인:
- 견적 페이지: `/mypage/quotes/hotel`
- 직접예약 페이지: `/mypage/direct-booking/hotel`

## 중요 제약 사항
- **폴더 구조 변경 금지**: 기존 구조 유지, 새 폴더 생성 자제
- **DB 스키마 참조**: sql/db.csv 확인, 불일치 시에만 DB 재확인
- **타입 체크**: 빌드 시 무시 설정됨 (`typescript.ignoreBuildErrors: true`), 개발 중엔 `npm run typecheck` 사용
- **호텔 싱크 필수**: 호텔 추가 후 반드시 010-sync-hotel-price-2026.sql 실행 (UI 표시 필수)

## DB 성능 최적화
- `sql/performance_indexes.sql` 참조 - 17개 테이블에 60+ 인덱스 정의
- Supabase Dashboard → SQL Editor에서 실행 필요
- 주요 인덱스: reservation 테이블 (user_id, quote_id, status), price 테이블 (조회 조건별)

## 테스트 및 디버깅
```bash
npm test              # Jest 테스트 실행
npm run test:watch    # 테스트 Watch 모드
```
- 테스트 설정: jest.config.js, jest.setup.js
- Testing Library 사용 (@testing-library/react)

## ⚠️ 무한 로딩 버그 해결 (2026.03.23 업데이트 - 필수)
### 증상: "세션 확인 중..." 무한 대기 또는 "권한 확인 중..." 멈춤

### 근본 원인
`ManagerLayout.tsx`, `AdminLayout.tsx`에서 다음 3가지 문제 복합:
1. **try-catch 없음** → `supabase.auth.getUser()` 실패 시 `setIsLoading(false)` 미호출 → 영구 로딩
2. **분기별 누락** → `router.push()` 후 `setIsLoading(false)` 미호출
3. **의존성 문제** → `useEffect(..., [router])` → `router` 변경 시 재실행

### 표준 해결 패턴 (필수 적용)
```tsx
// ✅ ManagerLayout.tsx / AdminLayout.tsx
useEffect(() => {
  let cancelled = false;  // 언마운트 후 상태 업데이트 방지
  const init = async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (cancelled) return;
      
      if (error || !data.user) {
        setUserRole('guest');
        setIsLoading(false);
        return;
      }
      // ... 나머지 처리 ...
    } catch (err) {
      console.error('비동기 오류:', err);
      if (cancelled) return;
      setUserRole('guest');  // 기본값 설정
    } finally {
      if (!cancelled) setIsLoading(false);  // ✅ 반드시 실행
    }
  };
  
  init();
  return () => { cancelled = true; };  // 클린업
}, []);  // ✅ [] 의존성 - 최초 1회만
```

### 주요 수정 사항
- **try-catch-finally**: 어떤 오류도 `setIsLoading(false)` 보장
- **모든 분기**: 권한 없음, 로그인 필요, 성공 등 **모든 경로**에서 로딩 해제
- **cancelled 플래그**: 컴포넌트 언마운트 후 stale state 업데이트 방지
- **의존성 []**: 불필요한 중복 호출 제거

### 검증 체크리스트
- [ ] `try { ... } finally { setIsLoading(false) }` 구조 확인
- [ ] `router.push()` 직후에도 `setIsLoading(false)` 호출 확인
- [ ] `cancelled` 플래그로 언마운트 보호 확인
- [ ] `useEffect` 의존성 `[]` 사용 확인 (`[router]` 금지)

## ⚠️ 예약 작업 중단 버그 해결 (2026.04.24 업데이트 - 필수)
### 증상: 예약 입력 중 다른 작업 후 돌아오면 "프로그램이 이어서 작업이 안 됨" + "로그인 사용자를 표시 못함" + "새로고침해도 작동 안 함"

### 근본 원인 3가지
1. **`useAuth`의 12초 watchdog 타임아웃** → `setTimeout(..., 12000)` 후 `loading: false`로 만들지만 `user: null` 그대로 → 빈 화면 표시 → "로그인 사용자 표시 못함"
   - 문제: 실제 세션은 있어도 타임아웃 발생 시 강제로 `loading: false, user: null` 설정
   
2. **탭/앱 전환 후 `silent` 모드 재확인 실패 시 강제 로그인 이동** → visibilitychange/focus 마다 백그라운드에서 `doCheckAuth(false, true)` 호출 → 일시적 네트워크 오류 발생 시 `router.replace('/login')` 강제 이동 → "작업 중단"
   - 문제: silent 모드는 사용자 인지 없이 백그라운드에서 도는데 실패 시 사용자를 강제 로그아웃
   
3. **Supabase `autoRefreshToken: true`와 중복 갱신** → Supabase 클라이언트가 이미 토큰 자동 갱신하는데, `useSessionRefresh`, `refreshAuthBeforeSubmit`, visibilitychange 핸들러가 추가 갱신 시도 → 경쟁 상태로 오히려 불안정
   - 문제: 여러 곳에서 동시에 토큰 갱신 시도 → 순서 미정 + 네트워크 지연 → 제출 실패

### 표준 해결 패턴 (필수 적용)
```tsx
// ✅ hooks/useAuth.ts (전면 단순화)
export function useAuth(redirectOnFail: string = '/login') {
    const router = useRouter();
    // 1. 캐시에서 즉시 읽기 → 깜빡임 방지
    const cached = typeof window !== 'undefined' ? readSessionCache() : null;
    const [authState, setAuthState] = useState<AuthState>({
        user: cached,
        loading: !cached,  // 캐시 있으면 즉시 ready
        error: null,
    });

    useEffect(() => {
        let cancelled = false;

        // 2. 최초 1회만 getSession() 호출 (watchdog/타임아웃 없음)
        const checkOnce = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (cancelled) return;
                if (session?.user) {
                    writeSessionCache(session.user);
                    setAuthState({ user: session.user, loading: false, error: null });
                } else if (!cached) {
                    // 캐시도, 세션도 없을 때만 로그인 페이지로 이동
                    setAuthState({ user: null, loading: false, error: null });
                    router.replace(redirectOnFail);
                } else {
                    // 캐시 있으면 유지 (네트워크 일시 장애 대비)
                    setAuthState(prev => ({ ...prev, loading: false }));
                }
            } catch (err) {
                if (cancelled) return;
                // 오류 발생 시 캐시 사용자 유지 (강제 로그아웃 금지) ✅
                setAuthState(prev => ({ ...prev, loading: false, error: err as Error }));
            }
        };

        checkOnce();

        // 3. onAuthStateChange로 Supabase 변경 자동 반영 (manual 갱신 불필요)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (cancelled) return;
            if (event === 'SIGNED_OUT') {
                writeSessionCache(null);
                setAuthState({ user: null, loading: false, error: null });
                router.replace(redirectOnFail);
                return;
            }
            if (session?.user) {
                writeSessionCache(session.user);
                setAuthState({ user: session.user, loading: false, error: null });
            }
        });

        return () => {
            cancelled = true;
            try { subscription?.unsubscribe?.(); } catch { /* noop */ }
        };
    }, []);  // ✅ [] 의존성 - 최초 1회만

    return { ...authState, isAuthenticated: !!authState.user, refetch };
}
```

```tsx
// ✅ lib/authHelpers.ts (단순화 - 로컬 읽기만)
export async function getSessionUser(_timeoutMs?: number): Promise<{ user: any; error: any }> {
  try {
    // getSession()은 로컬 캐시만 읽음 → 네트워크 호출 없음
    const { data: { session }, error } = await supabase.auth.getSession();
    if (session?.user) return { user: session.user, error: null };
    
    // 로컬 백업에서 복구 시도
    const fallbackUser = getStoredSessionUser();
    if (fallbackUser) return { user: fallbackUser, error: null };
    
    return { user: null, error };
  } catch (err) {
    const fallbackUser = getStoredSessionUser();
    if (fallbackUser) return { user: fallbackUser, error: null };
    return { user: null, error: err };
  }
}

// ✅ Supabase autoRefreshToken이 알아서 처리하므로 단순 조회만
export async function refreshAuthBeforeSubmit(_timeoutMs?: number): Promise<{ user: any; error?: any }> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (session?.user) return { user: session.user, error: null };
    const fallbackUser = getStoredSessionUser();
    if (fallbackUser) return { user: fallbackUser, error: null };
    return { user: null, error: error || new Error('No active session') };
  } catch (err) {
    const fallbackUser = getStoredSessionUser();
    if (fallbackUser) return { user: fallbackUser, error: null };
    return { user: null, error: err };
  }
}
```

### 핵심 원칙 (인증/세션 최소화)
- ✅ **로컬 캐시 우선** → `getSession()`만 사용 (네트워크 호출 없음)
- ✅ **watchdog 제거** → 12초 타임아웃으로 인한 false negative 제거
- ✅ **탭 전환 후 강제 재확인 금지** → Supabase의 `onAuthStateChange` 리스너만 사용
- ✅ **토큰 갱신 일원화** → Supabase `autoRefreshToken: true`만 신뢰 (중복 갱신 금지)
- ✅ **일시적 오류 대응** → 강제 로그아웃 금지, 캐시 사용자 유지

### 수정 범위 (2026.04.24)
- `hooks/useAuth.ts` - 302줄 → 145줄 (단순화)
- `lib/authHelpers.ts` - `withTimeout` 래퍼 제거, `getUser()` fallback 제거
- ~~`hooks/useSessionRefresh.ts`~~ - 삭제 (불필요)
- `app/mypage/direct-booking/{cruise,airport,hotel,tour}/page.tsx` - `useSessionRefresh` 제거

### 검증 체크리스트
- [ ] `useAuth`에서 watchdog 타임아웃 없는지 확인
- [ ] focus/visibilitychange 리스너 없는지 확인 (onAuthStateChange만 사용)
- [ ] `getSessionUser`에서 `getUser()` 네트워크 호출 없는지 확인
- [ ] `refreshAuthBeforeSubmit`에서 강제 `refreshSession()` 없는지 확인
- [ ] booking 페이지에서 `useSessionRefresh` import 제거 확인
