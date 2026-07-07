"use client";

import { useEffect, useRef } from "react";

interface InfiniteScrollTriggerProps {
  onIntersect: () => void;
  disabled?: boolean;
}

// A62: 홈 목록(서버 페이지네이션)과 검색(클라이언트 슬라이스) 양쪽에서 재사용하는 공용 트리거.
// rootMargin: 200px — 바닥에 완전히 닿기 전에 미리 로드해 체감 지연을 줄인다.
export function InfiniteScrollTrigger({ onIntersect, disabled = false }: InfiniteScrollTriggerProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (disabled) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onIntersect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);

    return () => observer.disconnect();
  }, [onIntersect, disabled]);

  return <div ref={sentinelRef} aria-hidden="true" data-testid="infinite-scroll-trigger" />;
}
