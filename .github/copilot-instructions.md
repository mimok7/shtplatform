# Copilot Instructions for AI Agents

## 📌 프로젝트 개요
**스테이하롱 크루즈 예약 시스템** — Next.js 15.5.15 App Router + Supabase PostgreSQL 기반 견적/예약 관리 웹앱.  
**모노레포**: `c:\Users\saint\SH_DATA\sht-platform` (GitHub: `mimok7/shtplatform`)

### 앱 구성 (apps/)
| 앱 | 이름 | 포트 | 도메인 | 설명 |
|----|------|------|--------|------|
| `apps/customer` | @sht/customer | 3000 | `staycruise.kr` | 메인 고객 앱 (견적·예약) |
| `apps/quote` | @sht/quote | 3002 | `quote.stayhalong.com` | 견적 전용 앱 (독립 `sht-quote` 이관본) |
| `apps/customer1` | @sht/customer1 | 3006 | `legacy.staycruise.kr` | 구고객 주문번호 조회 |
| `apps/manager` | @sht/manager | 3001 | `manager.staycruise.kr` | 메인 매니저 (6그룹 사이드바) |
| `apps/manager1` | @sht/manager1 | 3005 | `quick.manager.staycruise.kr` | 즐겨찾기 빠른패널 (2섹션 고정) |
| `apps/admin` | @sht/admin | 3004 | `admin.staycruise.kr` | 관리자 대시보드 |
| `apps/partner` | @sht/partner | 3003 | `partner.staycruise.kr` | 제휴업체 예약 시스템 |
| `apps/mobile` | @sht/mobile | 3007 | (예정) `m.staycruise.kr` | manager1 mirror — 모바일 전용 경량 앱 |

---

## 🏗️ 단일 저장소 원칙 (최우선 - 필수)

### ✅ 모든 작업은 `sht-platform` 모노레포에서만 수행
- **단독 저장소(`sht-manager`, `sht-customer`, `sht-manager1`, `sht-customer1`, `sht-admin`, `sht-quote`) 수정 금지**
- 코드는 `c:\Users\saint\SH_DATA\sht-platform\apps\<앱명>\` 안에서만 편집
- 커밋·푸시: `git push origin main` (origin = `https://github.com/mimok7/shtplatform.git`)

### ❌ 구(舊) 미러링 규칙 폐지 (2026.04.30 기준)
이전에 존재했던 다음 규칙은 **완전 폐지**됨:
- ~~매니저 3종 동시 수정 규칙~~ (sht-manager / sht-manager1 / sht-platform)
- ~~이중 프로젝트 미러링~~ (sht-customer + sht-platform/apps/customer 동시 수정)
- ~~견적 프로젝트 독립 관리~~ (sht-quote 단독 수정 금지, `apps/quote`에서만 관리)
- ~~바이트 단위 robocopy 미러링~~ (더 이상 불필요)

### Git 작업 표준
```powershell
# 수정 후 커밋·푸시 (모노레포 단일)
cd c:\Users\saint\SH_DATA\sht-platform
git add .
git commit -m "feat(manager): 변경 내용"
git push origin main
```

---

## � manager ↔ manager1 기능 동기화 원칙 (필수)
- **`apps/manager`와 `apps/manager1`은 기능 페이지를 항상 동일하게 수정해야 함**
- 한 앱에만 수정이 적용되면 반드시 다른 앱에도 동일하게 반영
- 경로 대응 예시:
  - `apps/manager/src/app/manager/reservation-edit/cruise/page.tsx`
  - `apps/manager1/app/manager/reservation-edit/cruise/page.tsx`
- 단, **사이드바 구조는 예외** — manager1의 사이드바는 별도 규칙을 따름 (아래 참조)
- 신규 기능·버그 수정 시 두 앱 모두 변경 완료 후 커밋

- 매니저에서 파일을 수정할 때, 동일한 경로에 `apps/manager1`에 해당 파일이 존재하면 반드시 동일한 변경을 적용해야 합니다. (파일 존재 여부 확인 후 반영하지 않으면 커밋/PR을 올리지 마세요)
  - 자동 검사용 스크립트: `scripts/check-manager1-mirror.js`를 제공하며, 로컬에서 실행하거나 CI/훅에 연결해 규칙을 강제할 수 있습니다.

---

## �🚫 manager1 사이드바 구조 보호 (필수)
- **`apps/manager1/components/ManagerSidebar.tsx`는 항상 고정 구조 유지**
- 사이드바 섹션: **"⭐ 즐겨찾기"** + **"📂 관리 기타"** 2개만 존재
- `apps/manager`의 6그룹 사이드바 구조를 manager1에 복사/미러링 절대 금지
- 새 페이지를 추가할 때도 사이드바를 **명시적 요청 없이 임의 수정 금지**

---

## 📱 mobile ↔ manager1 동기화 원칙 (필수)
- **`apps/mobile`은 `apps/manager1`의 모바일 전용 경량 mirror**
- manager1의 기능 페이지를 변경하면 `apps/mobile/app/<feature>/page.tsx`도 함께 업데이트 검토
- 단, 모바일은 **단순화·경량화**가 원칙 — 데스크톱 사이드바/PDF/넓은 테이블 등은 제외하고 핵심 흐름만 차용
- UI는 모바일 최적화: 세로 보기, `max-w-md`, 카드 리스트, 큰 터치 영역
- 자세한 규칙: `.github/instructions/mobile-mirror-manager1.instructions.md`
- 단독 폴더 `c:\SHT-DATA\mobile`(아카이브)은 더 이상 수정 금지 — 항상 `apps/mobile`에서 작업

---

## 핵심 아키텍처

### 사용자 역할 시스템
- **견적자 (Guest)**: Supabase 인증만, users 테이블 미등록. 견적 생성/조회만 가능
- **예약자 (Member)**: 예약 시 users 테이블 등록 (`role: 'member'`), 예약 관리 권한
- **매니저 (Manager)**: `role: 'manager'`, 견적 승인/예약 처리
- **관리자 (Admin)**: `role: 'admin'`, 시스템 전체 관리
- **파트너 (Partner)**: `role: 'partner'`, 제휴업체 담당자 (partner_user 매핑)

### 데이터베이스 구조
- **중앙 모델**: `quote` → `quote_item` → 서비스 테이블 (`room`, `car`, `airport`, `hotel`, `rentcar`, `tour`)
- **예약 구조**: `reservation` (메인) → `reservation_*` (서비스별 상세)
- **제휴업체**: `partner` → `partner_service` → `partner_price` / `partner_user` / `partner_reservation`
- **가격 시스템**: `*_price` 테이블로 동적 가격 계산
- **스키마 참조 (권장)**: `sht-platform/sql/db-schema.json` — 구조화된 JSON 스키마를 기본 참조로 사용하세요. CSV는 가볍게 참고용으로 보관됩니다 (`sht-platform/sql/db.csv`).

### 표준 예약 저장 패턴
```tsx
const { data: reservation } = await supabase.from('reservation').insert({
  re_user_id: user.id,
  re_quote_id: quoteId,
  re_type: 'cruise',
  re_status: 'pending'
}).select().single();

await supabase.from('reservation_cruise').insert({
  reservation_id: reservation.re_id,
  room_price_code: selectedRoom.room_code,
  checkin: form.checkin,
  guest_count: form.adult_count,
  request_note: additionalServices.join('\n')
});
```

---

## 개발 워크플로우

### 주요 명령어
```bash
# 모노레포 루트에서
pnpm install                              # 의존성 설치
pnpm --filter @sht/manager dev            # 매니저 개발 서버 (포트 3001)
pnpm --filter @sht/manager1 dev           # 빠른패널 (포트 3005)
pnpm --filter @sht/customer dev           # 고객 개발 서버 (포트 3000)
pnpm --filter @sht/quote dev              # 견적 전용 앱 (포트 3002)
pnpm --filter @sht/customer1 dev          # 구고객 (포트 3006)
pnpm --filter @sht/admin dev              # 관리자 (포트 3004)
pnpm --filter @sht/partner dev            # 파트너 (포트 3003)
pnpm --filter @sht/mobile dev             # 모바일 (포트 3007, manager1 mirror)

# 특정 앱 빌드
pnpm --filter @sht/<앱명> build
```

### 환경 변수 (.env.local — 각 앱 폴더에 위치)
```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key  # 서버 전용
```

---

## 🧹 코드 수정 시 정리 원칙
- **덮어쓰기 원칙**: `replace_string_in_file` / `multi_replace_string_in_file`로 기존 코드 정확히 덮어쓰기
- **중복 제거**: 코드 구조 변경 후 남은 중복 코드, 미사용 변수, 불필요한 조건문은 반드시 정리
- **파일 크기 관리**: 리팩토링은 축약된 형태로 구현, 코드 라인 증가 최소화

---

## 🛡️ 독립 코드/인증/세션 생성 금지 (필수)
새 페이지/기능 작성 시 아래 패턴 도입 **절대 금지**:
- ❌ 자체 `useEffect` + `supabase.auth.getUser/getSession` 직접 호출 (이미 `useAuth` 훅 존재)
- ❌ 자체 `setTimeout` watchdog/`refreshSession()` 강제 호출 (Supabase `autoRefreshToken`이 처리)
- ❌ 자체 `localStorage` 세션 캐시 (이미 `lib/authCache.ts` 존재)
- ❌ 자체 Supabase 클라이언트 인스턴스 생성 (`@/lib/supabase` 단일 인스턴스 사용)
- ❌ 자체 토스트/스피너/모달 컴포넌트 (이미 `components/` 존재)

**표준 훅/유틸 사용**:
- 인증: `useAuth` (hooks/useAuth.ts) — 절대 자체 구현 금지
- 세션 조회: `getSessionUser` / `refreshAuthBeforeSubmit` (lib/authHelpers.ts)
- DB 쿼리 캐싱: `useQueries.ts`의 React Query 훅

**신규 파일 작성 체크리스트**:
- [ ] 유사 기존 페이지 검토 완료
- [ ] `useAuth` 훅 사용 (자체 인증 로직 없음)
- [ ] 표준 컴포넌트(`PageWrapper`, `SectionBox`) 사용
- [ ] try-catch-finally + cancelled 플래그 + `[]` 의존성 적용

---

## 성능 최적화 패턴

### React Query 사용
```tsx
import { useReservations, usePaymentMethods } from '@/hooks/useQueries';
const { data: reservations, isLoading } = useReservations(userId);
const { data: methods } = usePaymentMethods(); // 1시간 캐싱
```

### DB 쿼리 병렬화
```tsx
const [cruiseRes, carRes, airportRes] = await Promise.all([
  supabase.from('reservation_cruise').select('*').in('reservation_id', ids),
  supabase.from('reservation_cruise_car').select('*').in('reservation_id', ids),
  supabase.from('reservation_airport').select('*').in('reservation_id', ids)
]);
```

---

## 코드 관례

### 인증 및 권한 체크
```tsx
import { useAuth } from '@/hooks/useAuth';
const { user, profile, loading } = useAuth(['member']);
if (loading) return <Spinner />;
```

### 데이터 조회 패턴
```tsx
const { data } = await supabase
  .from('reservation')
  .select(`*, quote:re_quote_id(title, status), user:re_user_id(name, email)`)
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

### 모달 데이터 로드 패턴 (중요)
**원칙**: 모달은 항상 DB에서 fresh 데이터를 **직접 조회**해야 함. 메모리 캐시만 사용하면 누락된 데이터 가능성 높음.

```tsx
// ❌ 안 됨: 캐시만 사용 → 누락된 서비스 가능
const openDetail = (item: any) => {
  const related = allData.filter(d => d.quoteId === item.quoteId);
  setModalItems(related);  // 일부 누락 가능
};

// ✅ 올바름: DB 직접 조회 → 모든 서비스 표시
const openDetail = async (item: any) => {
  setModalOpen(true);  // 즉시 열기
  try {
    const { data: allReservations } = await supabase
      .from('reservation')
      .select('re_id, re_type')
      .eq('re_quote_id', quoteId);
    
    // 8개 서비스 테이블 병렬 조회
    const [cruiseRes, carRes, airportRes, ...] = await Promise.all([
      supabase.from('reservation_cruise').select('*').in('reservation_id', ids),
      supabase.from('reservation_cruise_car').select('*').in('reservation_id', ids),
      supabase.from('reservation_airport').select('*').in('reservation_id', ids),
      // ... 나머지 테이블
    ]);
    
    // modalItems 구성 후 상태 업데이트
    setModalItems(aggregated);
  } catch (err) {
    console.error('조회 실패:', err);
    // 에러 시에도 모달은 이미 열림 (초기 item 표시)
  }
};
```

**참고**: 자세한 구현 방법은 [모달 통일 가이드](./instructions/modal-unification-guide.instructions.md) 참조

### 로딩 상태 표준화
```tsx
if (loading) return (
  <div className="flex justify-center items-center h-72">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500" />
  </div>
);
```

---

## 프로젝트 구조 (모노레포)
```
sht-platform/
├── apps/
│   ├── customer/            # 메인 고객 앱 (Next.js App Router)
│   ├── quote/               # 견적 전용 앱 (sht-quote 이관본)
│   │   ├── app/             # Next.js App Router
│   │   ├── components/      # PageWrapper, SectionBox, Spinner...
│   │   ├── hooks/           # useAuth, useQueries
│   │   └── lib/             # supabase, authHelpers, queryClient
│   ├── customer1/           # 구고객 주문번호 조회 (Order-based)
│   ├── manager/             # 메인 매니저 (견적·예약·결제·리포트)
│   ├── manager1/            # 즐겨찾기 빠른패널 (2섹션 고정 사이드바)
│   ├── admin/               # 관리자 대시보드
│   └── partner/             # 제휴업체 예약 시스템
├── packages/
│   ├── auth/               # 공유 인증 로직
│   ├── types/              # 공유 타입
│   ├── ui/                 # 공유 UI 컴포넌트
│   └── db/                 # DB 유틸리티
├── sql/                    # DB 스키마·마이그레이션 (단일 관리)
│   ├── db.csv             # 테이블 구조 정의
│   └── *.sql              # 마이그레이션 파일
├── docs/
│   ├── GITHUB-VERCEL-STRATEGY.md
│   └── VERCEL-DOMAIN-SETUP.md
├── pnpm-workspace.yaml
├── turbo.json
└── .github/
    └── copilot-instructions.md  ← 이 파일
```

---

## 호텔 추가 절차 (필수 체크리스트)
⚠️ 호텔 추가 후 반드시 가격 싱크 쿼리 실행 필요 (미실행 시 UI 미표시)

1. `sql/00X-호텔명-data.sql` 파일 생성 후 Supabase에서 실행
2. `sql/010-sync-hotel-price-2026.sql` 실행 (hotel_price 테이블 동기화)
3. 페이지 확인: `/mypage/quotes/hotel`, `/mypage/direct-booking/hotel`

---

## 중요 제약 사항
- **폴더 구조 변경 금지**: 기존 구조 유지, 새 폴더 생성 자제
- **DB 스키마 참조**: `sql/db.csv` 확인, 불일치 시에만 DB 재확인
- **타입 체크**: 빌드 시 무시 설정됨 (`typescript.ignoreBuildErrors: true`), 개발 중엔 `pnpm --filter @sht/<앱> typecheck` 사용
- **빌드 명령 실행 금지**: `npm/pnpm run build` 실행 금지 (사용자 요청 시에만)
- **자동 git push 금지**: 커밋·푸시는 사용자가 명시적으로 요청할 때만 수행

---

## ⚠️ 무한 로딩 버그 해결 패턴 (필수 적용)
### 증상: "세션 확인 중..." 무한 대기, "권한 확인 중..." 멈춤

### 표준 해결 패턴
```tsx
useEffect(() => {
  let cancelled = false;
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
      setUserRole('guest');
    } finally {
      if (!cancelled) setIsLoading(false);  // ✅ 반드시 실행
    }
  };
  init();
  return () => { cancelled = true; };
}, []);  // ✅ [] 의존성 - 최초 1회만
```

### 체크리스트
- [ ] `try { ... } finally { setIsLoading(false) }` 구조
- [ ] `router.push()` 직후에도 `setIsLoading(false)` 호출
- [ ] `cancelled` 플래그로 언마운트 보호
- [ ] `useEffect` 의존성 `[]` 사용 (`[router]` 금지)

---

## ⚠️ 예약 작업 중단 버그 해결 패턴 (필수 적용)
### 증상: 예약 입력 중 다른 탭 전환 후 "로그인 사용자 표시 못함" + "새로고침 안 됨"

### 핵심 원칙
- ✅ **로컬 캐시 우선** → `getSession()`만 사용 (네트워크 호출 없음)
- ✅ **watchdog 제거** → 12초 타임아웃 없음
- ✅ **탭 전환 강제 재확인 금지** → Supabase `onAuthStateChange` 리스너만 사용
- ✅ **토큰 갱신 일원화** → Supabase `autoRefreshToken: true`만 신뢰
- ✅ **일시 오류 시 캐시 유지** → 강제 로그아웃 금지

### 표준 useAuth 패턴
```tsx
export function useAuth(redirectOnFail: string = '/login') {
  const router = useRouter();
  const cached = typeof window !== 'undefined' ? readSessionCache() : null;
  const [authState, setAuthState] = useState<AuthState>({
    user: cached,
    loading: !cached,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const checkOnce = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session?.user) {
          writeSessionCache(session.user);
          setAuthState({ user: session.user, loading: false, error: null });
        } else if (!cached) {
          setAuthState({ user: null, loading: false, error: null });
          router.replace(redirectOnFail);
        } else {
          setAuthState(prev => ({ ...prev, loading: false }));
        }
      } catch (err) {
        if (cancelled) return;
        setAuthState(prev => ({ ...prev, loading: false, error: err as Error }));
      }
    };
    checkOnce();
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
  }, []);  // ✅ [] 의존성
  return { ...authState, isAuthenticated: !!authState.user };
}
```

### 체크리스트
- [ ] `useAuth`에 watchdog 타임아웃 없음
- [ ] focus/visibilitychange 리스너 없음 (onAuthStateChange만 사용)
- [ ] `getSessionUser`에서 `getUser()` 네트워크 호출 없음
- [ ] `refreshAuthBeforeSubmit`에서 강제 `refreshSession()` 없음

---

## DB 성능 최적화
- `sql/performance_indexes.sql` — 17개 테이블에 60+ 인덱스
- Supabase Dashboard → SQL Editor에서 실행

## 테스트
```bash
pnpm --filter @sht/<앱> test
pnpm --filter @sht/<앱> test:watch
```
