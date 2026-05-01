# Copilot Instructions for AI Agents

## 프로젝트 개요
- **스테이하롱 예약 시스템**: 네이버 자유여행 카페 회원을 위한 견적/예약 관리 웹앱입니다.
- **Next.js App Router** 구조를 사용하며, 주요 경로는 `app/` 폴더 하위에 각 기능별로 분리되어 있습니다.
- **Supabase**를 백엔드로 사용하여 인증, 데이터베이스 연동, 사용자 관리, 견적/예약 데이터 CRUD를 처리합니다.

## 주요 구조 및 컴포넌트
- `app/layout.tsx`: 전체 레이아웃, 헤더/메인 구조, 글로벌 스타일 적용.
- `app/page.tsx`: 메인 홈, 로그인 상태에 따라 안내/네비게이션 제공.
- `app/quote/`, `app/admin/quotes/`, `app/mypage/` 등: 견적 생성, 수정, 조회, 관리 기능별로 폴더 분리.
- **동적 라우팅**: `[id]`, `[new_id]` 등 폴더명으로 견적/예약 상세, 수정, 신규 생성 등 처리.
- **재사용 폼**: `QuoteForm` 등 입력 폼 컴포넌트는 여러 경로에서 재사용.

## 데이터 및 인증
- **Supabase**: `@/lib/supabase`에서 인스턴스 import, `supabase.auth.getUser()`로 인증 상태 확인.
- 주요 테이블: `quote`, `quote_price_summary`, `quote_room`, `quote_car`, `users` 등.
- 관리자 권한 체크: `users.role`이 `admin`인지 확인 후 접근 제어.

## 개발/운영 워크플로우
- **빌드/실행**: (명시적 스크립트 파일 없음, 일반적으로 `next dev`, `next build`, `next start` 사용)
- **환경 변수**: `.env` 파일 필요 (Supabase 키 등), 실제 파일은 미포함.
- **이미지/스타일**: `/public/images/`, `/styles/globals.css` 등에서 관리 (경로만 확인됨, 실제 파일 미포함).

## 코드 패턴 및 관례
- **'use client'**: 클라이언트 컴포넌트에 명시적으로 선언.
- **라우터**: `useRouter`, `useParams` 등 Next.js 훅 적극 사용.
- **상태 관리**: 주로 `useState`, `useEffect`로 로컬 상태/비동기 처리.
- **경고/리다이렉트**: 인증/권한 오류 시 `alert` 후 `router.push()`로 이동.
- **테이블 조인**: Supabase의 `.select('*, 관계테이블(*)')` 패턴으로 연관 데이터 한 번에 조회.

## 예시
- 견적 상세 조회: `quote`, `quote_price_summary`, `users`, `quote_room`, `quote_car`를 조인하여 한 번에 조회.
- 관리자 페이지: 로그인/권한 체크 후 미승인 견적만 필터링.
- 폼 재사용: 신규/수정/복사 등에서 동일 폼(`QuoteForm`) 활용.

## 참고/확장
- 외부 패키지, 커스텀 훅, 유틸 등은 현재 코드베이스에 명시적 존재 없음. 필요시 직접 생성/추가.
- 추가적인 빌드/테스트/배포 스크립트는 별도 파일에서 관리되지 않음.

---

이 문서는 AI 코딩 에이전트가 본 프로젝트에서 즉시 생산적으로 작업할 수 있도록 핵심 구조와 관례를 요약합니다. 추가 정보가 필요하면 실제 코드/폴더를 직접 탐색해 주세요.
