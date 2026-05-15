# 모바일 앱 Vercel 배포 방식 (2026.05.15)

## 📋 개요
모바일 앱(@sht/mobile)의 Vercel 배포 성공 방식을 정리한 지침.  
**성공 커밋**: `4ca2ece` - "fix(mobile): downgrade Next.js to 15.5.15 to align with monorepo and fix Vercel build hang"

---

## ✅ 배포 전 체크리스트

### 1. Next.js 버전 확인
```json
// apps/mobile/package.json
{
  "dependencies": {
    "next": "^15.5.15",    // ✅ 반드시 15.5.15 (v16은 Turbopack 성능 문제)
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

### 2. packageManager 필드 제거
```json
// ❌ 제거할 필드
"packageManager": "pnpm@9.12.0"

// ✅ 제거 후 구조
{
  "name": "@sht/mobile",
  "version": "0.1.0",
  "private": true,
  "description": "...",
  "scripts": { ... },
  "dependencies": { ... }
}
```
**이유**: Vercel에서 corepack이 npm과 충돌 → "package manager mismatch" 에러 유발

### 3. vercel.json 설정 확인 (2026-05-15 업데이트)
```json
// apps/mobile/vercel.json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "installCommand": "cd ../.. && npx --yes pnpm@10.x install --no-frozen-lockfile",
  "ignoreCommand": "git diff --quiet HEAD^ HEAD -- ./ ../../packages ../../pnpm-lock.yaml",
  "buildCommand": "cd ../.. && npx --yes pnpm@10.x --filter @sht/mobile build",
  "outputDirectory": ".next",
  "framework": "nextjs"
}
```
**핵심**:
- `npx --yes pnpm@10.x`: mobile 프로젝트는 Vercel이 `pnpm@10.x`를 자동 사용 (생성일 기준)
- `--no-frozen-lockfile`: pnpm@10의 엄격한 overrides 검증으로 인한 `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` 우회
- ❌ pnpm@9.12.0 강제 시도는 실패 — Vercel pnpm@10 자동 선택과 충돌

### 3-1. GitHub 자동 배포 연결 (필수)
```powershell
cd c:\SHT-DATA\sht-platform\apps\mobile
vercel git connect https://github.com/mimok7/shtplatform.git --yes
```
**이유**: mobile은 별도 프로젝트로 만들어져 GitHub App 자동 연결이 없음.
- `apps/mobile/.vercel/project.json`에 git 연결 정보 없으면 GitHub push 시 자동 배포 안 됨
- 다른 6개 앱은 GitHub App을 통해 모노레포 자동 연결되어 있음
- **확인**: `vercel ls mobile` 결과의 Username이 GitHub 사용자가 아닌 본인이면 수동 트리거만 됨

### 4. Vercel 프로젝트 설정
**프로젝트**: stayhalongs-projects → mobile (ID: prj_t0FaaLuI7XDjAVE0A9MqHEwB)

- ✅ **Root Directory**: `apps/mobile`
- ✅ **Node Version**: `22.x` (v24는 pnpm 9과 호환 문제)
- ✅ **Production Domain**: https://newmobile.stayhalong.com
- ✅ **Region**: iad1 (Washington)

---

## 🚀 배포 명령어

### 방식 1: 표준 배포 (권장)
```powershell
cd c:\SHT-DATA\sht-platform

# 1단계: 변경사항 커밋
git add apps/mobile/<수정파일>
git commit -m "fix(mobile): <변경 내용>"

# 2단계: Vercel 배포
vercel deploy --prod --archive=tgz --yes
```

### 방식 2: 비동기 배포 (진행 상태 확인 필요 없을 때)
```powershell
cd c:\SHT-DATA\sht-platform
vercel deploy --prod --archive=tgz --yes --no-wait
```

### 배포 상태 확인
```powershell
# 배포 완료 대기 (최대 12분)
vercel inspect https://mobile-o6t1mpw5x-stayhalongs-projects.vercel.app --logs --wait --timeout 12m

# 또는 Vercel 대시보드
https://vercel.com/stayhalongs-projects/mobile/deployments
```

---

## 📊 기대되는 빌드 결과

| 항목 | 값 |
|------|-----|
| **빌드 시간** | ~50초 |
| **생성 페이지** | 31개 (모두 static) |
| **상태** | ● Ready |
| **First Load JS** | ~173-184 kB |
| **파일 업로드** | 1844개 |

### 빌드 로그 예상 흐름
```
1. [10s] Uploading [====================] (31.6MB/31.6MB)
2. [10s] Inspect URL 생성
3. [10s] Build 시작
4. [7.7s] Compiled successfully
5. [13.2s] ESLint 체크
6. [60s] Static pages 생성 (0→31/31)
7. [8s] Build trace 수집
8. [49s] Build Completed ✓
9. Status: ● Ready
```

---

## 🚨 일반적인 문제 및 해결책

### 문제 1: "package manager mismatch" 에러
```
Error: Detected package manager "npm" does not match intended corepack defined package manager "pnpm"
```

**원인**: `packageManager` 필드 존재  
**해결**:
1. `apps/mobile/package.json`에서 `"packageManager": "pnpm@9.12.0"` 라인 제거
2. root `package.json`에서도 동일 필드 제거 (있다면)
3. 다시 배포

### 문제 2: "Ignoring not compatible lockfile" (pnpm 버전 부조화)
```
ERR_PNPM_FROZEN_LOCKFILE_WITH_OUTDATED_LOCKFILE
```

**원인**: Vercel의 hardcoded pnpm 6이 lockfile v9.0을 읽지 못함  
**해결**: `vercel.json`의 `npx --yes pnpm@9.12.0` 설정 확인 (이미 설정됨)

### 문제 3: 빌드 시간 >15분 (Turbopack 성능 저하)
**원인**: Next.js v16.x의 Turbopack 불안정성  
**해결**: apps/mobile/package.json에서 `next: ^15.5.15` 확인

### 문제 4: ESLint 경고 (비차단)
```
ESLint: Cannot find module 'eslint-config-next/core-web-vitals'
```
**상태**: 경고만 표시, 배포는 계속 진행 (무시해도 됨)

---

## 📝 변경사항 기록

### 최근 배포 히스토리

| 커밋 | 메시지 | 배포 | 빌드 시간 |
|------|--------|------|---------|
| 8af2c24 | fix(mobile): remove packageManager to match 4ca2ece success state | ✅ Ready | 49s |
| 1cb7df0 | fix(mobile): unify KST timezone display for schedule and customers pages | ✅ Ready | 49s |
| 581bd67 | fix(mobile): finalize npx pnpm@9.12.0 bypass for vercel pnpm6 hardcoded path | ✅ Ready | 52s |
| 4ca2ece | fix(mobile): downgrade Next.js to 15.5.15 to align with monorepo and fix Vercel build hang | ✅ Ready | 51s |

---

## 🔗 관련 파일

- **배포 설정**: [apps/mobile/vercel.json](../../../apps/mobile/vercel.json)
- **패키지**: [apps/mobile/package.json](../../../apps/mobile/package.json)
- **모노레포 설정**: [pnpm-workspace.yaml](../../../pnpm-workspace.yaml)
- **타임존 통일**: [apps/mobile/lib/dateKst.ts](../../../apps/mobile/lib/dateKst.ts)

---

## ✨ 성공 팁

1. **배포 전 로컬 빌드 확인**: `pnpm --filter @sht/mobile build` (성공 시 배포 진행)
2. **Vercel 프로젝트 설정 주기적 확인**: 설정이 리셋되지 않았는지 확인
3. **pnpm-lock.yaml 커밋 필수**: monorepo 동기화 필요
4. **배포 후 URL 테스트**: https://newmobile.stayhalong.com 에서 정상 로드 확인

---

**마지막 업데이트**: 2026-05-15  
**상태**: ✅ 검증 완료  
**다음 배포**: 위 명령어 따르면 됨
