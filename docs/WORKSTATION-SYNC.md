# 노트북/데스크탑 완전 동기화 가이드

이 문서는 동일 저장소를 2대 PC(노트북/데스크탑)에서 번갈아 작업할 때,
코드와 MCP 환경을 최대한 동일하게 유지하는 표준 절차입니다.

## 목표

- 변경 파일 동기화: Git 원격 기준으로 즉시 일치
- 개발 의존성 동기화: lockfile 기준 일치
- MCP 환경 동기화: VS Code MCP 설정 자동 정렬

## 추가된 자동화 파일

- scripts/workstation-sync.ps1
- scripts/mcp-template.json
- scripts/apply-laptop-once.ps1

## 노트북 적용 원클릭

노트북에서 저장소를 처음 맞출 때 아래 한 줄만 실행하면 됩니다.

```powershell
pnpm run sync:laptop
```

실행 순서:

1. MCP 설정 동기화
2. PowerShell 프로필 자동 등록(+현재 세션 적용)
3. env 요약 점검
4. 코드/의존성 pull 동기화

옵션 예시:

```powershell
# pull 생략
powershell -ExecutionPolicy Bypass -File scripts/apply-laptop-once.ps1 -SkipPull

# 부팅 시 자동 pull 활성화까지 포함
powershell -ExecutionPolicy Bypass -File scripts/apply-laptop-once.ps1 -EnableAutoPullOnBoot
```

## 1회 준비

1. 두 PC 모두 동일 저장소를 사용합니다.
2. 두 PC 모두 Node/Pnpm 버전을 맞춥니다.
3. 두 PC 모두 VS Code에서 GitHub Copilot 로그인 상태를 확인합니다.

## 매번 작업 시작 전 (권장)

저장소 루트에서 아래 명령 실행:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/workstation-sync.ps1 -Mode pull -AutoStash
```

이 명령이 수행하는 작업:

1. 사용자 MCP 설정 파일(%APPDATA%/Code/User/mcp.json)을 템플릿 기준으로 동기화
2. git fetch + git pull --rebase origin main
3. 필요 시 로컬 변경 자동 stash/pop
4. pnpm install --frozen-lockfile

## MCP만 별도 동기화

```powershell
powershell -ExecutionPolicy Bypass -File scripts/workstation-sync.ps1 -Mode mcp-only
```

## 앱별 .env.local 검사

아래 명령으로 앱별 필수/권장 키 누락을 점검합니다.

```powershell
pnpm run sync:env
```

직접 실행:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-env-local.ps1
```

설정 파일:

- scripts/env-required.json

앱별 필수/권장 키 정책은 위 JSON에서 변경할 수 있습니다.

## 부팅 후 자동 실행 등록 (PowerShell Profile)

아래 명령을 한 번 실행하면 PowerShell 프로필에 자동 동기화 블록이 등록됩니다.

```powershell
pnpm run sync:profile
```

또는:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/register-sync-profile.ps1 -InstallNow
```

자동 실행 동작:

1. 부팅 후 첫 PowerShell 세션에서 1회만 실행
2. MCP 동기화 실행
3. env 점검 요약 실행
4. 코드/의존성 동기화는 안내만 출력

선택적으로 부팅 시 코드 동기화까지 자동 실행하려면 환경 변수 설정:

```powershell
setx SHT_AUTO_PULL_ON_BOOT 1
```

## 운영 규칙 (강력 권장)

1. 저장소 기준 파일은 항상 Git이 진실 원본
2. 하루 2회 이상 작업 전에는 반드시 pull 동기화 실행
3. 큰 작업 시작 전에는 원격 최신 상태 확인 후 작업
4. lockfile(pnpm-lock.yaml) 변경은 반드시 커밋에 포함

## 완전 동기화에서 제외되는 항목

아래는 보안/운영 이유로 자동 완전 동기화 대상에서 제외됩니다.

1. .env.local 같은 개인 비밀키 파일
2. 브라우저 쿠키/OS 자격증명 저장소
3. VS Code 확장 로그인 세션

## 비밀 환경 변수 동기화 권장 방안

1. 비밀키는 Git에 커밋하지 않기
2. 1Password/Bitwarden 같은 시크릿 매니저에 단일 원본 저장
3. 두 PC에서 동일 키를 내려받아 각 앱 .env.local에 반영

## 장애 시 복구

MCP 설정이 꼬였을 때:

1. %APPDATA%/Code/User/mcp.json.bak 확인
2. 다시 mcp-only 명령 실행
3. VS Code 재시작
