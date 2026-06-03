# 박선형 예약 현황 검색 — 설정 가이드

## 🎯 목표
사용자 이름으로 오늘의 예약 현황을 검색합니다.

---

## 📋 빠른 시작 (3가지 방법)

### 방법 1: 자동 설정 + 검색 (권장) ⭐

```bash
cd /home/kys/문서/shtplatform

# 첫 실행: 환경 변수 입력 후 자동 저장
node scripts/search-by-name-auto.js 박선형

# 이후 실행: 저장된 환경 변수로 자동 실행
node scripts/search-by-name-auto.js 박선형
```

**동작:**
1. 시스템 환경 변수 자동 감지
2. 없으면 대화형 입력 요청
3. 저장 여부 확인 후 `~/.sht-platform.env`에 저장
4. 검색 실행

---

### 방법 2: 환경 변수 수동 설정 후 검색

```bash
export NEXT_PUBLIC_SUPABASE_URL="https://xxx.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJ..."

node scripts/search-by-name-auto.js 박선형
```

---

### 방법 3: SQL 직접 실행 (psql 필요)

```bash
# 1. psql 설치 (Ubuntu/Debian)
sudo apt update && sudo apt install -y postgresql-client

# 2. 환경 변수 설정
export DATABASE_URL="postgresql://user:pass@host:5432/db"

# 3. 쿼리 실행
bash scripts/query-reservations-by-name.sh
```

**또는 SQL 파일을 Supabase Dashboard에서 직접 실행:**
- Supabase → SQL Editor에서 `sql/query-by-name-today.sql` 내용 복사 후 실행

---

## 🔑 Supabase 정보 얻기

1. **Supabase 프로젝트** 대시보드 접속: https://app.supabase.com/projects
2. 프로젝트 선택
3. 왼쪽 메뉴 → **Settings** → **API**
4. 다음 정보 복사:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **Service Role Secret** → `SUPABASE_SERVICE_ROLE_KEY` (⚠️ 🔒 비밀 유지)

> ⚠️ **주의**: Service Role Key는 서버에서만 사용하세요. 클라이언트에 노출되면 안 됩니다.

---

## 📝 검색 옵션

```bash
# 기본: 오늘 생성된 예약 검색
node scripts/search-by-name-auto.js 박선형 created

# 옵션 1: 오늘 체크인 예약 검색
node scripts/search-by-name-auto.js 박선형 checkin

# 옵션 2: 다른 이름으로 검색
node scripts/search-by-name-auto.js 홍길동 created
```

---

## 📊 예상 출력

```
🔍 검색 중: "박선형" (생성일 기준)...

✅ 2개 예약 발견:

============================================================

[1] 예약 ID: re_00001
    이름: 박선형
    이메일: park@example.com
    전화번호: 010-1234-5678
    예약 유형: cruise
    상태: pending
    생성 일시: 2026년 6월 3일 오후 2:30

[2] 예약 ID: re_00002
    이름: 박선형
    이메일: park@example.com
    전화번호: 010-1234-5678
    예약 유형: hotel
    상태: confirmed
    생성 일시: 2026년 6월 3일 오후 3:45

============================================================

✅ 검색 완료!
```

---

## 🛠️ 트러블슈팅

### ❌ "환경 변수를 찾을 수 없습니다"
→ **방법 2** 또는 **방법 3**을 따르세요.

### ❌ "쿼리 실행 오류"
- Supabase 정보가 정확한지 확인하세요.
- Service Role **Secret** 키를 사용했는지 확인하세요 (ANON 키 아님).

### ❌ "psql 명령을 찾을 수 없음"
```bash
# 설치
sudo apt update && sudo apt install -y postgresql-client

# macOS
brew install libpq && brew link --force libpq
```

---

## 📚 관련 파일

| 파일 | 설명 |
|------|------|
| `scripts/search-by-name-auto.js` | 자동 설정 + 검색 스크립트 |
| `scripts/query-reservations-by-name.sh` | psql 기반 검색 스크립트 |
| `sql/query-by-name-today.sql` | SQL 쿼리 파일 |

---

## ✅ 완료 후 다음 단계

검색 결과를 활용하여:
- 예약 상세 정보 조회
- 결제 처리
- 고객 알림 발송
- 등등...

---

**❓ 질문이 있으신가요?**  
프로젝트 루트의 문서나 Supabase 대시보드를 참고하세요!
