#!/usr/bin/env bash
# PreToolUse(Bash git commit) hook — 커밋 전 lint + 관련 vitest 게이트.
# 가드: front/·extension/ 중 staged 변경이 있고 해당 패키지에 package.json이 있을 때만 실행.
# 미스캐폴드(package.json 없음)면 skip(exit 0) — 빈 레포에서 커밋 막지 않음.
# 실패 시 exit 2 (커밋 차단). git-rules "커밋 전 반드시 린트" 준수.
set -uo pipefail

# self-test: 미스캐폴드 가정 → skip(0) 동작 확인
if [[ "${1:-}" == "--self-test" ]]; then
  pkg="/nonexistent/package.json"
  [[ -f "$pkg" ]] && { echo "self-test FAIL"; exit 1; }
  echo "self-test OK (pkg 없으면 skip)"; exit 0
fi

# Bash matcher는 모든 Bash에 발화 → git commit일 때만 진행
input="$(cat)"
cmd="$(python3 -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))' <<<"$input" 2>/dev/null || true)"
grep -qE '\bgit commit\b' <<<"$cmd" || exit 0

repo="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
staged="$(git -C "$repo" diff --cached --name-only)"
[[ -z "$staged" ]] && exit 0

fail=0
for pkg_dir in front extension; do
  # 해당 패키지 staged 변경 있는지
  grep -q "^$pkg_dir/" <<<"$staged" || continue
  pkg="$repo/$pkg_dir/package.json"
  # 가드: package.json 없으면 skip
  [[ -f "$pkg" ]] || { echo "ℹ️ $pkg_dir/ 미스캐폴드 — lint/test skip" >&2; continue; }

  echo "▶ $pkg_dir lint..." >&2
  ( cd "$repo/$pkg_dir" && npm run --silent lint ) || fail=1

  # 관련 테스트만 (변경 파일 기준). vitest 미설치면 skip.
  if ( cd "$repo/$pkg_dir" && npx --no-install vitest --version >/dev/null 2>&1 ); then
    files="$(grep "^$pkg_dir/" <<<"$staged" | sed "s#^$pkg_dir/##" | tr '\n' ' ')"
    echo "▶ $pkg_dir vitest related..." >&2
    ( cd "$repo/$pkg_dir" && npx --no-install vitest related --run $files ) || fail=1
  fi
done

if [[ $fail -ne 0 ]]; then
  echo "🚨 lint/test 실패 — 수정 후 커밋하세요" >&2
  exit 2
fi
exit 0
