# SHT Quote

스테이하롱 견적 전용 앱입니다. 기존 독립 저장소 `sht-quote`에서 이관되었으며, 이제 `sht-platform` 모노레포의 `apps/quote`에서만 관리합니다.

## 앱 정보

| 항목 | 값 |
|---|---|
| 패키지 | `@sht/quote` |
| 로컬 포트 | `3002` |
| 도메인 | `quote.stayhalong.com` |
| 프레임워크 | Next.js 15 App Router |

## 실행

모노레포 루트에서 실행합니다.

```bash
pnpm --filter @sht/quote dev
```

브라우저 접속:

```text
http://localhost:3002
```

## 환경 변수

`apps/quote/.env.local`에 설정합니다.

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 주요 기능

- 크루즈, 공항, 호텔, 투어, 렌트카 견적 작성
- 견적 목록/상세/수정/제출 관리
- PDF 다운로드 및 견적 확인 흐름
- Supabase Auth 기반 견적자 세션 관리

## 관리 원칙

- 독립 저장소 `sht-quote`는 더 이상 수정하지 않습니다.
- 견적 앱 수정은 항상 `sht-platform/apps/quote`에서 진행합니다.
- 공통 스키마/마이그레이션은 모노레포 루트 `sql/`을 우선 기준으로 확인합니다.
