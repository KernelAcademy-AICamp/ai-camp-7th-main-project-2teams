#!/usr/bin/env bash
# PreToolUse(Edit|Write) hook — 비밀키 노출 / content 평문 로깅 차단.
# CLAUDE.md 보안 제약 (.claude/rules/security.md) 1·3번을 Edit/Write 단계에서 사전 차단.
# stdin: Claude Code hook JSON. 적중 시 exit 2 (차단, stderr가 Claude에 전달).
set -euo pipefail

# 검사 함수: 인자로 받은 텍스트에서 금지 패턴 grep. 적중 시 사유 출력 후 1 반환.
scan() {
  local text="$1" hit=0
  # 1) 서버 전용 키에 NEXT_PUBLIC_ 접두어 (클라이언트 노출)
  if grep -nE 'NEXT_PUBLIC_[A-Z_]*(SERVICE_ROLE|OPENAI_API_KEY)' <<<"$text" >&2; then
    echo "🚨 서버 전용 키에 NEXT_PUBLIC_ 접두어 — 클라이언트 노출 금지" >&2
    hit=1
  fi
  # 2) content(본문) 평문 로깅 (마스킹 미경유) — known ceiling: console.* + content 휴리스틱
  if grep -nE 'console\.(log|info|debug|warn|error)\([^)]*\bcontent\b' <<<"$text" >&2; then
    echo "🚨 content 평문 로깅 의심 — maskContent() 경유 필수 (A8)" >&2
    hit=1
  fi
  return $hit
}

# self-test: 가짜 키로 차단 동작 확인
if [[ "${1:-}" == "--self-test" ]]; then
  if scan 'const x = "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY"' 2>/dev/null; then
    echo "self-test FAIL: 차단 패턴 미적중" >&2; exit 1
  fi
  if ! scan 'const url = "https://example.com"' 2>/dev/null; then
    echo "self-test FAIL: 정상 텍스트 오차단" >&2; exit 1
  fi
  echo "self-test OK"; exit 0
fi

input="$(cat)"
# Write=content, Edit=new_string (둘 다 없으면 빈 문자열)
payload="$(python3 -c '
import sys, json
d = json.load(sys.stdin)
ti = d.get("tool_input", {})
print(ti.get("content", "") or ti.get("new_string", ""))
' <<<"$input")"

if [[ -z "$payload" ]]; then exit 0; fi

if scan "$payload"; then
  exit 0
else
  echo "보안 위반 — 수정 후 다시 시도하세요 (.claude/rules/security.md)" >&2
  exit 2
fi
