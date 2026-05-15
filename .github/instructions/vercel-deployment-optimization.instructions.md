---
title: "Vercel 배포 최적화 가이드 (Per-app Deployment)"
date: "2026-05-15"
description: "모노레포에서 수정된 앱만 Vercel에 배포되도록 최적화. turbo-ignore → git diff 기반 ignoreCommand 전환"
applyTo:
  - "apps/*/vercel.json"
tags:
  - "vercel"
  - "deployment"
  - "monorepo"
  - "ci-cd"
severity: "high"
status: "active"
---

# Vercel 배포 최적화 가이드 (2026.05.15)

## 📌 개요
모노레포에서 한 앱만 수정했는데도 9개 앱 모두 빌드/배포되는 문제를 해결하기 위한 표준 절차입니다.

---

## 1. 문제 상황

### 증상
- 특정 앱(예: `mobile`)만 수정했는데 9개 모든 Vercel 프로젝트에서 빌드 실행
- 한 번의 `git push`로 **9건의 deployment 소비** → 무료 플랜 100건/월 제한 빠르게 소진
- 빌드 시간 누적: 9개 동시 빌드 → 큐 대기 + 응답 느림

### 원인 분석

| 원인 | 상세 |
|------|------|
| **turbo-ignore 한계** | `turbo-ignore @sht/<app>`은 `^build` 의존성 그래프를 따름. `packages/*` 변경 시 모든 앱이 영향받는다고 판단 → false-positive 빌드 다발 |
| **mobile vercel.json 누락** | `apps/mobile`에 `vercel.json`이 없으면 Vercel 기본 동작으로 항상 빌드 |
| **빌드 컨텍스트** | turbo-ignore 자체가 git history fetch + 그래프 분석 → 매 빌드마다 시간 소비 |

---

## 2. 해결 방법: `git diff` 기반 `ignoreCommand`

### 2.1 핵심 원리
Vercel `ignoreCommand` 규약:
- **exit code 0** → 빌드 SKIP (배포 안 함)
- **exit code 1** → 빌드 PROCEED (배포 진행)

`git diff --quiet`는:
- 변경 없으면 exit 0 ✅ (= 우리가 원하는 SKIP)
- 변경 있으면 exit 1 ✅ (= 우리가 원하는 PROCEED)

### 2.2 표준 vercel.json 패턴

#### 워크스페이스 패키지 의존하는 앱 (customer, manager, manager1, quote, admin, partner, customer1)
```json
{
  "installCommand": "cd ../.. && pnpm install --frozen-lockfile",
  "ignoreCommand": "git diff --quiet HEAD^ HEAD -- ./ ../../packages ../../pnpm-lock.yaml",
  "buildCommand": "cd ../.. && pnpm --filter @sht/<APP_NAME> build",
  "outputDirectory": ".next",
  "framework": "nextjs"
}
```

#### 워크스페이스 패키지 미의존 앱 (mobile)
```json
{
  "installCommand": "cd ../.. && pnpm install --frozen-lockfile",
  "ignoreCommand": "git diff --quiet HEAD^ HEAD -- ./ ../../pnpm-lock.yaml",
  "buildCommand": "cd ../.. && pnpm --filter @sht/mobile build",
  "outputDirectory": ".next",
  "framework": "nextjs"
}
```

### 2.3 ignoreCommand 경로 설명
- `./` — 자신의 앱 폴더 (`apps/<app>/`)
- `../../packages` — 공유 워크스페이스 패키지
- `../../pnpm-lock.yaml` — 의존성 변경 (npm/pnpm 패키지 추가/업데이트)

---

## 3. 적용 결과 (실측 검증)

### 시나리오: mobile 앱만 수정한 commit
```bash
$ git diff --name-only HEAD~1 HEAD
apps/mobile/app/cafe-guide/page.tsx
apps/mobile/app/schedule/page.tsx
apps/mobile/components/ShtCarSeatMap.tsx
... (모두 apps/mobile/* 만)
```

### Before (turbo-ignore)
```
[mobile]    → BUILD ✅
[manager]   → BUILD ❌ (false positive)
[manager1]  → BUILD ❌ (false positive)
[customer]  → BUILD ❌ (false positive)
[customer1] → BUILD ❌ (false positive)
[quote]     → BUILD ❌ (false positive)
[admin]     → BUILD ❌ (false positive)
[partner]   → BUILD ❌ (false positive)
총 9건 deployment 소비
```

### After (git diff)
```
[mobile]    exit=1 → BUILD ✅
[manager]   exit=0 → SKIP
[manager1]  exit=0 → SKIP
[customer]  exit=0 → SKIP
[customer1] exit=0 → SKIP
[quote]     exit=0 → SKIP
[admin]     exit=0 → SKIP
[partner]   exit=0 → SKIP
총 1건 deployment 소비 (8/9 절감)
```

---

## 4. 검증 절차

### 4.1 로컬 시뮬레이션
```powershell
cd c:\SHT-DATA\sht-platform

foreach ($app in @('mobile','manager','manager1','customer','customer1','quote','admin','partner')) {
  Push-Location "apps/$app"
  if ($app -eq 'mobile') {
    git diff --quiet HEAD^ HEAD -- ./ ../../pnpm-lock.yaml
  } else {
    git diff --quiet HEAD^ HEAD -- ./ ../../packages ../../pnpm-lock.yaml
  }
  if ($LASTEXITCODE -eq 0) {
    Write-Host "[$app] SKIP" -ForegroundColor Yellow
  } else {
    Write-Host "[$app] BUILD" -ForegroundColor Green
  }
  Pop-Location
}
```

### 4.2 Vercel 대시보드 확인
- 각 프로젝트 → Settings → Git → "Ignored Build Step" 확인
- `vercel.json`의 `ignoreCommand`가 자동 적용되는지 확인
- **주의**: 대시보드에서 직접 설정한 ignoreCommand는 `vercel.json`보다 우선

### 4.3 Vercel MCP로 모니터링
```typescript
// 최근 24시간 배포 이력 조회 (각 프로젝트별)
mcp_com_vercel_ve_list_deployments({
  projectId: 'prj_xxx',
  teamId: 'team_xxx',
  since: Date.now() - 86400000
})
```

---

## 5. 추가 최적화 (선택)

### 5.1 packages 세분화 (정확도 향상)
현재는 `../../packages` 전체를 추적 → packages 하위 어느 패키지든 변경되면 모든 의존 앱 빌드. 더 정확하게 하려면 **각 앱이 실제 의존하는 패키지만 명시**:

```json
// customer (예시: domain + config 의존)
"ignoreCommand": "git diff --quiet HEAD^ HEAD -- ./ ../../packages/domain ../../packages/config ../../pnpm-lock.yaml"
```

| 앱 | 의존 packages |
|----|---------------|
| customer | domain, config |
| quote | domain, config |
| manager | domain, config |
| manager1 | domain |
| customer1 | domain |
| admin | domain |
| partner | config |
| mobile | (없음) |

⚠️ 단점: packages 의존성 추가/제거 시 vercel.json도 수동 업데이트 필요. 현재는 단순한 `packages` 전체 추적이 안전.

### 5.2 GitHub 통합 옵션 활용
Vercel 대시보드 → Git → "Only deploy when changed" 체크박스 (Pro+ 필요):
- Vercel이 자동으로 root directory 변경 감지
- `vercel.json`의 `ignoreCommand`와 중복 시 충돌 가능 → 한 가지만 사용

---

## 6. 트러블슈팅

### 문제: ignoreCommand가 작동하지 않음

**원인 1**: Vercel 대시보드에서 ignoreCommand 직접 설정
- 해결: Settings → Git → "Ignored Build Step"을 빈 값으로 설정 → vercel.json 우선 적용

**원인 2**: HEAD^ 가 존재하지 않음 (첫 커밋, force push 후)
- 해결: 안전한 fallback 추가
```json
"ignoreCommand": "git diff --quiet HEAD^ HEAD -- ./ ../../packages ../../pnpm-lock.yaml || git rev-parse HEAD^ 2>/dev/null && exit 1"
```

**원인 3**: Vercel Shallow Clone (depth=1)
- Vercel은 기본적으로 git fetch depth=1 → HEAD^ 접근 가능 (Vercel이 자동으로 base commit fetch)
- 문제 시: `vercel.json`에 `"git.deploymentEnabled": true` 추가하지 말 것 (기본 OK)

### 문제: 변경 안 했는데 PROCEED 됨
- `git diff --name-only HEAD^ HEAD` 로 실제 변경 파일 확인
- 자동 생성 파일 (lockfile reformat 등)이 commit에 포함되었는지 확인

### 문제: 변경했는데 SKIP 됨
- `vercel.json`의 경로가 정확한지 확인 (상대경로 `./`, `../../`)
- root directory 설정 확인 (Vercel Settings → General → Root Directory = `apps/<app>`)

---

## 7. Vercel MCP 활용

### 사용 가능한 도구
| 도구 | 용도 |
|------|------|
| `mcp_com_vercel_ve_list_teams` | 팀 목록 조회 |
| `mcp_com_vercel_ve_list_projects` | 프로젝트 목록 조회 |
| `mcp_com_vercel_ve_get_project` | 프로젝트 상세 조회 |
| `mcp_com_vercel_ve_list_deployments` | 배포 이력 조회 (필터: since/until) |
| `mcp_com_vercel_ve_get_runtime_logs` | 런타임 로그 조회 |
| `mcp_com_vercel_ve_deploy_to_vercel` | 수동 배포 트리거 |

### 배포 모니터링 워크플로
```text
1. git push origin main
2. mcp_com_vercel_ve_list_deployments → 어떤 프로젝트가 빌드 시작했는지 확인
3. SKIP된 프로젝트가 예상과 일치하는지 검증
4. 빌드 실패 시 mcp_com_vercel_ve_get_runtime_logs로 로그 조회
```

---

## 8. 체크리스트: 새 앱 추가 시

- [ ] `apps/<new-app>/vercel.json` 생성
- [ ] 워크스페이스 패키지 의존 여부 확인
- [ ] `ignoreCommand`에 정확한 경로 명시 (`./` + 의존하는 packages)
- [ ] `buildCommand`의 `--filter` 이름이 package.json의 `name`과 일치
- [ ] Vercel 대시보드에서 Root Directory를 `apps/<new-app>`로 설정
- [ ] Vercel 대시보드의 "Ignored Build Step"이 비어있는지 확인 (vercel.json 우선)
- [ ] 로컬에서 `git diff --quiet` 시뮬레이션 통과
- [ ] 첫 push 후 의도한 앱만 빌드되는지 확인

---

## 9. FAQ

**Q**: turbo-ignore와 git diff 중 무엇이 더 나은가?  
**A**: 정확도는 turbo-ignore가 이론상 우수하나(의존성 그래프 따라감), 실제로는 false-positive가 많고 느림. **git diff가 명시적이고 빠르며 결과가 예측 가능**.

**Q**: packages 변경 시 정말 모든 앱을 빌드해야 하나?  
**A**: 네. packages의 코드 변경은 의존하는 모든 앱의 번들에 포함됨. SKIP 시 런타임 오류 위험. 빈도가 낮으므로 허용 가능.

**Q**: HEAD^가 다른 브랜치라면?  
**A**: Vercel은 PR/branch deployment 시 base commit을 자동으로 fetch. `HEAD^`는 직전 commit이 아닌 "이 push 이전 상태"를 가리킴 → 항상 안전.

**Q**: 모든 앱 강제 빌드하고 싶으면?  
**A**: Vercel 대시보드 → 각 프로젝트 → Deployments → "Redeploy" 클릭. 또는 빈 commit push:
```bash
git commit --allow-empty -m "chore: redeploy all"
git push
```
이 경우 git diff에 변경 파일 없음 → 모두 SKIP. 강제 빌드는 대시보드에서.

---

## 10. 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-05-15 | turbo-ignore → git diff 기반 ignoreCommand 전환 (8개 앱 모두 적용) |
| 2026-05-15 | apps/mobile/vercel.json 신규 생성 |
| 2026-05-15 | 로컬 검증: mobile-only commit에서 1/8 만 BUILD 확인 |

---

## 11. 참고
- 변경된 파일:
  - [apps/customer/vercel.json](../../apps/customer/vercel.json)
  - [apps/customer1/vercel.json](../../apps/customer1/vercel.json)
  - [apps/manager/vercel.json](../../apps/manager/vercel.json)
  - [apps/manager1/vercel.json](../../apps/manager1/vercel.json)
  - [apps/quote/vercel.json](../../apps/quote/vercel.json)
  - [apps/admin/vercel.json](../../apps/admin/vercel.json)
  - [apps/partner/vercel.json](../../apps/partner/vercel.json)
  - [apps/mobile/vercel.json](../../apps/mobile/vercel.json) (신규)
- 관련 문서: [VERCEL-MCP-GUIDE.md](../../docs/VERCEL-MCP-GUIDE.md)
- Vercel 공식 문서: https://vercel.com/docs/projects/overview#ignored-build-step
