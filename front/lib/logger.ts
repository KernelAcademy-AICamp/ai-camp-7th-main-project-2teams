/**
 * 로그 마스킹 유틸 (A8)
 *
 * content(본문)는 OpenAI 처리 후 즉시 파기 대상 — 로그에 절대 포함하지 않는다.
 * 에러 추적 등 로그 출력 시 반드시 maskSensitive()를 경유해야 한다.
 *
 * OpenAI Zero Data Retention 주의사항:
 *   platform.openai.com > Settings > Data Controls 에서
 *   "Improve model for everyone" 비활성화 여부를 수동 확인한다.
 *   API 기본값: 학습 미사용(Zero Data Retention).
 */

// embedding도 API 응답 노출 금지 대상 — select 명시 컬럼으로 막지만 로그 경유 시도 이중 방어
const SENSITIVE_KEYS = ['content', 'embedding'] as const

type SensitiveKey = (typeof SENSITIVE_KEYS)[number]

/**
 * 객체에서 민감 키(content 등)를 제거한 새 객체를 반환한다.
 * 원본 객체는 변경하지 않는다.
 */
export function maskSensitive<T extends Record<string, unknown>>(
  obj: T,
): Omit<T, SensitiveKey> {
  const result = { ...obj }
  for (const key of SENSITIVE_KEYS) {
    delete (result as Record<string, unknown>)[key]
  }
  return result as Omit<T, SensitiveKey>
}
