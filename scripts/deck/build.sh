#!/usr/bin/env bash
# HTML 발표 덱 → PPTX 재생성.
#
#   bash scripts/deck/build.sh
#
# HTML을 고칠 때마다 이 스크립트 한 번이면 PPTX가 최신이 된다.
# 산출물(docs/*.pptx)과 촬영 캐시(docs/.deck-shots)는 .gitignore 대상 — 커밋하지 않는다.
#
# 필요: front/node_modules (playwright), python3 + python-pptx
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DOCS="$ROOT/docs"
SHOTS="$DOCS/.deck-shots"
PORT=8899

command -v python3 >/dev/null || { echo "python3 필요"; exit 1; }
python3 -c "import pptx" 2>/dev/null || { echo "python-pptx 필요: pip install python-pptx"; exit 1; }
[ -d "$ROOT/front/node_modules/playwright" ] || { echo "playwright 필요: cd front && npm install"; exit 1; }

# file:// 로 열면 이미지 로딩을 막는 브라우저 정책이 있어 로컬 서버로 띄운다.
python3 -m http.server "$PORT" --directory "$DOCS" >/dev/null 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
sleep 1

rm -rf "$SHOTS"
node "$ROOT/scripts/deck/shoot-slides.mjs" "http://127.0.0.1:$PORT/service-plan-presentation.html" "$SHOTS/sub"
node "$ROOT/scripts/deck/shoot-slides.mjs" "http://127.0.0.1:$PORT/service-plan-presentation-talk.html" "$SHOTS/talk"

python3 "$ROOT/scripts/deck/shots2pptx.py"
