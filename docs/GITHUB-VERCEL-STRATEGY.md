# GitHub & Vercel 배포 전략 가이드

작성일: 2026-04-30  
대상 프로젝트: sht-platform (monorepo) + sht-customer / sht-manager / sht-manager1 (standalone)

---

## 1. 현재 상태 진단

### 저장소 현황
| 저장소 | 종류 | 위치 | 비고 |
|--------|------|------|------|
| `mimok7/new_manager` | GitHub | `sht-platform`의 `manager` remote | **모노레포 전체**가 푸시됨 |
| `mimok7/new_customer` | GitHub | `sht-platform`의 `customer` remote | **모노레포 전체**가 푸시됨 |
| `sht-manager` | 단독 GitHub | `c:\...\sht-manager` | 매니저 단일 앱 |
| `sht-manager1` | 단독 GitHub | `c:\...\sht-manager1` | 매니저 사이드 메뉴만 |
| `sht-customer` | 단독 GitHub | `c:\...\sht-customer` | 고객 단일 앱 |

### 문제점
1. **저장소 중복**: 같은 매니저 코드가 3곳(`new_manager`, `sht-manager`, `sht-platform/apps/manager`)에 존재 → 미러링 부담
2. **모노레포 전체를 분리 저장소에 push**: `git push manager main`은 customer/partner/packages까지 같이 올라감 → 저장소 비대화
3. **3종 미러링 규칙 운영 부담**: 매니저 1줄 변경에 3저장소 반영 필요
4. **권한 통제 어려움**: 외부 인원에게 매니저만 보여주려면 unique repo 필요

---

## 2. 추천 전략

### ⭐ 권장: **모노레포 단일 저장소 + Vercel 별도 프로젝트**

```
GitHub: mimok7/sht-platform (단일)
  ├─ apps/manager   ─→ Vercel: sht-manager (rootDir=apps/manager)
  ├─ apps/customer  ─→ Vercel: sht-customer (rootDir=apps/customer)
  └─ apps/partner   ─→ Vercel: sht-partner (rootDir=apps/partner)
```

#### 장점
- ✅ **단일 진실의 근원(Single Source of Truth)**: 코드 한 곳, PR 한 곳
- ✅ **3종 미러링 규칙 폐지** → 운영 부담 1/3 감소
- ✅ **공유 패키지(`packages/*`) 즉시 반영**: 한 번 수정 → 3개 앱 모두 적용
- ✅ **Turbo 캐싱**: 변경된 앱만 빌드, CI 시간 단축
- ✅ **DB 스키마/SQL 일원화**: `sql/` 한 곳 관리
- ✅ **타입 안전성**: 공유 타입(`packages/types`) 강제

#### 단점 + 대응
| 단점 | 대응책 |
|------|--------|
| 저장소 1개에 권한 집중 | GitHub Branch Protection + CODEOWNERS로 폴더별 리뷰어 지정 |
| 외부 인원에게 일부만 노출 어려움 | Outside collaborator를 `apps/manager` Issue/PR만 할당 |
| Push 시 모든 앱 영향 | Vercel Ignored Build Step으로 변경된 앱만 재배포 |

---

## 3. 비교: 분리 저장소 방식

### 다중 저장소(Polyrepo) 방식
```
GitHub:
  ├─ sht-manager    (단독)
  ├─ sht-customer   (단독)
  └─ sht-partner    (단독)
```

#### 장점
- 저장소별 권한 완전 분리 (외부 위탁 시 유리)
- 저장소 크기 작음 (clone 빠름)
- 한 앱 장애가 다른 앱 저장소에 영향 0

#### 단점 (큰 비용)
- ❌ 공유 코드 복사·붙여넣기 → 표류(drift) 발생 (현재 매니저 3종이 정확히 이 문제)
- ❌ DB 마이그레이션 SQL이 저장소별 분산
- ❌ 인증/세션 패치(예: 무한 로딩 버그) N번 반영
- ❌ `useAuth`·`PageWrapper` 등 공통 컴포넌트 동기화 부담
- ❌ 의존성 버전 어긋남 (Next.js 15.3 vs 15.5 등)

---

## 4. 실행 마이그레이션 계획

### Phase A: 모노레포로 통합 (권장)
```powershell
# 1. sht-platform이 정식 저장소가 됨
cd c:\Users\saint\SH_DATA\sht-platform

# 2. 새 origin 설정 (예: mimok7/sht-platform 신규 생성)
git remote add origin https://github.com/mimok7/sht-platform.git
git push -u origin main

# 3. 기존 분리 저장소 archive 처리 (삭제 X, GitHub에서 Archived 표시)
#    - mimok7/new_manager → archive
#    - mimok7/new_customer → archive
#    - sht-manager / sht-customer / sht-manager1 → archive

# 4. Vercel 프로젝트 재연결 (아래 5번 참조)
```

### Phase B: 단계적 전환 (점진적, 위험 회피)
지금 당장 분리 저장소를 끊기 부담스럽다면:
1. **현재 미러링 유지** + **sht-platform이 마스터**로 선언
2. 신규 기능은 모노레포에서만 작업
3. 단독 저장소는 read-only mirror (자동 sync 스크립트)
4. 3개월 후 단독 저장소 archive

---

## 5. Vercel 배포 방법

### 5.1 모노레포 앱 배포 표준
각 앱은 별도 Vercel Project로 생성하고 **Root Directory**만 다르게 지정.

#### Vercel Dashboard 설정
| 항목 | 값 |
|------|-----|
| Repository | `mimok7/sht-platform` |
| Framework Preset | `Next.js` |
| Root Directory | `apps/manager` (앱별로 다르게) |
| Build Command | (vercel.json이 처리) |
| Install Command | (vercel.json이 처리) |
| Output Directory | `.next` |
| Node Version | 20.x |

#### 각 앱의 `vercel.json` (이미 적용됨)
```json
{
  "installCommand": "cd ../.. && pnpm install --frozen-lockfile",
  "buildCommand": "cd ../.. && pnpm --filter @sht/manager build",
  "outputDirectory": ".next",
  "framework": "nextjs"
}
```
- `cd ../..`로 monorepo 루트로 이동 → pnpm workspace 인식
- `pnpm --filter @sht/<app>`로 해당 앱만 빌드 (turbo 캐싱 활용)

### 5.2 환경 변수 설정 (Vercel Dashboard → Settings → Environment Variables)
모든 앱 공통:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...   # 서버 전용
```
- Production / Preview / Development 환경별 분리
- 동일 Supabase 인스턴스 사용해도 무방 (RLS로 권한 분리)

### 5.3 Ignored Build Step (변경된 앱만 재배포)
Vercel Project → Settings → Git → Ignored Build Step에 입력:

**manager 프로젝트**:
```bash
git diff HEAD^ HEAD --quiet -- apps/manager packages
```
**customer 프로젝트**:
```bash
git diff HEAD^ HEAD --quiet -- apps/customer packages
```
**partner 프로젝트**:
```bash
git diff HEAD^ HEAD --quiet -- apps/partner packages
```
→ 해당 앱·공유 패키지에 변경 없으면 빌드 skip → 배포 시간/비용 절감

### 5.4 도메인 매핑
| 앱 | 운영 도메인 (예시) |
|----|-------------------|
| customer | `app.staycruise.kr` 또는 `staycruise.kr` |
| manager | `manager.staycruise.kr` |
| partner | `partner.staycruise.kr` |

- **별도 서브도메인 권장**: 쿠키/세션/CORS 격리, 보안 강화
- Vercel Project → Settings → Domains에서 추가 후 DNS CNAME 설정

### 5.5 자동 배포 흐름
```
[main 브랜치 push]
   ↓
[Vercel: 3개 프로젝트 트리거]
   ↓
[Ignored Build Step 체크]
   ├─ apps/manager 변경? → manager 빌드 + 배포
   ├─ apps/customer 변경? → customer 빌드 + 배포
   ├─ apps/partner 변경? → partner 빌드 + 배포
   └─ packages/* 변경? → 3개 모두 빌드 + 배포
```

### 5.6 Preview 배포 활용
- PR 생성 시 자동으로 `*.vercel.app` Preview URL 생성
- QA → 머지 → Production 배포
- Preview는 Production DB와 분리하려면 Supabase Branching 활용 가능

---

## 6. CODEOWNERS 예시 (모노레포 권한 통제)

`.github/CODEOWNERS`:
```
# 전체 기본 리뷰어
*                       @mimok7

# 매니저 앱
apps/manager/           @mimok7 @manager-team

# 고객 앱
apps/customer/          @mimok7 @customer-team

# 파트너 앱
apps/partner/           @mimok7

# 공유 패키지 (위험도 높음)
packages/               @mimok7

# DB 스키마 (위험도 매우 높음)
sql/                    @mimok7
```

---

## 7. 최종 추천 요약

| 항목 | 추천 |
|------|------|
| **GitHub 구조** | ✅ `mimok7/sht-platform` 단일 모노레포 |
| **분리 저장소** | ❌ Archive 처리 (3개월 유예 후) |
| **Vercel** | ✅ 앱별 Project (Root Directory 분리) |
| **도메인** | ✅ 서브도메인 분리 (manager/customer/partner) |
| **환경변수** | ✅ 동일 Supabase 인스턴스 + RLS로 권한 격리 |
| **CI 최적화** | ✅ Vercel Ignored Build Step |
| **권한** | ✅ CODEOWNERS + Branch Protection |

### 즉시 실행 가능한 액션 (우선순위)
1. **신규 GitHub repo `sht-platform` 생성** → 정식 origin 등록
2. **Vercel에 partner 프로젝트 추가** (Root: `apps/partner`)
3. **3개 앱 모두 Ignored Build Step 적용**
4. **CODEOWNERS 파일 추가**
5. **단독 저장소(sht-manager, sht-customer, sht-manager1, new_manager, new_customer) Archive 처리** (3개월 후)

### 위험 회피 (점진적 전환)
당분간 분리 저장소 미러링을 유지해야 한다면:
- sht-platform이 **마스터(write)**, 단독은 **mirror(read-only)**
- 미러링은 GitHub Action 자동화 권장 (수동 미러링 폐지)
