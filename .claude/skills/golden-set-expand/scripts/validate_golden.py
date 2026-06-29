#!/usr/bin/env python3
"""골든셋(tag-golden.json) 확장 검증.

골든셋은 회귀 게이트의 정답 데이터다. 두 가지가 망가지면 평가가 거짓말을 한다:
1) Few-shot 예제와 겹치면(leak) F1이 부풀려져 실제 정확도를 가린다.
2) gold 라벨이 분류 정책(대→중→소, 단일 대분류)을 어기면 옳은 모델 출력이 오답 처리된다.

이 스크립트는 그 둘 + 중복 + vocab을 코드로 막는다. 하드 위반은 exit 1.

사용:
  python validate_golden.py [--golden front/eval/tag-golden.json] [--ai front/lib/ai.ts] [--alias front/lib/tag-alias.ts]
"""
import argparse
import json
import re
import sys
from collections import Counter
from urllib.parse import urlparse


def load_top_categories(alias_path: str) -> set[str]:
    """tag-alias.ts의 TOP_CATEGORIES를 단일 출처로 파싱(하드코딩 드리프트 방지)."""
    text = open(alias_path, encoding="utf-8").read()
    m = re.search(r"TOP_CATEGORIES\s*=\s*new Set\(\[([^\]]*)\]\)", text)
    if not m:
        sys.exit("TOP_CATEGORIES를 tag-alias.ts에서 찾지 못함")
    return set(re.findall(r"'([^']+)'", m.group(1)))


def load_midtags(taxonomy_path: str) -> set[str]:
    """tag-taxonomy.md 분류 트리에서 중분류명 집합 파싱.

    중분류(LLM·논문·전자기기·공식문서 등)는 여러 항목이 공유하는 정규 vocab이라
    재사용해도 leak 아님. 고유명사 소분류와 구분하기 위해 필요."""
    text = open(taxonomy_path, encoding="utf-8").read()
    mids: set[str] = set()
    in_tree = False
    for line in text.splitlines():
        if line.startswith("## 분류 트리"):
            in_tree = True
            continue
        if in_tree and line.startswith("## "):
            break  # 트리 섹션 종료
        # 표 행: | 중분류 | 소분류 예시 |  — 헤더·구분선 제외
        m = re.match(r"\|\s*([^|]+?)\s*\|", line)
        if in_tree and m:
            cell = m.group(1).strip()
            if cell and cell != "중분류" and not set(cell) <= {"-", " "}:
                mids.add(cell)
    return mids


def parse_few_shot(ai_path: str, midtags: set[str]) -> tuple[set[str], set[str]]:
    """SYSTEM_PROMPT few-shot 예제에서 도메인·고유명사 소분류를 추출.

    leak 핵심 신호 = 고유명사 소분류(Reddit·Nike·발로란트·Storybook). 같은 항목을
    예제이자 정답으로 쓰면 held-out이 무효(F1 부풀림). 중분류 vocab은 제외."""
    text = open(ai_path, encoding="utf-8").read()
    domains: set[str] = set()
    proper_subtags: set[str] = set()
    for line in text.splitlines():
        if not line.lstrip().startswith("제목:"):
            continue
        url_m = re.search(r"URL:\s*([^\s/]+)", line)
        if url_m:
            domains.add(_root_domain(url_m.group(1)))
        tags = re.findall(r'"tag":\s*"([^"]+)"', line)
        # 대분류(첫 태그)·중분류 vocab 제외 → 고유명사 소분류만 leak 대상
        for t in tags[1:]:
            if t not in midtags:
                proper_subtags.add(t)
    return domains, proper_subtags


def _root_domain(host_or_url: str) -> str:
    host = urlparse(host_or_url if "//" in host_or_url else "//" + host_or_url).netloc or host_or_url
    host = host.lower().lstrip("www.")
    parts = host.split(".")
    return ".".join(parts[-2:]) if len(parts) >= 2 else host


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--golden", default="front/eval/tag-golden.json")
    ap.add_argument("--ai", default="front/lib/ai.ts")
    ap.add_argument("--alias", default="front/lib/tag-alias.ts")
    ap.add_argument("--taxonomy", default="docs/specs/tag-taxonomy.md")
    args = ap.parse_args()

    try:
        golden = json.load(open(args.golden, encoding="utf-8"))
    except json.JSONDecodeError as e:
        print(f"❌ JSON 파싱 실패: {e}")
        return 1

    top = load_top_categories(args.alias)
    midtags = load_midtags(args.taxonomy)
    fs_domains, fs_subtags = parse_few_shot(args.ai, midtags)

    errors: list[str] = []
    warnings: list[str] = []
    seen_urls: set[str] = set()
    dist: Counter[str] = Counter()

    for i, item in enumerate(golden):
        tag = f"[{i}] {item.get('url', '?')}"
        url = item.get("url", "")
        gold = item.get("gold", [])

        # 1. URL 중복
        if url in seen_urls:
            errors.append(f"{tag}: URL 중복")
        seen_urls.add(url)

        # 2. Few-shot leak — 고유명사 소분류 재사용은 하드 위반(held-out 무효).
        leaked = set(gold) & fs_subtags
        if leaked:
            errors.append(f"{tag}: few-shot 고유명사 소분류 {leaked} 재사용 → leak")
        # 도메인 공유는 경고만 — arxiv·huggingface 등 대형 플랫폼은 다른 콘텐츠면 held-out 유효.
        if url and _root_domain(url) in fs_domains:
            warnings.append(f"{tag}: few-shot와 같은 도메인({_root_domain(url)}) — 다른 콘텐츠인지 확인")

        # 3. 대분류 정책: 빈 태그 허용, 비면 gold[0]∈TOP_CATEGORIES, 대분류 1개만
        if gold:
            if gold[0] not in top:
                errors.append(f"{tag}: gold[0]='{gold[0]}'가 대분류 아님 (TOP_CATEGORIES)")
            extra_top = [t for t in gold[1:] if t in top]
            if extra_top:
                errors.append(f"{tag}: 대분류 2개 이상 {[gold[0]] + extra_top} (단일 대분류 정책 위반)")
            # 중분류(gold[1])는 taxonomy vocab이어야 채점이 공정 — 신규 표면형(패션·컬러)은 경고.
            if len(gold) >= 2 and gold[1] not in midtags:
                warnings.append(f"{tag}: 중분류 '{gold[1]}'가 taxonomy vocab 아님 — 트리에 추가하거나 기존 중분류 사용")
            dist[gold[0]] += 1
        else:
            dist["(0태그)"] += 1

        # 4. vocab — 빈 문자열/공백 태그
        for t in gold:
            if not t.strip():
                errors.append(f"{tag}: 빈 문자열 태그")

    # 분포 리포트 — 편중 경고
    print("=== 대분류 분포 ===")
    for cat, n in dist.most_common():
        print(f"  {cat}: {n}")
    covered = {c for c in top if dist.get(c)}
    missing = top - covered
    if missing:
        warnings.append(f"미커버 대분류: {sorted(missing)}")
    print(f"\n총 {len(golden)}개, 0태그 {dist.get('(0태그)', 0)}개")

    if warnings:
        print("\n⚠️  경고:")
        for w in warnings:
            print(f"  - {w}")
    if errors:
        print(f"\n❌ 하드 위반 {len(errors)}건:")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("\n✅ 검증 통과 (중복·leak·대분류 정책 이상 없음)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
