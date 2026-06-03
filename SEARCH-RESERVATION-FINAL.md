# 🔍 박선형 예약 현황 검색 — 최종 실행 가이드

**상태**: 준비 완료 ✅  
**생성일**: 2026년 6월 3일  
**목표**: 박선형 이름의 오늘 예약 현황 검색

---

## ⚡ 초급 (가장 간단한 방법)

### 1️⃣ Supabase 대시보드에서 SQL 직접 실행

1. **Supabase 접속** → https://app.supabase.com/projects
2. 프로젝트 선택
3. 왼쪽 메뉴 → **SQL Editor**
4. 다음 쿼리를 붙여넣고 **Run** 클릭:

```sql
SELECT
  r.re_id,
  r.re_type,
  r.re_status,
  r.re_created_at,
  u.name,
  u.email,
  u.phone_number
FROM reservation r
LEFT JOIN users u ON u.id = r.re_user_id
WHERE r.re_created_at::date = CURRENT_DATE
  AND (u.name ILIKE '%박선형%')
ORDER BY r.re_created_at DESC;
```

**결과**: 테이블 형식으로 예약 정보 표시  
**시간**: ~5초

---

## 🎯 중급 (자동 스크립트)

### 2️⃣ Python 스크립트로 자동 검색

**필수**: Python 3 + psycopg2

```bash
# 1. 필요 패키지 설치 (첫 1회만)
pip3 install psycopg2-binary

# 또는 apt 사용
sudo apt install -y python3-psycopg2

# 2. 스크립트 실행
python3 scripts/search-reservation-by-name.py
```

**프로세스**:
1. 대화형 입력으로 DB 비밀번호 요청
2. 데이터베이스 연결
3. 자동 검색 실행
4. 결과 출력

**필요 정보**: Supabase DB 비밀번호 (Supabase Dashboard → Settings → Database → Connection String)

---

### 3️⃣ Node.js 스크립트로 검색

**필수**: Node.js 20+

```bash
# 1. ws 패키지 설치 (모노레포이므로 -w 플래그 필수)
pnpm add -w ws

# 2. 환경 변수 설정
export NEXT_PUBLIC_SUPABASE_URL="https://jkhookaflhibrcafmlxn.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraG9va2FmbGhpYnJjYWZtbHhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTgzMjgzMCwiZXhwIjoyMDY3NDA4ODMwfQ.KmBE7PA-ns2_HLbq8rhZe-hOeRlKoZ_phawRCvtGPSE"

# 3. 스크립트 실행
node scripts/search-by-name-auto.js 박선형 created
```

**참고**: 환경 변수는 `~/.sht-platform.env`에 자동 저장되므로 다음 실행 시 자동 로드됨.

---

### 4️⃣ Bash 스크립트로 psql 사용

**필수**: psql (PostgreSQL CLI)

```bash
# 1. psql 설치
sudo apt-get update && sudo apt-get install -y postgresql-client

# macOS
brew install libpq && brew link --force libpq

# 2. 환경 변수 설정
export DATABASE_URL="postgresql://postgres:PASSWORD@jkhookaflhibrcafmlxn.supabase.co:6543/postgres"

# 3. 스크립트 실행
bash scripts/query-reservations-by-name.sh

# 또는 직접 SQL 파일 사용
psql "$DATABASE_URL" -f sql/query-by-name-today.sql
```

**DATABASE_URL 가져오기**:
- Supabase Dashboard → Project Settings → Database → Connection String (URI)
- PASSWORD를 실제 DB 비밀번호로 바꾸기

---

## 🔑 Supabase 정보 위치

| 정보 | 위치 |
|------|------|
| **Project URL** | Settings → API → Project URL |
| **Service Role Key** | Settings → API → Service Role Secret (🔒 비밀 유지) |
| **DB Password** | Settings → Database → Connection String에 포함 |
| **DB Host** | `jkhookaflhibrcafmlxn.supabase.co` |
| **DB Port** | `6543` |
| **DB User** | `postgres` |

---

## 📋 생성된 파일 목록

| 파일 | 설명 | 실행 방법 |
|------|------|---------|
| `scripts/search-by-name-auto.js` | Node.js 자동 검색 | `node` |
| `scripts/search-reservation-by-name.py` | Python DB 연결 | `python3` |
| `scripts/query-reservations-by-name.sh` | psql 기반 검색 | `bash` |
| `sql/query-by-name-today.sql` | SQL 쿼리 파일 | Supabase SQL Editor 또는 psql |
| `scripts/setup-env-interactive.sh` | 환경 변수 대화형 설정 | `bash` |
| `SEARCH-RESERVATION-GUIDE.md` | 상세 가이드 | 참고용 문서 |

---

## ✅ 빠른 체크리스트

- [ ] Supabase 대시보드 접속 가능한지 확인
- [ ] 필요한 도구 설치 여부 확인 (Python/Node.js/psql 중 선택)
- [ ] 검색하고 싶은 기준 선택 (생성일/체크인)
- [ ] 스크립트 실행
- [ ] 결과 확인

---

## 🆘 트러블슈팅

### ❌ "환경 변수를 찾을 수 없음"
→ Supabase 정보를 수동 입력하세요 (위의 중급 방법 참고)

### ❌ "데이터베이스 연결 실패"
- 비밀번호가 정확한지 확인
- Supabase 프로젝트 상태 확인
- 네트워크 연결 확인

### ❌ "psql: command not found"
→ 위의 "4️⃣ Bash 스크립트"에서 설치 명령 실행

### ❌ "Node.js WebSocket 오류"
→ `pnpm add -w ws` 실행

---

## 📝 추가 정보

### 다른 이름으로 검색
```bash
node scripts/search-by-name-auto.js 홍길동
python3 scripts/search-reservation-by-name.py  # 대화형 입력에서 이름 변경
```

### 체크인(오늘) 기준 검색
```bash
node scripts/search-by-name-auto.js 박선형 checkin
```

### 결과를 파일로 저장
```bash
# Python
python3 scripts/search-reservation-by-name.py > results.txt 2>&1

# Node.js
node scripts/search-by-name-auto.js 박선형 > results.txt 2>&1
```

---

## 🎯 권장 실행 순서

**만약 처음이라면**:
1. **방법 1** (Supabase 대시보드) - 가장 간단, 설치 불필요
2. **방법 2** (Python) - 일회성 조회
3. **방법 3** (Node.js) - 반복 사용, 환경 저장

**반복해서 사용한다면**:
- **Node.js** 방법이 가장 편함 (환경 자동 저장)
- 또는 **Bash + SQL 파일** (매번 호출 가능)

---

**❓ 막히는 부분이 있으신가요?**  
위의 "트러블슈팅" 섹션을 참고하거나, Supabase 대시보드의 "Help" 메뉴를 확인하세요!
