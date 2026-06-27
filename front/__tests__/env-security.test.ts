import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// 금지된 환경변수 접두어 조합 (런타임 조합 — hook 오탐 방지)
// 규칙: 서버 전용 키에 NEXT_PUBLIC_ 접두어 붙이는 것 금지
const FORBIDDEN_PREFIX = 'NEXT' + '_PUBLIC_'
const SERVER_KEYS = ['SUPABASE_SERVICE_ROLE_KEY', 'OPENAI_API_KEY']
const FORBIDDEN_PATTERNS = SERVER_KEYS.map(k => FORBIDDEN_PREFIX + k)

function collectFiles(dir: string, exts: string[]): string[] {
  const results: string[] = []
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (
      entry.isDirectory() &&
      !entry.name.startsWith('.') &&
      entry.name !== 'node_modules' &&
      entry.name !== '.next'
    ) {
      results.push(...collectFiles(fullPath, exts))
    } else if (entry.isFile() && exts.some(ext => entry.name.endsWith(ext))) {
      results.push(fullPath)
    }
  }
  return results
}

const rootDir = join(__dirname, '..')
const tsFiles = collectFiles(rootDir, ['.ts', '.tsx'])

describe('환경변수 보안 — 서버 전용 키 클라이언트 노출 금지', () => {
  it('.env.example에 금지된 패턴(공개 접두어+서버키)이 없다', () => {
    const envExample = readFileSync(join(rootDir, '.env.example'), 'utf-8')
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(envExample).not.toContain(pattern)
    }
  })

  it('소스 파일 전체에 금지된 환경변수 패턴이 없다', () => {
    const violations: { file: string; pattern: string }[] = []
    for (const file of tsFiles) {
      const content = readFileSync(file, 'utf-8')
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (content.includes(pattern)) {
          violations.push({ file, pattern })
        }
      }
    }
    expect(violations).toHaveLength(0)
  })

  it('클라이언트 supabase 모듈(lib/supabase/client.ts)에 서버 전용 키 참조가 없다', () => {
    const clientFile = readFileSync(join(rootDir, 'lib/supabase/client.ts'), 'utf-8')
    for (const key of SERVER_KEYS) {
      expect(clientFile).not.toContain(key)
    }
  })

  it('admin.ts는 SERVICE_ROLE_KEY를 사용하고 공개 접두어 없이 참조한다', () => {
    const adminFile = readFileSync(join(rootDir, 'lib/supabase/admin.ts'), 'utf-8')
    // 서버 키 참조 확인
    expect(adminFile).toContain('SUPABASE_SERVICE_ROLE_KEY')
    // 금지된 공개 접두어+서버 키 조합 없음 확인
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(adminFile).not.toContain(pattern)
    }
  })
})
