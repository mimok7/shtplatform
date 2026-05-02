# Admin DB to Google Sheets Sync

관리자 앱의 `/admin/sheets-sync` 페이지에서 Supabase DB 데이터를 Google Sheets로 내보냅니다.

> 📌 **참고**: 개발 환경에서 **Smithery의 Google Sheets MCP**를 선택사항으로 추가할 수 있습니다.  
> 자세한 가이드는 [ADMIN-GOOGLE-SHEETS-MCP.md](./ADMIN-GOOGLE-SHEETS-MCP.md) 참고 (선택사항, 개발 편의성 향상)

## 생성되는 시트 탭

- `동기화_상태`: 마지막 동기화 시각과 행 수 요약
- `관계_매핑`: 사용자가 시트에서 데이터를 조회할 때 참고할 관계 키
- `예약자별_예약조회`: 예약자, 예약, 크루즈 예약 정보를 한 줄로 결합한 조회용 탭
- `크루즈예약_상세`: 크루즈 예약과 가격표/객실 안내를 결합한 탭
- `크루즈가격_안내`: 크루즈 가격표, 객실 안내, 포함사항을 상담용으로 정리한 탭
- `예약자_목록`: 예약자 마스터와 예약 건수

## 필요한 환경변수

`apps/admin/.env.local` 또는 배포 환경에 아래 값을 설정합니다. 예시는 `apps/admin/.env.sheets-sync.example`에 있습니다.

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_SHEETS_SPREADSHEET_ID=
GOOGLE_SERVICE_ACCOUNT_JSON=
```

`GOOGLE_SERVICE_ACCOUNT_JSON` 대신 아래 두 키를 사용할 수 있습니다.

```env
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
```

## Google 설정

1. Google Cloud Console에서 Sheets API를 활성화합니다.
2. Service Account를 만들고 JSON 키를 발급합니다.
3. 대상 Google Sheet를 만들고 주소에서 Spreadsheet ID를 확인합니다.
4. Google Sheet 공유 설정에서 Service Account 이메일에 편집 권한을 부여합니다.
5. 관리자 앱에서 `/admin/sheets-sync`로 이동해 상태 확인 후 동기화 실행을 누릅니다.

## 검증

변경 파일 기준 ESLint 검증:

```powershell
cd C:\SHT-DATA\sht-platform
npx --yes pnpm@9.12.0 --filter @sht/admin exec eslint app/admin/sheets-sync/page.tsx app/api/admin/sheets-sync/route.ts components/AdminLayout.tsx
```
