# MCP 설정 가이드 (.mcp.json)

## 📌 개요

`.mcp.json` 파일은 **MCP 클라이언트(Claude Desktop, VS Code 등)**가 사용 가능한 MCP 서버를 자동 발견하는 표준 설정 파일입니다.

## 📋 현재 설정

프로젝트 루트의 `.mcp.json`에 **Google Sheets MCP**가 등록되어 있습니다:

```json
{
  "mcpServers": {
    "googlesheets": {
      "command": "npx",
      "args": ["-y", "smithery", "run", "googlesheets"]
    }
  }
}
```

## 🎯 Claude Desktop 연결

### 단계 1: Claude Desktop 설정 파일 열기

**Windows:**
```
%APPDATA%\Claude\claude_desktop_config.json
```

**Mac:**
```
~/Library/Application\ Support/Claude/claude_desktop_config.json
```

### 단계 2: sht-platform 추가

```json
{
  "mcpServers": {
    "sht-platform-googlesheets": {
      "command": "npx",
      "args": ["-y", "smithery", "run", "googlesheets"]
    }
  }
}
```

또는 **프로젝트의 `.mcp.json` 직접 참조** (향후 Claude Desktop 업데이트 시 지원 예상):

```json
{
  "mcpServers": {
    "sht-platform": {
      "configPath": "C:\\SHT-DATA\\sht-platform\\.mcp.json"
    }
  }
}
```

### 단계 3: Claude Desktop 재시작

설정 변경 후 Claude Desktop을 완전히 종료 후 재실행하세요.

### 단계 4: Google Sheets 도구 사용 확인

Claude Chat에서:
```
"Google Sheets 도구가 사용 가능한가요?"
```

또는 도구 메뉴 → Google Sheets 관련 도구 표시 확인

---

## 🔧 VS Code Copilot 연결

### 단계 1: VS Code에서 `.mcp.json` 인식

VS Code의 GitHub Copilot 확장이 자동으로 `.mcp.json` 인식 (향후 업데이트 기준)

### 단계 2: Smithery 인증 (필수)

```bash
npx -y smithery login
```

### 단계 3: Google Sheets MCP 추가

```bash
npx -y smithery mcp add googlesheets
```

### 단계 4: VS Code 재시작

Copilot이 자동으로 Google Sheets 도구 로드

---

## 📚 추가 MCP 서버 등록

향후 다른 MCP 서버를 추가하려면 `.mcp.json`에 추가하세요:

```json
{
  "mcpServers": {
    "googlesheets": {
      "command": "npx",
      "args": ["-y", "smithery", "run", "googlesheets"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "smithery", "run", "github"]
    },
    "notion": {
      "command": "npx",
      "args": ["-y", "smithery", "run", "notion"]
    }
  }
}
```

---

## ✅ 검증

### MCP 서버 직접 테스트

```bash
npx -y smithery run googlesheets
```

→ 성공 시: MCP 서버 초기화 메시지 출력

### Claude Chat 테스트

```
"I want to read Google Sheets data. What tools do I have available?"
```

→ Google Sheets 관련 도구 목록 표시 예상

---

## ⚠️ 주의사항

- **인증 필수**: Smithery 로그인 후 MCP 도구 추가 필요
- **권한**: Google 서비스 계정 또는 OAuth 인증 필요
- **개발 환경**: MCP는 개발/설계 단계에서 생산성 향상용
- **Runtime**: 운영 중인 admin 앱은 여전히 `googleapis` 직접 호출 유지

---

## 🔗 참고 자료

- **Smithery**: https://smithery.ai/
- **MCP 공식**: https://modelcontextprotocol.io/
- **Claude Desktop 설정**: https://support.anthropic.com/
- **프로젝트 가이드**: [SMITHERY-SETUP-QUICK.md](../SMITHERY-SETUP-QUICK.md)

---

## 🚀 빠른 시작

```bash
# 1. Smithery 로그인
npx -y smithery login

# 2. Google Sheets MCP 추가
npx -y smithery mcp add googlesheets

# 3. Claude Desktop 또는 VS Code에서 사용
# → .mcp.json이 자동으로 클라이언트에 로드됨
```
