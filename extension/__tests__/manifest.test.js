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

  it('permissions 3개만 (activeTab·storage·scripting)', () => {
    expect(manifest.permissions).toEqual(
      expect.arrayContaining(['activeTab', 'storage', 'scripting'])
    )
    expect(manifest.permissions.length).toBe(3)
  })

  it('background service_worker 설정됨', () => {
    expect(manifest.background.service_worker).toBeDefined()
  })

  it('CSP script-src self만 허용', () => {
    expect(manifest.content_security_policy.extension_pages).toContain("script-src 'self'")
  })
})
