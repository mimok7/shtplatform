# 🔧 라이나/엠바사더 크루즈 버그 수정 - 최종 실행 가이드

## 📌 상황 설명

사용자 보고:
- **라이나 그랜져 크루즈**: 가격 변동이 보이지 않음 (2026-04-03부터 +250k/+500k 인상 예정)
- **엠바사더 크루즈**: 크루즈 목록에 나타나지 않음

## ✅ 해결 방법 (3분 소요)

### 1️⃣ Supabase 접속
- https://app.supabase.com → 프로젝트 선택 → SQL Editor

### 2️⃣ 스크립트 선택 및 실행

#### **옵션 A: 자동 진단 및 수정 (권장)**
```
파일: sql/INTEGRATED-LAINA-AMBASSADOR-FIX.sql
작업: 전체 복사 → SQL Editor 붙여넣기 → 실행
예상 시간: 3분
```

**이 스크립트는:**
- ✅ 라이나 크루즈 모든 행 활성화 (is_active = true)
- ✅ 라이나 요금 변동 적용 (2026-04-03부터 +250k/+500k)
- ✅ 엠바사더 크루즈 모든 행 활성화 (is_active = true)
- ✅ 엠바사더 요금 변동 적용 (2026-04-15부터 +150k)
- ✅ 최종 결과 자동 검증

#### **옵션 B: 단계별 진행 (상세 확인 원하는 경우)**
1. `sql/LAINA-DIAGNOSIS.sql` 실행 → 현재 라이나 상태 진단
2. 결과에 따라 `sql/LAINA-QUICK-RUN.sql` 실행
3. `sql/2026-03-30-ambassador-overnight-signature-rate-increase-from-2026-04-15.sql` 실행

### 3️⃣ 결과 확인

**성공 시 화면 표시:**
```
step status                       laina_total  laina_active  ambassador_total  ambassador_active
---- ========================   -----------  -----------   ---------------   -----------------
    === 실행 후 상태 확인 ===        20            20              16                 16
```

### 4️⃣ UI 확인 (앱에서)

#### 라이나 크루즈 확인
```
1. /mypage/quotes (견적 페이지) → 크루즈 선택
   ✅ "라이라 그랜져 크루즈" 또는 "라이나" 크루즈 목록에 보이는가?

2. 탑승일 선택
   ✅ 2026-04-02 선택 → 원본 가격 표시
   ✅ 2026-04-03 선택 → +250k(1N2D) 또는 +500k(2N3D) 인상 표시

3. 직접예약 페이지(/mypage/direct-booking/cruise)도 동일 확인
```

#### 엠바사더 크루즈 확인
```
1. /mypage/quotes (견적 페이지) → 크루즈 선택
   ✅ "엠바사더" 크루즈 목록에 보이는가?

2. 탑승일 선택
   ✅ 2026-04-14 선택 → 원본 가격 표시
   ✅ 2026-04-15 선택 → +150k 인상 표시

3. 직접예약 페이지도 동일 확인
```

## 🚨 문제 해결

| 문제 | 해결책 |
|------|--------|
| SQL 실행 후 "duplicate key" 오류 | 이미 한 번 실행됨. 정상. 데이터가 올바르게 적용됨. |
| UI에서 여전히 크루즈가 안 보임 | 브라우저 캐시 삭제 후 새로고침 (Ctrl+F5) |
| 가격이 여전히 인상되지 않음 | 앱 전체 재시작 또는 로그아웃 후 재로그인 |
| SQL 실행 중 "syntax error" | 파일 전체를 다시 복사하여 붙여넣기 |

## 📁 파일 위치

모든 SQL 파일은 `sql/` 디렉토리에 있습니다:
- `INTEGRATED-LAINA-AMBASSADOR-FIX.sql` ← **메인 스크립트 (추천)**
- `LAINA-QUICK-RUN.sql` ← 라이나만 빠르게 수정
- `LAINA-DIAGNOSIS.sql` ← 라이나 상태 진단
- `LAINA-FINAL-CHECKLIST.md` ← 상세 체크리스트
- `LAINA-EXECUTION-GUIDE.md` ← 상세 실행 가이드
- `2026-03-30-laina-cruise-oil-surcharge-rate-update.sql` ← 라이나 요금 변동 (독립 실행용)
- `2026-03-30-ambassador-overnight-signature-rate-increase-from-2026-04-15.sql` ← 엠바사더 요금 변동 (독립 실행용)

## 📞 기술 지원

**문제 발생 시 제공할 정보:**
1. SQL 실행 시 나타난 정확한 오류 메시지
2. SQL 실행 후 최종 검증 결과 (위의 "결과 확인" 섹션 스크린샷)
3. UI에서 보이는 현재 크루즈 목록

## ⏱️ 예상 소요 시간
- SQL 실행: 3분
- UI 확인: 2분
- **총소요시간: 5분**

---

**이제 위의 옵션 A를 Supabase에서 실행해주세요!** 🚀
