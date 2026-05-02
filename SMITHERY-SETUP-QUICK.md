# Google Sheets MCP 빠른 설정 가이드

## 🚀 가장 빠른 설정 방법 

### 🥇 방법 1: Claude Desktop (가장 쉬움 - 2분)

1. [`CLAUDE-DESKTOP-SETUP.md`](./CLAUDE-DESKTOP-SETUP.md) 파일 열기
2. Claude Desktop 설정 파일에 내용 복사
3. Claude Desktop 재시작
4. ✅ 완료!

### 🥈 방법 2: Smithery CLI (3단계, 5분)

#### 단계 1: Smithery 로그인
```powershell
npx -y smithery login
```
→ 브라우저에서 Google 계정으로 인증

#### 단계 2: Google Sheets MCP 추가
```powershell
npx -y smithery mcp add googlesheets
```
→ 추가 Google OAuth 인증

#### 단계 3: 확인
```powershell
npx -y smithery tool list | Select-String "google"
```
→ Google Sheets 도구 확인

---

## ✅ 완료 신호

다음 명령 실행 시 결과 예시:

```powershell
$ npx -y smithery tool list
```

**예상 출력:**
```
googlesheets_read
googlesheets_write
googlesheets_create_sheet
googlesheets_delete_sheet
googlesheets_format_cells
googlesheets_run_formula
```

---

## 📋 자동 설정 스크립트 (선택)

대화형 가이드를 원한다면:

```powershell
cd C:\SHT-DATA\sht-platform
.\scripts\setup-smithery-google-sheets.ps1
```

---

## 📌 주의사항

- ✅ 로그인/인증 필수 (1회만)
- ✅ 기존 Admin Sheets Sync 기능: 변화 없음
- ✅ 개발 환경에서만 적용 (운영 영향 0)
- ✅ Claude/Copilot에서 자동으로 도구 사용 가능

---

## 🔧 문제 해결

### "API key not found" 오류
```powershell
npx -y smithery login
```

### 인증 재시도
```powershell
npx -y smithery auth refresh
```

### 도구 재설치
```powershell
npx -y smithery mcp remove googlesheets
npx -y smithery mcp add googlesheets
```

---

## 📖 자세한 정보

전체 가이드는 `docs/ADMIN-GOOGLE-SHEETS-MCP.md` 참고
