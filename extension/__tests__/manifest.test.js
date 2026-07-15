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

  it('permissions: activeTab·storage·scripting·notifications만 존재 (tabs 제거됨)', () => {
    // activeTab으로 커버: 사용자 액션 시 현재 탭 url/title 접근 가능
    // notifications: 단축키 저장 성공 시 태그 미리보기 알림(A22)
    expect(manifest.permissions).toEqual(
      expect.arrayContaining(['activeTab', 'storage', 'scripting', 'notifications'])
    )
    expect(manifest.permissions).not.toContain('tabs')
    expect(manifest.permissions.length).toBe(4)
  })

  it('background service_worker 설정됨', () => {
    expect(manifest.background.service_worker).toBeDefined()
  })

  it('CSP script-src self만 허용', () => {
    expect(manifest.content_security_policy.extension_pages).toContain("script-src 'self'")
  })
})
