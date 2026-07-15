"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// "사용법" 모달 전용 탭 — front/components/HeroSlideshow.tsx와 동일 3개 GIF 자산 재사용(웰컴 히어로에서
// 이미 다운로드됐다면 브라우저 캐시 히트). ServiceFeatures(웹/익스텐션 2트랙, 6개 기능 문구)와는 별개 —
// 실제 데모 영상이 있는 기능(검색/추가/익스텐션)만 1:1로 매칭, 가져오기·백업처럼 영상 없는 기능은
// 여기서 다루지 않는다(다른 화면의 ServiceFeatures가 계속 그 역할을 함).
const TABS = [
  {
    key: "ext",
    label: "익스텐션",
    title: "어디서든 한 번의 클릭",
    description: "Chrome 익스텐션으로 지금 보는 페이지를 즉시 저장합니다.",
    gif: "/demo/hero-ext.gif",
    alt: "익스텐션으로 현재 페이지를 즉시 저장하는 모습",
  },
  {
    key: "add",
    label: "북마크 추가",
    title: "URL 하나로 저장 끝",
    description: "링크만 붙여넣으면 제목·태그·카테고리가 자동으로 채워진 카드가 완성됩니다.",
    gif: "/demo/hero-add.gif",
    alt: "URL을 저장하면 AI 태그가 자동으로 채워진 카드가 만들어지는 모습",
  },
  {
    key: "search",
    label: "검색",
    title: "문장으로 검색하세요",
    description: '"리액트 훅 정리한 글"처럼 입력하면 AI가 문장을 이해해 관련 북마크만 골라줍니다.',
    gif: "/demo/hero-search.gif",
    alt: "검색창에 문장을 입력하면 AI가 관련 결과만 필터링하는 모습",
  },
] as const;

const GIF_WIDTH = 720;
const GIF_HEIGHT = 458;

export function UsageGuideTabs() {
  const [activeKey, setActiveKey] = useState<(typeof TABS)[number]["key"]>(TABS[0].key);
  const active = TABS.find((tab) => tab.key === activeKey) ?? TABS[0];

  return (
    <div>
      <div className="mb-4 flex w-full gap-1 rounded-full bg-surface p-1" role="tablist" aria-label="사용법 데모 선택">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={tab.key === activeKey}
            onClick={() => setActiveKey(tab.key)}
            className={cn(
              "flex-1 cursor-pointer rounded-full px-4 py-2 text-sm font-semibold transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand focus-visible:outline-offset-2",
              tab.key === activeKey ? "bg-white text-ink shadow-sm" : "text-text-secondary hover:text-text-primary",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* key={active.key} — 탭 전환마다 캡션이 다시 순차 리빌되게(globals.css animate-rise) */}
      <div key={active.key}>
        {/* height 기준으로 크기 결정(width: auto) — 뷰포트가 짧아도 모달 전체가 화면 안에 들어오게.
            max-w-full은 반대로 좁은 화면에서 옆으로 넘치지 않게(가로 기준 보정) */}
        <div
          className="relative mx-auto max-w-full overflow-hidden rounded-2xl border border-line shadow-[0_20px_44px_-24px_rgba(45,62,80,.35)]"
          style={{
            aspectRatio: `${GIF_WIDTH} / ${GIF_HEIGHT}`,
            // 아래 캡션과의 갭(mt-8=32px)을 mt-4(16px)에서 늘린 만큼(16px) 그대로 빼서
            // 다이얼로그 전체 높이는 그대로 유지 — 스크롤 재발 방지
            height: "min(calc(42vh - 16px), 404px)",
            width: "auto",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- GIF는 next/image 최적화 시 애니메이션 소실 */}
          <img
            src={active.gif}
            alt={active.alt}
            width={GIF_WIDTH}
            height={GIF_HEIGHT}
            loading="lazy"
            className="block h-full w-full object-cover"
          />
        </div>

        <div className="animate-rise mt-8 opacity-0">
          <h3 className="mb-1 text-base font-bold text-ink">{active.title}</h3>
          <p className="text-sm text-text-secondary">{active.description}</p>

          {active.key === "ext" && (
            // Chrome 웹스토어 미게시 — ServiceFeatures.tsx와 동일 placeholder href 패턴
            <a
              href="#"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block rounded-md bg-brand px-4 py-2 text-sm text-white hover:bg-brand-strong"
            >
              Chrome 익스텐션 설치 (준비 중)
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
