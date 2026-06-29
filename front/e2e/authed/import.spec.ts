import { test, expect } from '@playwright/test'
import path from 'node:path'

/**
 * 파일 임포트 플로우 — HTML 업로드 → 배치 태깅(generateTags)/임베딩(createEmbedding) → 저장.
 * OpenAI는 목(E2E_MOCK_OPENAI)이므로 결정적. setup이 직전 데이터를 비워 카운트 안정.
 */
test('HTML 북마크 파일 업로드 시 가져오기 완료', async ({ page }) => {
  await page.goto('/import')
  await expect(page.getByRole('heading', { name: '파일 업로드' })).toBeVisible()

  // sr-only file input에 픽스처 주입
  await page
    .getByLabel('HTML 파일 선택')
    .setInputFiles(path.join(__dirname, '../fixtures/bookmarks.html'))

  // 선택 파일 정보 노출 후 업로드
  await expect(page.getByText('bookmarks.html')).toBeVisible()
  await page.getByRole('button', { name: '업로드' }).click()

  // 결과 패널 — 픽스처 3건 가져오기 성공
  await expect(page.getByText('업로드 완료')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/가져오기 성공:\s*3건/)).toBeVisible()
})
