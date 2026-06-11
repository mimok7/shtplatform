# 크루즈 요금 업데이트 지침

## 목적

크루즈 요금표(`public.cruise_rate_card`)를 업데이트할 때 기존 예약이 참조하는 `room_price_code`가 끊어지지 않도록 안전하게 운영하기 위한 지침입니다.

이번 장애 유형은 기존 예약의 `reservation_cruise.room_price_code`가 과거 `cruise_rate_card.id`를 직접 저장하고 있는데, 요금표 업데이트 시 기존 행을 `DELETE`하고 새 UUID로 `INSERT`하면서 발생했습니다.

---

## 핵심 결론

기존 예약이 하나라도 연결된 요금행은 삭제하면 안 됩니다.

안전한 원칙은 아래 4가지입니다.

1. 기존 예약이 참조 중인 요금행은 `DELETE`하지 않는다.
2. 현재/미래 가격 수정은 가능한 한 기존 행을 `UPDATE`한다.
3. 새 시즌, 새 객실, 새 상품만 `INSERT`한다.
4. 판매 종료는 삭제 대신 `is_active = false` 또는 `valid_to` 조정으로 처리한다.

---

## 왜 오류가 발생하는가

현재 구조에서는 아래 연결이 유지되어야 합니다.

```text
reservation_cruise.room_price_code  ->  cruise_rate_card.id
```

그런데 요금표 업데이트 SQL이 아래처럼 동작하면 문제가 생깁니다.

```sql
DELETE FROM public.cruise_rate_card
WHERE cruise_name = '크루즈명';

INSERT INTO public.cruise_rate_card (... 새 UUID ...)
VALUES (...);
```

이 경우 기존 예약은 과거 UUID를 계속 들고 있고, 해당 UUID 행은 삭제되었기 때문에 예약 상세 조회, 정산, 스케줄 표시, 요금 계산 화면에서 오류가 발생할 수 있습니다.

---

## 권장 업데이트 방식

## 1. 가격만 바뀌는 경우

가장 안전한 방식은 기존 행 `UPDATE`입니다.

적용 조건:

- 동일 크루즈
- 동일 일정유형
- 동일 객실
- 동일 적용기간
- 기존 행 UUID를 유지해야 함

예시:

```sql
UPDATE public.cruise_rate_card
SET
  price_adult = 5200000,
  price_child = 2600000,
  updated_at = now()
WHERE id = '기존-uuid';
```

가능하면 `id` 기준으로 업데이트하고, 불가하면 `cruise_name + schedule_type + room_type + valid_from + valid_to` 기준으로 매우 신중하게 갱신합니다.

## 2. 새 시즌이 추가되는 경우

기존 행은 유지하고 새 기간만 `INSERT`합니다.

예시:

```sql
INSERT INTO public.cruise_rate_card (
  id, cruise_name, schedule_type, room_type, valid_year, valid_from, valid_to, ...
) VALUES (
  gen_random_uuid(), '크루즈명', '1N2D', '객실명', 2026, DATE '2026-10-01', DATE '2026-12-31', ...
);
```

## 3. 객실/상품이 판매 종료되는 경우

삭제하지 말고 비활성화합니다.

예시:

```sql
UPDATE public.cruise_rate_card
SET
  is_active = false,
  updated_at = now()
WHERE id = '기존-uuid';
```

또는 미래 판매 종료일만 조정합니다.

```sql
UPDATE public.cruise_rate_card
SET
  valid_to = DATE '2026-09-30',
  updated_at = now()
WHERE id = '기존-uuid';
```

## 4. 반드시 구조를 갈아엎어야 하는 경우

아래 순서를 지켜야 합니다.

1. 기존 참조 예약 건수 확인
2. 참조 건수가 0인 행만 삭제 허용
3. 참조 건수가 1건 이상이면 기존 행 유지
4. 필요한 경우 신규 행을 추가하고 운영 화면에서 신규 행만 선택되게 조정

---

## 업데이트 전 사전 점검

반드시 아래 쿼리를 먼저 실행합니다.

### 1. 수정 대상 요금행의 예약 참조 건수 확인

```sql
SELECT
  crc.id,
  crc.cruise_name,
  crc.schedule_type,
  crc.room_type,
  crc.valid_from,
  crc.valid_to,
  crc.is_active,
  COUNT(rc.id) AS reservation_count
FROM public.cruise_rate_card crc
LEFT JOIN public.reservation_cruise rc
  ON rc.room_price_code = crc.id::text
WHERE crc.cruise_name = '크루즈명'
GROUP BY crc.id, crc.cruise_name, crc.schedule_type, crc.room_type, crc.valid_from, crc.valid_to, crc.is_active
ORDER BY reservation_count DESC, crc.valid_from, crc.room_type;
```

판단 기준:

- `reservation_count > 0`: 삭제 금지
- `reservation_count = 0`: 삭제 가능하지만 가능하면 삭제 대신 비활성화 권장

### 2. 백업 확보

수정 전 최소한 대상 크루즈 데이터는 백업합니다.

```sql
SELECT *
FROM public.cruise_rate_card
WHERE cruise_name = '크루즈명'
ORDER BY schedule_type, valid_from, room_type;
```

가능하면 결과를 별도 SQL 파일 또는 CSV로 저장합니다.

---

## 업데이트 작업 순서

### 표준 순서

1. 대상 크루즈와 시즌 범위를 확정한다.
2. 사전 점검 쿼리로 참조 예약 건수를 확인한다.
3. 기존 UUID를 유지하는 `UPDATE`가 가능한지 먼저 판단한다.
4. 새 시즌/새 객실만 `INSERT`한다.
5. 종료 상품은 `DELETE`하지 말고 `is_active = false` 또는 날짜 조정으로 마감한다.
6. 작업 직후 고아 참조 검증 쿼리를 실행한다.
7. 예약 상세, 일정표, 정산 화면에서 샘플 예약을 직접 확인한다.

---

## 업데이트 후 사후 검증

### 1. 고아 room_price_code 확인

```sql
SELECT
  rc.room_price_code,
  COUNT(*) AS reservation_count
FROM public.reservation_cruise rc
LEFT JOIN public.cruise_rate_card crc
  ON crc.id::text = rc.room_price_code
WHERE rc.room_price_code IS NOT NULL
  AND crc.id IS NULL
GROUP BY rc.room_price_code
ORDER BY reservation_count DESC;
```

정상 기준:

- 결과 0건

### 2. 특정 크루즈 예약만 별도 확인

```sql
SELECT
  r.id AS reservation_id,
  r.reservation_number,
  rc.room_price_code,
  crc.cruise_name,
  crc.schedule_type,
  crc.room_type
FROM public.reservation r
JOIN public.reservation_cruise rc
  ON rc.reservation_id = r.id
LEFT JOIN public.cruise_rate_card crc
  ON crc.id::text = rc.room_price_code
WHERE crc.cruise_name = '크루즈명'
   OR crc.id IS NULL
ORDER BY r.created_at DESC;
```

---

## 금지 패턴과 권장 패턴

### 금지 패턴

```sql
DELETE FROM public.cruise_rate_card
WHERE cruise_name = '크루즈명';

INSERT INTO public.cruise_rate_card (...) VALUES (...);
```

이 방식은 기존 예약이 참조하는 UUID를 끊을 수 있습니다.

### 권장 패턴

```sql
BEGIN;

-- 1. 기존 행 유지한 채 가격 수정
UPDATE public.cruise_rate_card
SET
  price_adult = 5200000,
  price_child = 2600000,
  updated_at = now()
WHERE id = '기존-uuid';

-- 2. 새 시즌만 추가
INSERT INTO public.cruise_rate_card (
  id, cruise_name, schedule_type, room_type, valid_year, valid_from, valid_to, ...
) VALUES (
  gen_random_uuid(), '크루즈명', '1N2D', '객실명', 2026, DATE '2026-10-01', DATE '2026-12-31', ...
);

COMMIT;
```

---

## 장애 발생 시 복원 원칙

이미 삭제가 발생했다면 가장 안전한 복원 방법은 기존 예약이 참조하던 UUID 행을 원래 값으로 되살리는 것입니다.

원칙:

1. 예약의 `room_price_code`를 함부로 다른 UUID로 일괄 변경하지 않는다.
2. 가능하면 삭제된 `cruise_rate_card.id`를 동일 UUID로 복원한다.
3. 복원 후 고아 참조 검증 쿼리로 0건 확인한다.

---

## 장기 개선 권장사항

운영 지침만으로도 재발 가능성은 크게 줄일 수 있지만, 구조적으로는 아래 개선이 가장 좋습니다.

### 1. 외래키 또는 검증 장치 추가

- `reservation_cruise.room_price_code`와 `cruise_rate_card.id`의 정합성 검증 장치 추가
- 바로 FK 추가가 어렵다면 정기 점검 쿼리 또는 관리자 경고 배치라도 운영

### 2. 예약 시점 요금 스냅샷 강화

예약 생성 시 아래 정보를 예약 테이블 또는 별도 스냅샷 테이블에 저장하면 과거 조회 안정성이 더 좋아집니다.

- cruise_rate_card.id
- cruise_name
- schedule_type
- room_type
- 적용 요금
- 적용 날짜 구간

### 3. 운영용 업서트 스크립트 표준화

향후 요금 업데이트 SQL은 자유 작성하지 말고 아래 중 하나로 표준화하는 것이 좋습니다.

- `UPDATE + INSERT` 전용 템플릿
- 참조 예약 건수 점검을 포함한 배포용 SQL 템플릿
- 관리자 화면에서 안전 검증 후 반영하는 방식

---

## 실무용 체크리스트

요금 업데이트 전:

- 대상 크루즈 확정
- 대상 시즌 확정
- 참조 예약 건수 확인
- 백업 확보
- `DELETE` 사용 여부 재검토

요금 업데이트 중:

- 기존 UUID 유지
- 기존 예약 참조 행 삭제 금지
- 새 시즌만 추가
- 종료 상품은 비활성화

요금 업데이트 후:

- 고아 `room_price_code` 0건 확인
- 샘플 예약 상세 확인
- 일정표/정산/예약조회 화면 확인

---

## 현재 운영 권고

당장은 다음 두 가지를 바로 적용하는 것을 권장합니다.

1. `cruise_rate_card` 관련 신규 SQL 작성 시 `DELETE FROM cruise_rate_card` 사용을 중지
2. 배포 전후로 고아 `room_price_code` 검증 쿼리를 필수 절차로 운영

이 두 가지만 지켜도 지금과 같은 기존 예약 오류는 대부분 예방할 수 있습니다.
