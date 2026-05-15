-- 🔍 reservation_cruise.request_note 데이터 분석 쿼리
-- 삭제 안전성별 분류

-- ============================================
-- 1️⃣ 전체 통계
-- ============================================
SELECT 
  COUNT(*) as "전체 행 수",
  SUM(CASE WHEN request_note IS NULL OR request_note = '' THEN 1 ELSE 0 END) as "NULL/빈칸",
  SUM(CASE WHEN request_note IS NOT NULL AND request_note != '' THEN 1 ELSE 0 END) as "데이터 있음"
FROM reservation_cruise;

-- ============================================
-- 2️⃣ 🗑️ 삭제 안전 (시스템 메타데이터만 있는 행)
-- ============================================
-- 패턴: [객실 1] 베란다 스위트 x1 | 성인 2, 아동 0... (메타데이터만)
SELECT 
  'SAFE_DELETE' as "카테고리",
  COUNT(*) as "개수",
  json_agg(
    json_build_object(
      'id', id,
      'request_note', SUBSTRING(request_note, 1, 150)
    )
    ORDER BY created_at DESC
  ) FILTER (WHERE TRUE) as "샘플 (최근순)"
FROM reservation_cruise
WHERE (
  -- 시스템 생성 패턴들
  request_note LIKE '[객실%'
  OR request_note LIKE '[구성%'
  OR request_note LIKE '[OPTIONS:%'
  OR request_note LIKE '[CHILD_BIRTH_DATES:%'
  OR request_note LIKE '[INFANT_BIRTH_DATES:%'
  OR request_note LIKE '[CHILD_OLDER_COUNTS:%'
)
AND (
  -- 사용자 입력이 없거나 최소한만 있음
  LENGTH(TRIM(request_note)) < 200
  OR request_note NOT LIKE '%신청%'
  AND request_note NOT LIKE '%요청%'
  AND request_note NOT LIKE '%추가%'
  AND request_note NOT LIKE '%변경%'
  AND request_note NOT LIKE '%특별%'
);

-- ============================================
-- 3️⃣ ⚠️  주의 (혼합 데이터 - 메타데이터 + 사용자 입력)
-- ============================================
-- 패턴: [객실...] + 커넥팅룸 신청 + 기타 사용자 요청
SELECT 
  'MIXED_DATA' as "카테고리",
  COUNT(*) as "개수",
  json_agg(
    json_build_object(
      'id', id,
      'request_note', SUBSTRING(request_note, 1, 200),
      'length', LENGTH(request_note)
    )
    ORDER BY created_at DESC
  ) FILTER (WHERE TRUE) as "샘플 (최근순)"
FROM reservation_cruise
WHERE (
  request_note LIKE '[객실%'
  OR request_note LIKE '[구성%'
  OR request_note LIKE '[OPTIONS:%'
  OR request_note LIKE '[CHILD_BIRTH_DATES:%'
  OR request_note LIKE '[INFANT_BIRTH_DATES:%'
  OR request_note LIKE '[CHILD_OLDER_COUNTS:%'
)
AND (
  -- 사용자가 추가로 입력한 텍스트가 있음
  request_note LIKE '%신청%'
  OR request_note LIKE '%요청%'
  OR request_note LIKE '%추가%'
  OR request_note LIKE '%변경%'
  OR request_note LIKE '%특별%'
  OR request_note LIKE '%커넥팅%'
  OR LENGTH(TRIM(request_note)) >= 200
);

-- ============================================
-- 4️⃣ 🛡️  보호 (사용자 입력만 있는 행)
-- ============================================
-- 패턴: 커넥팅룸 신청 / 특별 요청사항 등 순수 사용자 입력
SELECT 
  'USER_INPUT_ONLY' as "카테고리",
  COUNT(*) as "개수",
  json_agg(
    json_build_object(
      'id', id,
      'request_note', request_note,
      'created_at', created_at
    )
    ORDER BY created_at DESC
  ) FILTER (WHERE TRUE) as "샘플 (최근순)"
FROM reservation_cruise
WHERE request_note IS NOT NULL 
AND request_note != ''
AND NOT (
  request_note LIKE '[객실%'
  OR request_note LIKE '[구성%'
  OR request_note LIKE '[OPTIONS:%'
  OR request_note LIKE '[CHILD_BIRTH_DATES:%'
  OR request_note LIKE '[INFANT_BIRTH_DATES:%'
  OR request_note LIKE '[CHILD_OLDER_COUNTS:%'
);

-- ============================================
-- 5️⃣ NULL/빈칸 데이터
-- ============================================
SELECT 
  'EMPTY' as "카테고리",
  COUNT(*) as "개수"
FROM reservation_cruise
WHERE request_note IS NULL OR request_note = '';

-- ============================================
-- 6️⃣ 상세 샘플: 각 카테고리별 최신 5개
-- ============================================
(
  -- 🗑️ 삭제 안전 샘플
  SELECT '🗑️ SAFE_DELETE' as type, id, SUBSTRING(request_note, 1, 100) as preview, created_at
  FROM reservation_cruise
  WHERE (request_note LIKE '[객실%' OR request_note LIKE '[OPTIONS:%')
  AND LENGTH(TRIM(request_note)) < 200
  ORDER BY created_at DESC LIMIT 5
)
UNION ALL
(
  -- ⚠️ 혼합 데이터 샘플
  SELECT '⚠️ MIXED_DATA' as type, id, SUBSTRING(request_note, 1, 100) as preview, created_at
  FROM reservation_cruise
  WHERE request_note LIKE '[객실%' AND request_note LIKE '%신청%'
  ORDER BY created_at DESC LIMIT 5
)
UNION ALL
(
  -- 🛡️ 사용자 입력만 샘플
  SELECT '🛡️ USER_INPUT' as type, id, SUBSTRING(request_note, 1, 100) as preview, created_at
  FROM reservation_cruise
  WHERE request_note IS NOT NULL 
  AND NOT (request_note LIKE '[객실%' OR request_note LIKE '[OPTIONS:%')
  ORDER BY created_at DESC LIMIT 5
)
ORDER BY type, created_at DESC;
