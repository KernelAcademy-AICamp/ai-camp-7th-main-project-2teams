import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const manifest = JSON.parse(readFileSync(resolve(__dirname, '../manifest.json'), 'utf-8'))

describe('manifest.json', () => {
  it('manifest_version은 3', () => {
    expect(manifest.manifest_version).toBe(3)
  })

  it('permissions: activeTab·storage·scripting·tabs 포함', () => {
    // tabs: 로그인 탭 ID 추적(A19), 탭 URL/title 수집(A20) 용도
    expect(manifest.permissions).toEqual(
      expect.arrayContaining(['activeTab', 'storage', 'scripting', 'tabs'])
    )
    expect(manifest.permissions.length).toBe(4)
  })

  it('background service_worker 설정됨', () => {
    expect(manifest.background.service_worker).toBeDefined()
  })

  it('CSP script-src self만 허용', () => {
    expect(manifest.content_security_policy.extension_pages).toContain("script-src 'self'")
  })
})
