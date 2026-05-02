# Admin 앱: Google Sheets MCP 통합 가이드 (선택사항)

## 📌 개요
Admin 앱의 Google Sheets 동기화 기능(`/admin/sheets-sync`)은 **`googleapis` 라이브러리로 직접 구현**되어 있어 현재 안정적으로 작동합니다.

본 문서는 **선택사항으로 Smithery의 Google Sheets MCP를 개발 환경에 추가**하려는 경우의 가이드입니다.

---

## 🎯 MCP 추가의 이점

### 개발 단계에서의 이점
- ✅ Claude, GitHub Copilot에서 Google Sheets 도구 직접 접근 가능
- ✅ 새로운 admin 기능 개발 시 MCP 도구 활용 가능
- ✅ 코드 작성 생산성 향상

### 운영(Runtime)에서의 상태
- ✨ 기존 `googleapis` 직접 호출 방식 유지 (변화 없음)
- 서버 코드: `apps/admin/app/api/admin/sheets-sync/route.ts` (그대로 작동)
- 클라이언트: `apps/admin/app/admin/sheets-sync/page.tsx` (그대로 작동)

---

## 🚀 Smithery Google Sheets MCP 설치 (선택사항)

### 전제 조건
- Node.js 18+
- npm / pnpm
- Smithery 계정 (무료)

### 단계 1: Smithery CLI 설치
```bash
cd C:\SHT-DATA\sht-platform
npx -y smithery setup
```

### 단계 2: Smithery 계정 로그인
```bash
npx -y smithery auth login
```
→ 브라우저에서 Google 계정으로 인증

### 단계 3: Google Sheets MCP 추가
```bash
npx -y smithery mcp add googlesheets
```
→ Google OAuth 인증 진행

### 단계 4: 설치 확인
```bash
npx -y smithery tool list
```
→ 설치된 도구 목록에 `googlesheets` 관련 도구 표시 예상

---

## 📋 Smithery Google Sheets MCP 주요 도구

| 도구명 | 설명 | 용도 |
|--------|------|------|
| `read_sheet` | 스프레드시트 데이터 읽기 | 시트 데이터 조회 |
| `write_sheet` | 스프레드시트 데이터 쓰기 | 시트 데이터 업데이트 |
| `create_sheet` | 새 시트 생성 | 탭 추가 |
| `delete_sheet` | 시트 삭제 | 탭 제거 |
| `format_cells` | 셀 서식 적용 | 색상, 글꼴 등 포맷팅 |
| `run_formula` | 수식 실행 | 계산 수행 |

---

## 💡 개발 예시: MCP 도구 활용

### Claude Chat에서 활용 예
```
"Admin 앱의 예약 데이터를 Google Sheets로 내보내는 페이지를 만들어줄 수 있을까?
현재 스키마는 이렇고... (스키마 설명)
Smithery의 googlesheets 도구를 사용해서 동적으로 시트를 만들고 데이터를 입력해줘."
```

→ Claude가 기존 `googleapis` 코드와 MCP 도구를 함께 고려하여 구현 제안

### GitHub Copilot에서 활용 예
```typescript
// MCP 기반 쓰기 구현 제안 가능
// 기존: googleapis.sheets.v4.Sheets API 직접 호출
// MCP: Smithery googlesheets 도구 자동 제안
```

---

## ⚙️ 기술 상세: Runtime 통합 (고급)

### 현재 아키텍처
```
┌─────────────────┐
│  Admin 페이지   │
│ (sheets-sync)   │
└────────┬────────┘
         │ (POST /api/admin/sheets-sync)
         ▼
┌─────────────────────────┐
│  API Route (route.ts)   │
│  - googleapis 직접 호출  │
│  - JWT 인증              │
│  - DB 데이터 조회        │
└────────┬────────────────┘
         │
    ┌────┴─────┐
    ▼          ▼
┌────────┐  ┌──────────────┐
│Supabase│  │Google Sheets │
│   DB   │  │     API      │
└────────┘  └──────────────┘
```

### MCP 추가 시 선택적 아키텍처
```
개발 환경:
┌──────────────┐
│Claude/Copilot│
└───────┬──────┘
        │
        ▼
   ┌─────────────┐
   │Smithery MCP │ ← 개발 도구 (선택)
   │googlesheets │
   └─────────────┘

Runtime (운영):
기존 방식 유지 (변화 없음)
└─→ googleapis 직접 호출
```

---

## ⚠️ 주의사항

### 보안
- Smithery 설치 시 Google 인증정보 관리 안내 참고
- 개발 환경에서만 MCP 도구 사용 권장
- Runtime에서는 기존 googleapis 방식 유지로 보안 최적화

### 호환성
- Smithery MCP와 googleapis는 **독립적으로 작동** (충돌 없음)
- 기존 `/api/admin/sheets-sync` 코드 수정 불필요

---

## 🔄 Runtime 마이그레이션 (선택적 향후 계획)

향후 admin 앱 런타임에서 MCP 클라이언트 라이브러리를 도입하려면:

### 패키지 추가
```bash
pnpm --filter @sht/admin add @modelcontextprotocol/sdk
```

### API Route 수정 예상 코드
```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// MCP 클라이언트 초기화
const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "smithery", "tool", "call"]
});
const client = new Client({ name: "admin-app", version: "1.0.0" }, {
  capabilities: {}
});
await client.connect(transport);

// Google Sheets MCP 도구 호출
const result = await client.callTool("googlesheets", "write_sheet", {
  spreadsheet_id: process.env.GOOGLE_SHEETS_SPREADSHEET_ID,
  data: rows
});
```

⚠️ **현재는 불필요** - 기존 `googleapis` 방식으로 충분함

---

## 📚 참고 자료

- **Smithery 공식**: https://smithery.ai/
- **Google Sheets MCP**: https://smithery.ai/servers/googlesheets
- **MCP 공식 문서**: https://modelcontextprotocol.io/
- **기존 Admin Sheets Sync**: [ADMIN-GOOGLE-SHEETS-SYNC.md](./ADMIN-GOOGLE-SHEETS-SYNC.md)

---

## ✅ 체크리스트: MCP 설치 후 검증

- [ ] `npx smithery setup` 완료
- [ ] `npx smithery auth login` 인증 완료
- [ ] `npx smithery mcp add googlesheets` MCP 추가 완료
- [ ] `npx smithery tool list`에서 googlesheets 도구 확인
- [ ] Claude/Copilot에서 Google Sheets 도구 접근 가능 확인
- [ ] 기존 `/admin/sheets-sync` 페이지 정상 작동 확인
- [ ] 환경 변수 `.env.local` 변경 없음 확인 ✓

---

## 🎬 다음 단계

1. **지금**: 기존 `googleapis` 방식으로 운영 (안정적) ✅
2. **선택**: Smithery MCP 설정 (개발 편의성) 📌
3. **향후**: Runtime MCP 클라이언트 통합 검토 (필요시)

질문이 있으면 이 문서를 참고하거나 업데이트하세요.
