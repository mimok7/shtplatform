# @sht/partner — 제휴업체 시스템

스테이하롱 제휴업체(호텔/숙박 등) 예약 시스템. 모노레포 신규 앱.

## 개발

```bash
# 루트에서
pnpm install
pnpm --filter @sht/partner dev   # http://localhost:3003
pnpm --filter @sht/partner build
```

## 환경 변수 (`.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## DB 스키마

Supabase SQL Editor에서 실행:

```
sht-platform/sql/2026-04-30-partner-system.sql
```

신규 테이블:
- `partner` — 제휴업체 마스터
- `partner_service` — 업체별 객실/플랜
- `partner_price` — 시즌·기간별 가격
- `partner_user` — 담당자 매핑
- `partner_reservation` — 예약 메인

## 사용자 역할별 접근

| 역할 | 경로 | 설명 |
|------|------|------|
| member | `/partner/booking`, `/partner/my-reservations` | 호텔 검색, 예약 생성, 본인 예약 조회 |
| partner | `/partner/dashboard`, `/partner/calendar` | 자기 업체 예약만 조회 (RLS) |
| manager / admin | `/partner/admin/*` | 업체·서비스·가격·담당자·예약 관리 |

## 운영 절차

1. 매니저 로그인 → `/partner/admin/partners`에서 업체 신규 등록
2. 업체 상세에서 서비스(객실), 가격, 담당자 매핑 등록
3. 담당자(가입된 사용자)를 매핑하면 자동으로 `users.role='partner'` 변경
4. 예약자는 `/partner/booking`에서 호텔 선택 → 예약 생성
5. 제휴업체 담당자는 `/partner/dashboard`에서 자기 업체 예약만 확인
