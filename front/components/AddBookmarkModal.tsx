"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Globe } from "lucide-react";
import { useDebounceValue } from "usehooks-ts";
import { useAddBookmark } from "@/hooks/useAddBookmark";
import { Favicon } from "@/components/Favicon";

function isValidUrl(value: string) {
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const host = u.hostname;
    // 공백 포함·빈 호스트 거부 (new URL이 "https://not a valid url" 등을 관대하게 파싱하는 문제 차단)
    if (!host || /\s/.test(host)) return false;
    if (host === "localhost") return true;
    // 점 포함 도메인(라벨.라벨) 또는 IP만 허용
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host);
  } catch {
    return false;
  }
}

function extractTitle(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** http/https 보정 — 프로토콜 없으면 https 부여 */
function normalizeProtocol(value: string) {
  return /^https?:\/\//.test(value) ? value : `https://${value}`;
}

/**
 * 저장 실패 에러 메시지 스타일 분기 — 테스트 가능하도록 export. (A59)
 * 중복 북마크(duplicate: true)는 에러가 아닌 안내 톤, 그 외는 기존 destructive 톤 유지.
 */
export function getErrorMessageClassName(error: unknown): string {
  const isDuplicate = Boolean(
    error &&
      typeof error === "object" &&
      "duplicate" in error &&
      (error as { duplicate?: boolean }).duplicate === true,
  );
  return isDuplicate ? "text-amber-600 dark:text-amber-400" : "text-destructive";
}

interface AddBookmarkModalProps {
  /** 트리거 버튼 클래스 오버라이드 — 상단바(흰 버튼)와 빈 상태(그라디언트) 컨텍스트 분리 */
  triggerClassName?: string;
}

export function AddBookmarkModal({ triggerClassName }: AddBookmarkModalProps = {}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  // 검증 완료된 메타데이터 — 현재 입력 URL과 일치할 때만 완성본으로 사용
  const [meta, setMeta] = useState<{ url: string; title: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // 검증 요청 순번 — 늦게 도착한 이전 요청 결과 무시(레이스 방지)
  const reqIdRef = useRef(0);

  const { mutate, isPending, isSuccess, error, reset } = useAddBookmark();

  const handleClose = useCallback(() => {
    setOpen(false);
    setUrl("");
    setUrlError("");
    setMeta(null);
    reqIdRef.current++;
    reset();
  }, [reset]);

  // 모달 열릴 때 인풋 포커스
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Escape 키로 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, handleClose]);

  // 입력 URL 파생 — 미리보기 + 제출 검증 공용
  const trimmed = url.trim();
  const withProtocol = trimmed ? normalizeProtocol(trimmed) : "";
  const isValidInput = withProtocol !== "" && isValidUrl(withProtocol);

  // 미리보기 표시 상태 (파생) — 모달 내내 항상 노출
  // - 유효 URL 아님 → placeholder
  // - 검증 완료 메타가 현재 URL과 일치 → 완성본
  // - 그 외(검증 중) → 스켈레톤
  const previewDone = isValidInput && meta !== null && meta.url === withProtocol;

  // 라이브 검증 — 유효 URL을 디바운스 후 서버 메타데이터 조회
  const [debouncedUrl] = useDebounceValue(isValidInput ? withProtocol : "", 400);

  useEffect(() => {
    if (!debouncedUrl) return;
    const id = ++reqIdRef.current;
    fetch(`/api/bookmarks/preview?url=${encodeURIComponent(debouncedUrl)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { title?: string }) => {
        if (id !== reqIdRef.current) return;
        setMeta({ url: debouncedUrl, title: (d.title ?? "").trim() || extractTitle(debouncedUrl) });
      })
      .catch(() => {
        if (id !== reqIdRef.current) return;
        // 조회 실패해도 유효 URL — 도메인으로 폴백 표시
        setMeta({ url: debouncedUrl, title: extractTitle(debouncedUrl) });
      });
  }, [debouncedUrl]);

  const handleChange = (value: string) => {
    setUrl(value);
    setUrlError("");
  };

  // focus out — 형식 오류일 때만 에러 노출 (타이핑 중 잔소리 방지)
  const handleBlur = () => {
    if (trimmed && !isValidInput) setUrlError("올바른 URL 형식이 아닙니다.");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed) {
      setUrlError("URL을 입력해주세요.");
      return;
    }
    if (!isValidInput) {
      setUrlError("올바른 URL 형식이 아닙니다.");
      return;
    }
    setUrlError("");
    // 검증 완료된 제목 재사용, 없으면 도메인
    const title = previewDone ? meta.title : extractTitle(withProtocol);
    mutate(
      { url: withProtocol, title },
      {
        onSuccess: () => {
          setUrl("");
          setMeta(null);
        },
      },
    );
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          triggerClassName ??
          "gradient-brand rounded-lg px-3 py-1.5 text-sm font-medium text-white shadow-[0_10px_20px_-6px_rgba(74,144,226,.5)] transition-transform hover:-translate-y-px"
        }
      >
        + 북마크 추가
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && handleClose()}
          role="dialog"
          aria-modal="true"
          aria-label="북마크 추가"
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-[0_20px_40px_-12px_rgba(45,62,80,.25)]">
            <div className="p-6">
              <div className="mb-5 flex items-center justify-between">
                <h2 className="text-base font-semibold text-text-primary">북마크 추가</h2>
                <button
                  onClick={handleClose}
                  aria-label="닫기"
                  className="text-text-secondary hover:text-text-primary text-xl leading-none"
                >
                  ✕
                </button>
              </div>

              {isSuccess ? (
                <div className="flex flex-col items-center gap-4 py-4 text-center">
                  <p className="text-sm text-text-primary">
                    북마크가 저장됐습니다. AI가 자동으로 태그를 생성했습니다.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        reset();
                        setUrl("");
                      }}
                      className="rounded-lg border border-line px-4 py-2 text-sm text-text-primary hover:bg-slate-50"
                    >
                      계속 추가
                    </button>
                    <button
                      onClick={handleClose}
                      className="gradient-brand rounded-lg px-4 py-2 text-sm text-white transition-transform hover:-translate-y-px"
                    >
                      닫기
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div>
                    <label
                      hidden
                      htmlFor="bookmark-url"
                      className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      URL 입력 필드
                    </label>
                    <div className="relative">
                      <Globe size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-brand" />
                      <input
                        ref={inputRef}
                        id="bookmark-url"
                        type="text"
                        value={url}
                        onChange={(e) => handleChange(e.target.value)}
                        onBlur={handleBlur}
                        placeholder="https://example.com"
                        disabled={isPending}
                        className={[
                          "w-full rounded-lg border py-2.5 pl-9 pr-3 text-sm text-text-primary outline-none transition-all",
                          "placeholder:text-text-secondary",
                          urlError
                            ? "border-destructive focus:border-destructive"
                            : "border-line focus:border-brand focus:ring-2 focus:ring-brand/20",
                        ].join(" ")}
                      />
                    </div>
                    {urlError && <p className="mt-1.5 text-xs text-destructive">{urlError}</p>}
                  </div>

                  {/* URL 미리보기 — 항상 노출: placeholder → 검증 중 스켈레톤 → 완성본 (Design.md Modal) */}
                  <div className="rounded-lg border border-dashed border-brand/30 bg-accent p-4">
                    <p className="mb-2.5 text-sm text-text-secondary">
                      {previewDone ? "URL 미리보기" : isValidInput ? "URL 검증 중..." : "URL 미리보기"}
                    </p>
                    {!isValidInput ? (
                      // placeholder — 유효 URL 입력 전
                      <div className="flex items-center gap-3">
                        <span className="h-9 w-9 shrink-0 rounded-lg bg-slate-200" />
                        <p className="text-sm text-text-secondary">
                          URL을 입력하면 미리보기가 표시됩니다.
                        </p>
                      </div>
                    ) : previewDone ? (
                      // 완성본
                      <div className="flex items-center gap-3">
                        <Favicon url={withProtocol} key={withProtocol} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-text-primary">{meta.title}</p>
                          <p className="truncate font-mono text-xs text-text-secondary">{withProtocol}</p>
                        </div>
                      </div>
                    ) : (
                      // 검증 중 스켈레톤
                      <div className="flex items-center gap-3">
                        <span className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-brand/20" />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <span className="block h-3.5 w-2/3 animate-pulse rounded bg-brand/20" />
                          <span className="block h-3 w-1/2 animate-pulse rounded bg-brand/10" />
                        </div>
                      </div>
                    )}
                  </div>

                  {error && (
                    <p className={`text-xs ${getErrorMessageClassName(error)}`}>
                      {(error as Error).message}
                    </p>
                  )}

                  <div className="mt-1 flex gap-3">
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={isPending}
                      className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-slate-50"
                    >
                      닫기
                    </button>
                    <button
                      type="submit"
                      disabled={isPending}
                      className="gradient-brand flex flex-1 items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_20px_-6px_rgba(74,144,226,.5)] transition-transform hover:-translate-y-px disabled:opacity-60"
                    >
                      {isPending ? (
                        <span className="flex items-center gap-1.5">
                          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                          </svg>
                          저장 중
                        </span>
                      ) : (
                        "+ 추가 버튼"
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
