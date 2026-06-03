#!/usr/bin/env python3
"""
박선형 예약 현황 검색 — Python + psycopg2
"""
import subprocess
import sys

# Supabase 정보
SUPABASE_URL = "https://jkhookaflhibrcafmlxn.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpraG9va2FmbGhpYnJjYWZtbHhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTgzMjgzMCwiZXhwIjoyMDY3NDA4ODMwfQ.KmBE7PA-ns2_HLbq8rhZe-hOeRlKoZ_phawRCvtGPSE"

# PostgreSQL 연결 정보 생성
# Supabase URL 형식: https://jkhookaflhibrcafmlxn.supabase.co
# DB Host: jkhookaflhibrcafmlxn.supabase.co
# Default user: postgres
# Default db: postgres

HOST = SUPABASE_URL.replace("https://", "").replace(".supabase.co", "") + ".supabase.co"
PORT = "6543"  # Supabase PostgreSQL 기본 포트
USER = "postgres"
DB = "postgres"

# psycopg2가 설치되었는지 확인 시도
try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    print("❌ psycopg2가 설치되지 않았습니다.")
    print("설치 방법:")
    print("  pip3 install psycopg2-binary")
    print("")
    print("또는 apt 사용:")
    print("  sudo apt install -y python3-psycopg2")
    sys.exit(1)

# 질문: 데이터베이스 비밀번호
import getpass
print("🔐 Supabase 데이터베이스 비밀번호를 입력해주세요:")
print("(Supabase → Project Settings → Database → Connection String에서 확인 가능)")
password = getpass.getpass("비밀번호: ")

if not password:
    print("❌ 비밀번호가 필요합니다.")
    sys.exit(1)

try:
    print("\n🔍 박선형 예약 조회 중...\n")
    
    conn = psycopg2.connect(
        host=HOST,
        port=PORT,
        user=USER,
        password=password,
        database=DB,
        sslmode="require"
    )
    
    cur = conn.cursor(cursor_factory=RealDictCursor)
    
    # SQL 쿼리
    query = """
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
      AND (u.name ILIKE '%박선형%' OR u.name ILIKE '%박선형%')
    ORDER BY r.re_created_at DESC;
    """
    
    cur.execute(query)
    results = cur.fetchall()
    
    if not results:
        print("✅ 결과 없음: 오늘 생성된 박선형의 예약이 없습니다.")
    else:
        print(f"✅ {len(results)}개 예약 발견:\n")
        print("=" * 120)
        
        for idx, row in enumerate(results, 1):
            print(f"\n[{idx}] 예약 ID: {row['re_id']}")
            print(f"    이름: {row['name'] or '(미설정)'}")
            print(f"    이메일: {row['email'] or '(미설정)'}")
            print(f"    전화번호: {row['phone_number'] or '(미설정)'}")
            print(f"    예약 유형: {row['re_type']}")
            print(f"    상태: {row['re_status']}")
            print(f"    생성 일시: {row['re_created_at']}")
        
        print("\n" + "=" * 120)
    
    cur.close()
    conn.close()
    
except psycopg2.OperationalError as e:
    print(f"❌ 데이터베이스 연결 실패: {e}")
    print("\n확인사항:")
    print("  - 비밀번호가 정확한지 확인하세요.")
    print("  - Supabase 프로젝트가 정상 상태인지 확인하세요.")
    sys.exit(1)
except Exception as e:
    print(f"❌ 오류: {e}")
    sys.exit(1)
