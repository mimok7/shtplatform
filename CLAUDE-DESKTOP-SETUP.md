# Claude Desktop MCP 설정 (sht-platform Google Sheets)

## 📌 설정 파일 위치

Windows:
```
%APPDATA%\Claude\claude_desktop_config.json
```

Mac:
```
~/Library/Application\ Support/Claude/claude_desktop_config.json
```

## 📋 설정 내용

프로젝트 루트에 생성된 `.claude-desktop-config.json` 또는 아래 내용을 Claude Desktop 설정에 복사하세요:

```json
{
  "mcpServers": {
    "sht-googlesheets": {
      "command": "npx",
      "args": ["-y", "smithery", "run", "googlesheets"],
      "disabled": false
    }
  }
}
```

## 🚀 설정 방법

### 단계 1: Claude Desktop 설정 파일 열기
Windows에서 설정 위치:
```
C:\Users\<username>\AppData\Roaming\Claude\claude_desktop_config.json
```

### 단계 2: 위의 설정 내용 추가
기존 `mcpServers` 섹션이 있다면, 아래 항목을 추가:

```json
{
  "mcpServers": {
    // 기존 다른 MCP 서버들...
    "sht-googlesheets": {
      "command": "npx",
      "args": ["-y", "smithery", "run", "googlesheets"],
      "disabled": false
    }
  }
}
```

### 단계 3: Claude Desktop 재시작
1. Claude Desktop 완전 종료
2. Claude Desktop 다시 실행
3. 채팅 창에서 Google Sheets 도구 사용 가능 확인

## ✅ 확인 방법

Claude Chat에서 다음과 같이 입력:
```
"Google Sheets 도구를 사용할 수 있나요?"
```

또는 도구 메뉴에서 `googlesheets` 관련 도구 확인

## 📝 프로젝트 구조

```
sht-platform/
├── .mcp.json                      # MCP 클라이언트 설정 (표준)
├── .claude-desktop-config.json    # Claude Desktop용 설정
├── SMITHERY-SETUP-QUICK.md        # 빠른 설정 가이드
├── docs/
│   ├── MCP-CONFIGURATION.md       # 전체 MCP 설정 가이드
│   └── ADMIN-GOOGLE-SHEETS-MCP.md # Admin 앱 MCP 통합 가이드
├── scripts/
│   └── setup-smithery-google-sheets.ps1  # 자동 설정 스크립트
└── apps/admin/
    └── app/admin/sheets-sync/    # Google Sheets 동기화 페이지
```

## 🎯 현재 상태

✅ **설정 완료**
- Smithery CLI 설치 완료
- .mcp.json 생성 완료
- .claude-desktop-config.json 생성 완료

✅ **사용 가능**
- Admin 앱의 DB→Sheets 동기화 기능 운영 중
- Claude Desktop에서 Google Sheets 도구 사용 가능 (설정 후)
- GitHub Copilot에서 도구 사용 가능 (선택사항)

## ⚡ 빠른 실행

1. Claude Desktop 설정 파일 업데이트 (위 내용 복사)
2. Claude Desktop 재시작
3. 완료!

---

**문제 발생 시:**
- Claude Desktop 설정 파일 경로 재확인
- JSON 형식 오류 확인
- Claude Desktop 완전 종료 후 재실행
