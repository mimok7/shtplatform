# ✅ Google Sheets MCP 설정 완료 가이드

**로그인 완료! 이제 마지막 단계만 진행하면 됩니다.**

## 🎯 현재 상태

✅ Smithery 로그인 완료  
✅ 모든 설정 파일 준비 완료  
✅ 문서 모두 작성 완료

## ⚡ 1분 내 완료하기 (Claude Desktop)

### 단계 1: Claude Desktop 설정 파일 열기

**Windows:**
```
C:\Users\<username>\AppData\Roaming\Claude\claude_desktop_config.json
```

**Mac:**
```
~/Library/Application\ Support/Claude/claude_desktop_config.json
```

### 단계 2: 아래 내용을 설정 파일의 `mcpServers` 섹션에 추가

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

**예시 (전체 설정 파일):**
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

### 단계 3: Claude Desktop 재시작

1. Claude Desktop 완전 종료
2. Claude Desktop 다시 실행
3. ✅ 완료!

---

## ✅ 사용 확인

Claude Chat에 입력:
```
"Google Sheets 도구가 설치되었나요?"
```

→ Google Sheets 도구 목록이 표시되면 성공!

---

## 📌 참고 파일

이미 준비된 설정 파일들:
- `.mcp.json` - 표준 MCP 설정
- `.claude-desktop-config.json` - Claude Desktop용 설정 (프로젝트 루트)
- `CLAUDE-DESKTOP-SETUP.md` - 자세한 설정 가이드

---

## 🚀 현재 사용 가능한 기능

✅ **Admin 앱**
- URL: http://localhost:3004/admin/sheets-sync
- 기능: Supabase DB 데이터를 Google Sheets로 자동 동기화
- 상태: 즉시 사용 가능

✅ **Claude Chat**
- Google Sheets 도구 모음
- 새로운 기능 개발 시 활용 가능
- 상태: 설정 후 즉시 사용 가능

---

**다 했습니다! 위 3단계를 따라 하면 완벽하게 설정됩니다. 🎉**
