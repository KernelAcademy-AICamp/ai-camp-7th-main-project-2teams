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

  it('permissions: activeTab·storage·scripting만 존재 (tabs 제거됨)', () => {
    // activeTab으로 커버: 사용자 액션 시 현재 탭 url/title 접근 가능
    expect(manifest.permissions).toEqual(
      expect.arrayContaining(['activeTab', 'storage', 'scripting'])
    )
    expect(manifest.permissions).not.toContain('tabs')
    expect(manifest.permissions.length).toBe(3)
  })

  it('background service_worker 설정됨', () => {
    expect(manifest.background.service_worker).toBeDefined()
  })

  it('CSP script-src self만 허용', () => {
    expect(manifest.content_security_policy.extension_pages).toContain("script-src 'self'")
  })
})
