"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useUpdateBookmark, type UpdateBookmarkFields } from "@/hooks/useUpdateBookmark";
import { TOP_CATEGORIES } from "@/lib/tag-alias";
import type { Bookmark } from "@/hooks/useBookmarks";

/** 카테고리 select 옵션 — 고정 13개, 가나다순 */
const CATEGORY_OPTIONS = Array.from(TOP_CATEGORIES).sort((a, b) => a.localeCompare(b, "ko"));

const MAX_TAGS = 10;
const MAX_DESCRIPTION_LENGTH = 2000;

export interface EditFormState {
  tags: string[];
  /** 현재 소속 카테고리로 프리필. '' = 미분류(카테고리 없음) */
  category: string;
  description: string;
}

/** bookmark → 폼 초기 상태 변환 — 테스트 가능하도록 export */
export function toFormState(bookmark: Pick<Bookmark, "tags" | "description" | "category">): EditFormState {
  return {
    tags: [...bookmark.tags],
    category: bookmark.category ?? "",
    description: bookmark.description ?? "",
  };
}

/** 중복·빈 값·최대 개수 방어 후 태그 추가 — 테스트 가능하도록 export */
export function addTag(tags: string[], input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed || tags.includes(trimmed) || tags.length >= MAX_TAGS) return tags;
  return [...tags, trimmed];
}

/** 태그 제거 — 테스트 가능하도록 export */
export function removeTag(tags: string[], tag: string): string[] {
  return tags.filter((t) => t !== tag);
}

/**
 * Enter/,로 태그 커밋할지 판단 — 테스트 가능하도록 export.
 * 한글 등 IME 조합 확정 Enter는 keydown이 두 번 발생(조합 확정 + 실제 Enter)하는데,
 * 조합 확정 이벤트(isComposing=true)까지 커밋 처리하면 태그가 중복 추가됨.
 */
export function isTagCommitKey(key: string, isComposing: boolean): boolean {
  if (isComposing) return false;
  return key === "Enter" || key === ",";
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * 폼 상태와 원본 북마크를 비교해 실제로 변경된 필드만 담은 PATCH payload를 만든다.
 * 아무것도 안 바뀌었으면 null — 불필요한 API 호출·400(빈 body) 방지.
 * 테스트 가능하도록 export.
 */
export function buildUpdatePayload(
  bookmark: Pick<Bookmark, "tags" | "description" | "category">,
  form: EditFormState,
): UpdateBookmarkFields | null {
  const payload: UpdateBookmarkFields = {};

  if (!arraysEqual(form.tags, bookmark.tags)) payload.tags = form.tags;
  // 미분류(빈 값) 선택 시 null 전송(카테고리 해제) — 실제로 값이 바뀐 경우만 전송
  const currentCategory = bookmark.category ?? "";
  if (form.category !== currentCategory) payload.category = form.category === "" ? null : form.category;

  const currentDescription = bookmark.description ?? "";
  if (form.description !== currentDescription) {
    payload.description = form.description === "" ? null : form.description;
  }

  return Object.keys(payload).length > 0 ? payload : null;
}

interface EditBookmarkModalProps {
  bookmark: Bookmark;
  onClose: () => void;
}

export function EditBookmarkModal({ bookmark, onClose }: EditBookmarkModalProps) {
  const [form, setForm] = useState<EditFormState>(() => toFormState(bookmark));
  const [tagInput, setTagInput] = useState("");
  const { mutate, isPending, error } = useUpdateBookmark();

  // Escape 키로 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleAddTag = () => {
    const next = addTag(form.tags, tagInput);
    if (next !== form.tags) {
      setForm({ ...form, tags: next });
      setTagInput("");
    }
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isTagCommitKey(e.key, e.nativeEvent.isComposing)) return;
    e.preventDefault();
    handleAddTag();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = buildUpdatePayload(bookmark, form);
    if (!payload) {
      onClose();
      return;
    }
    mutate({ id: bookmark.id, ...payload }, { onSuccess: onClose });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => !isPending && e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="북마크 수정"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-[0_20px_40px_-12px_rgba(45,62,80,.25)] dark:bg-gray-900">
        <div className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-semibold text-text-primary">북마크 수정</h2>
            <button
              onClick={onClose}
              aria-label="닫기"
              className="cursor-pointer text-text-secondary hover:text-text-primary text-xl leading-none"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <p className="line-clamp-1 text-sm font-medium text-text-primary">{bookmark.title}</p>

            {/* 태그 편집 */}
            <div>
              <label htmlFor="edit-tag-input" className="mb-1.5 block text-sm font-medium text-text-secondary">
                태그
              </label>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {form.tags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-brand-strong"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, tags: removeTag(form.tags, tag) })}
                      aria-label={`${tag} 태그 삭제`}
                      className="cursor-pointer hover:text-red-600"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  id="edit-tag-input"
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  placeholder="태그 입력 후 Enter"
                  disabled={isPending || form.tags.length >= MAX_TAGS}
                  className="flex-1 rounded-lg border border-line px-3 py-2 text-sm text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  disabled={isPending || form.tags.length >= MAX_TAGS}
                  className="cursor-pointer rounded-lg border border-line px-3 py-2 text-sm text-text-primary hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  추가
                </button>
              </div>
            </div>

            {/* 카테고리 선택 */}
            <div>
              <label htmlFor="edit-category" className="mb-1.5 block text-sm font-medium text-text-secondary">
                카테고리
              </label>
              <select
                id="edit-category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                disabled={isPending}
                className="w-full rounded-lg border border-line px-3 py-2 text-sm text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              >
                <option value="">미분류</option>
                {CATEGORY_OPTIONS.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* 설명 메모 */}
            <div>
              <label htmlFor="edit-description" className="mb-1.5 block text-sm font-medium text-text-secondary">
                설명
              </label>
              <textarea
                id="edit-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                maxLength={MAX_DESCRIPTION_LENGTH}
                rows={3}
                disabled={isPending}
                placeholder={`이 북마크에 대한 메모를 남겨보세요.\n나중에 검색할 때도 유용해요.`}
                className="w-full resize-none rounded-lg border border-line px-3 py-2 text-sm text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </div>

            {error && <p className="text-xs text-destructive">{(error as Error).message}</p>}

            <div className="mt-1 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="flex-1 cursor-pointer rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-text-primary hover:bg-slate-50 disabled:cursor-not-allowed"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="gradient-brand flex-1 cursor-pointer rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-[0_10px_20px_-6px_rgba(74,144,226,.5)] transition-transform hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isPending ? "저장 중..." : "저장"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
