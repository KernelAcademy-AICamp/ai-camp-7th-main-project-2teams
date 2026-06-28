import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js'

// chrome.storage.local → Supabase SupportedStorage 어댑터
export const chromeStorage = {
  getItem: (key) =>
    new Promise((resolve) =>
      chrome.storage.local.get(key, (result) => resolve(result[key] ?? null))
    ),
  setItem: (key, value) =>
    new Promise((resolve) =>
      chrome.storage.local.set({ [key]: value }, resolve)
    ),
  removeItem: (key) =>
    new Promise((resolve) =>
      chrome.storage.local.remove(key, resolve)
    ),
}

// Background SW에서 세션 단일 관리 — autoRefreshToken으로 자동 갱신
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: chromeStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
