#!/usr/bin/env bash
# 대화형 Supabase 환경 설정 스크립트
# Usage: bash scripts/setup-env-interactive.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🔧 Supabase 환경 설정 가이드"
echo "======================================"
echo ""
echo "이 스크립트는 박선형 예약 검색을 위해 Supabase 환경 변수를 설정합니다."
echo ""

# 기존 환경 변수 확인
if [ -n "${NEXT_PUBLIC_SUPABASE_URL:-}" ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "✅ 환경 변수가 이미 설정되어 있습니다:"
  echo "   URL: ${NEXT_PUBLIC_SUPABASE_URL}"
  echo ""
  read -p "이 설정으로 계속 진행하시겠습니까? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    export NEXT_PUBLIC_SUPABASE_URL
    export SUPABASE_SERVICE_ROLE_KEY
    exit 0
  fi
fi

echo ""
echo "📝 다음 정보를 입력해주세요 (Supabase Dashboard에서 확인 가능):"
echo ""

read -p "1. NEXT_PUBLIC_SUPABASE_URL (https://xxx.supabase.co): " SUPABASE_URL
if [ -z "$SUPABASE_URL" ]; then
  echo "❌ URL을 입력해주세요."
  exit 1
fi

read -sp "2. SUPABASE_SERVICE_ROLE_KEY (비밀 키, 표시되지 않음): " SUPABASE_KEY
echo ""
if [ -z "$SUPABASE_KEY" ]; then
  echo "❌ 서비스 역할 키를 입력해주세요."
  exit 1
fi

echo ""
echo "✅ 환경 설정 저장 중..."

# .env.local에 저장 (홈 디렉토리)
ENV_FILE="$HOME/.sht-platform.env"
cat > "$ENV_FILE" <<EOF
export NEXT_PUBLIC_SUPABASE_URL="$SUPABASE_URL"
export SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_KEY"
EOF

chmod 600 "$ENV_FILE"
echo "✅ 저장됨: $ENV_FILE"
echo ""

# 환경 변수 로드
source "$ENV_FILE"

echo "✅ 환경 변수가 설정되었습니다."
echo ""
echo "다음에 환경 변수를 로드하려면:"
echo "  source ~/.sht-platform.env"
echo "  node scripts/search-reservation-by-name.js 박선형"
echo ""
