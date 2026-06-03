#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   DATABASE_URL="postgres://user:pass@host:5432/db" \
#     NAME="박선형" MODE=created ./scripts/query-reservations-by-name.sh
#
# MODE: 'created' (기본) -> re_created_at 기준 오늘 생성된 예약
#       'checkin'         -> reservation_cruise/reservation_hotel 등의 checkin이 오늘인 예약

NAME=${NAME:-}
MODE=${MODE:-created}

if [ -z "$NAME" ]; then
  echo "Usage: NAME=\"박선형\" [MODE=created|checkin] DATABASE_URL=... $0"
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Error: 환경변수 DATABASE_URL이 설정되어 있지 않습니다."
  echo "Supabase의 경우 'psql'에 사용할 수 있는 Postgres connection string을 DATABASE_URL로 설정하세요."
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "경고: 'psql'이 설치되어 있지 않습니다. 설치 방법(예: Ubuntu):"
  echo "  sudo apt update && sudo apt install -y postgresql-client"
  echo "macOS(Homebrew): brew install libpq && brew link --force libpq"
  exit 2
fi

if [ "$MODE" = "created" ]; then
  SQL=$(cat <<'SQL'
\set name :NAME
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
WHERE r.re_created_at::date = current_date
  AND (u.name ILIKE '%' || :'name' || '%')
ORDER BY r.re_created_at DESC;
SQL
)
else
  SQL=$(cat <<'SQL'
\set name :NAME
SELECT
  r.re_id,
  r.re_type,
  r.re_status,
  COALESCE(rc.checkin, rh.checkin) AS checkin,
  u.name,
  u.email,
  u.phone_number
FROM reservation r
LEFT JOIN users u ON u.id = r.re_user_id
LEFT JOIN reservation_cruise rc ON rc.reservation_id = r.re_id
LEFT JOIN reservation_hotel rh ON rh.reservation_id = r.re_id
WHERE (rc.checkin::date = current_date OR rh.checkin::date = current_date)
  AND u.name ILIKE '%' || :'name' || '%'
ORDER BY checkin NULLS FIRST;
SQL
)
fi

PSQL_CMD=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -A -F $'\t' -c "$SQL")

# Export NAME for libpq variable substitution
export NAME

exec "${PSQL_CMD[@]}"
