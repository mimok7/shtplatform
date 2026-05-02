# Laptop Setup Checklist (One-time)

이 문서는 노트북에서 저장소를 처음 동기화할 때 따라할 단계별 체크리스트입니다.

Prerequisites
- Git, Node, pnpm 설치
- VS Code 설치

1) 저장소 루트로 이동
```powershell
cd C:\Users\saint\SH_DATA\sht-platform
```

2) 원클릭 설치 (권장)
- 더블클릭 또는 아래 명령으로 실행합니다:
```powershell
pnpm run sync:laptop
# 또는
setup-laptop.cmd
```

옵션:
- pull 생략 (코드 동기화는 나중에 수동 실행):
```powershell
setup-laptop.cmd -SkipPull
```
- 부팅 시 자동 pull 활성화:
```powershell
setup-laptop.cmd -EnableAutoPullOnBoot
```

3) env 확인 및 보완
```powershell
pnpm run sync:env
```
- 필수값(NEXT_PUBLIC_SUPABASE_URL 등)이 누락되면 각 앱의 `apps/<앱명>/.env.local` 파일을 채우고 재실행하세요.

4) (선택) 코드/의존성 동기화
```powershell
pnpm run sync:pull
```

5) 확인
- 프로필 내용 확인:
```powershell
Get-Content $PROFILE
```
- 부팅 동기화 스탬프:
```powershell
Get-Content (Join-Path $env:LOCALAPPDATA 'sht-platform\boot-sync-stamp.txt')
```

Troubleshooting
- MCP 문제가 생기면 `%APPDATA%/Code/User/mcp.json.bak`를 확인하고 `pnpm run sync:mcp`를 재실행하세요.
- .env.local은 절대 Git에 커밋하지 마세요.

Files added by this guide:
- `scripts/apply-laptop-once.ps1`
- `setup-laptop.cmd` (root)
- `docs/LAPTOP-SETUP.md` (this file)

If you want, I can also create a desktop shortcut (.lnk) that runs `setup-laptop.cmd`.