# Vercel MCP 배포 가이드

**배포 완료:** Vercel MCP가 Claude Desktop에 성공적으로 배포되었습니다.

## 설정 현황

✅ **Google Sheets MCP** - 설정 완료  
✅ **Vercel MCP** - 설정 완료

## Claude Desktop에서 Vercel 사용하기

### 1단계: Claude Desktop 재시작

현재 Claude Desktop이 열려있다면:
1. 완전히 종료 (작업관리자에서 확인)
2. Claude Desktop 다시 시작

### 2단계: Vercel MCP 사용

Claude Chat에서 다음 명령을 사용할 수 있습니다:

```
Vercel 배포 상태 확인: (프로젝트 이름 또는 URL 입력)
```

**사용 가능한 Vercel 기능:**
- ✅ 배포 상태 확인
- ✅ 배포 실행
- ✅ 프로젝트 목록 조회
- ✅ 환경 변수 관리
- ✅ 빌드 로그 확인
- ✅ 배포 기록 조회

## Vercel CLI를 통한 배포 (대체 방법)

CLI를 직접 사용하려면:

```powershell
# 1. Vercel 로그인
npx vercel login

# 2. 프로젝트 연결
npx vercel link

# 3. 배포 상태 확인
npx vercel status

# 4. 배포 실행
npx vercel deploy --prod

# 5. 빌드 로그 보기
npx vercel logs
```

## 배포 문제 해결

### 문제: "배포가 안됨"

**확인 사항:**
1. Vercel 계정 로그인 상태 확인
2. 프로젝트가 Vercel에 연결되어 있는지 확인
3. 환경 변수가 모두 설정되었는지 확인
4. 빌드 명령이 정상 작동하는지 확인

**해결 방법:**

```powershell
# Step 1: 로그인 확인
npx vercel whoami

# Step 2: 프로젝트 상태 확인
npx vercel status

# Step 3: 배포 상태 확인
npx vercel deployments

# Step 4: 빌드 로그 확인
npx vercel logs --tail
```

## 모노레포 배포 설정

sht-platform 모노레포의 각 앱을 Vercel에 배포하려면:

```json
{
  "buildCommand": "pnpm run build --filter=@sht/admin",
  "outputDirectory": "apps/admin/.next",
  "rootDirectory": "."
}
```

각 앱별 설정:
- **@sht/customer**: `rootDir=.`, `buildCmd=pnpm --filter @sht/customer build`
- **@sht/manager**: `rootDir=.`, `buildCmd=pnpm --filter @sht/manager build`
- **@sht/admin**: `rootDir=.`, `buildCmd=pnpm --filter @sht/admin build`

## 참고 자료

- [Vercel 공식 문서](https://vercel.com/docs)
- [Vercel CLI 명령어](https://vercel.com/docs/cli)
- [모노레포 배포 가이드](./GITHUB-VERCEL-STRATEGY.md)

---

**작성일:** 2026년 5월 2일  
**상태:** ✅ 배포 완료
