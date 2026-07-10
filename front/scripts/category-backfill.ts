// category-backfill 스킬 일회성 실행 스크립트. front/에서:
// node --experimental-strip-types --env-file=.env scripts/category-backfill.ts
import { createClient } from '@supabase/supabase-js'
import { generateTags } from '../lib/ai.ts'
import { normalizeTags, extractTopCategory } from '../lib/tag-alias.ts'
import { fetchMeta } from '../lib/fetchMeta.ts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
)

interface Row {
  id: string
  user_id: string
  title: string
  url: string
  tags: string[]
}

async function categoryIdFor(userId: string, name: string, cache: Map<string, string>): Promise<string> {
  const key = `${userId}:${name}`
  const cached = cache.get(key)
  if (cached) return cached

  const { data } = await supabase
    .from('categories')
    .select('id')
    .eq('user_id', userId)
    .eq('name', name)
    .maybeSingle()
  if (data) {
    cache.set(key, data.id)
    return data.id
  }

  const { data: inserted, error } = await supabase
    .from('categories')
    .insert({ user_id: userId, name })
    .select('id')
    .single()
  if (error) throw error
  cache.set(key, inserted.id)
  return inserted.id
}

async function processRow(row: Row, categoryCache: Map<string, string>): Promise<'reclassified' | 'skipped'> {
  let tags = await generateTags({ title: row.title, url: row.url })

  if (tags.length === 0) {
    const meta = await fetchMeta(row.url)
    if (meta.description || meta.title) {
      tags = await generateTags({
        title: meta.title || row.title,
        url: row.url,
        description: meta.description || undefined,
      })
    }
  }

  const { category, midTags } = extractTopCategory(normalizeTags(tags))
  if (!category) return 'skipped'

  const categoryId = await categoryIdFor(row.user_id, category, categoryCache)
  const { error } = await supabase
    .from('bookmarks')
    .update({ category_id: categoryId, tags: midTags })
    .eq('id', row.id)
  if (error) throw error

  console.log(`  [OK] ${row.title.slice(0, 40)} → ${category}${midTags.length ? '>' + midTags.join(',') : ''}`)
  return 'reclassified'
}

async function run() {
  const { data: rows, error } = await supabase
    .from('bookmarks')
    .select('id, user_id, title, url, tags')
    .is('category_id', null)
    .order('created_at')
  if (error) throw error

  const group1 = (rows as Row[]).filter((r) => (r.tags?.length ?? 0) === 0)
  const group2 = (rows as Row[]).filter((r) => (r.tags?.length ?? 0) > 0)
  console.log(`대상: 그룹1(0태그) ${group1.length}건, 그룹2(태그있음) ${group2.length}건`)

  const categoryCache = new Map<string, string>()
  const stats = { group1: { ok: 0, skip: 0 }, group2: { ok: 0, skip: 0 } }

  console.log('\n-- 그룹2 (우선) --')
  for (const row of group2) {
    const result = await processRow(row, categoryCache)
    stats.group2[result === 'reclassified' ? 'ok' : 'skip']++
  }

  console.log('\n-- 그룹1 --')
  for (const row of group1) {
    const result = await processRow(row, categoryCache)
    stats.group1[result === 'reclassified' ? 'ok' : 'skip']++
  }

  console.log('\n=== 결과 ===')
  console.log(`그룹1: ${stats.group1.ok}건 재분류 / ${stats.group1.skip}건 스킵 (총 ${group1.length})`)
  console.log(`그룹2: ${stats.group2.ok}건 재분류 / ${stats.group2.skip}건 스킵 (총 ${group2.length})`)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
