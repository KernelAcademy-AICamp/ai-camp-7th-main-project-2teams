"use client";

import { useState } from "react";
import { useInterval } from "usehooks-ts";
import { cn } from "@/lib/utils";

// durationMs — 각 GIF 원본(Remotion) 재생 시간(ffprobe 실측). 루프당 정확히 이 길이만큼 재생되므로
// 다음 슬라이드로 넘어가는 시점을 "GIF 한 바퀴 다 보여준 뒤 +1초"로 맞추는 기준값.
// GIF 자체는 무한 루프(loop=0)로 인코딩 — 슬라이드 전환 주기가 이 시간보다 길어져도 정지 프레임으로 굳지 않음.
const SLIDES = [
  { key: "ext", label: "익스텐션", gif: "/demo/hero-ext.gif", alt: "익스텐션으로 현재 페이지를 즉시 저장하는 모습", durationMs: 5700 },
  {
    key: "add",
    label: "북마크 추가",
    gif: "/demo/hero-add.gif",
    alt: "URL을 저장하면 AI 태그가 자동으로 채워진 카드가 만들어지는 모습",
    durationMs: 10000,
  },
  {
    key: "search",
    label: "검색",
    gif: "/demo/hero-search.gif",
    alt: "검색창에 문장을 입력하면 AI가 관련 북마크만 필터링하는 모습",
    durationMs: 7200,
  },
] as const;

const HERO_WIDTH = 720;
const HERO_HEIGHT = 458;
const SLIDE_EXTRA_MS = 1000;

/**
 * 히어로 목업 슬라이드쇼 — 검색/추가/익스텐션 3개 실제 동작 GIF를 자동 순환 크로스페이드.
 * 카드 프레임(overflow-hidden)과 하단 점 인디케이터를 분리 — 인디케이터가 프레임에 잘리지 않게
 * outer는 overflow 없는 컨테이너, inner만 rounded+overflow-hidden (BookmarkCard 패턴과 동일 이유).
 */
export function HeroSlideshow() {
  const [index, setIndex] = useState(0);

  // delay가 index에 따라 바뀌면 usehooks-ts useInterval이 이전 타이머를 정리하고 새로 등록함
  // → 슬라이드가 바뀔 때마다 "그 GIF 길이 + 1초"를 기준으로 다시 카운트 시작
  useInterval(() => {
    setIndex((current) => (current + 1) % SLIDES.length);
  }, SLIDES[index].durationMs + SLIDE_EXTRA_MS);

  return (
    <div>
      <div
        className="relative overflow-hidden rounded-2xl border border-line shadow-[0_30px_60px_-24px_rgba(45,62,80,.28)]"
        style={{ aspectRatio: `${HERO_WIDTH} / ${HERO_HEIGHT}` }}
      >
        {SLIDES.map((slide, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- GIF는 next/image 최적화 시 애니메이션 소실
          <img
            key={slide.key}
            src={slide.gif}
            alt={slide.alt}
            width={HERO_WIDTH}
            height={HERO_HEIGHT}
            loading={i === 0 ? "eager" : "lazy"}
            fetchPriority={i === 0 ? "high" : "auto"}
            className={cn(
              "absolute inset-0 block h-full w-full object-cover transition-opacity duration-700 ease-out",
              i === index ? "opacity-100" : "opacity-0",
            )}
          />
        ))}
      </div>

      <div className="mt-3 flex items-center justify-center gap-1.5" role="tablist" aria-label="히어로 데모 화면 전환">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.key}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`${slide.label} 데모 보기`}
            onClick={() => setIndex(i)}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              i === index ? "w-5 bg-brand" : "w-1.5 bg-line hover:bg-brand/40",
            )}
          />
        ))}
      </div>
    </div>
  );
}
