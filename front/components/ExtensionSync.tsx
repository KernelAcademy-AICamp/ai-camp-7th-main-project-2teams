'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// Extension content script가 주입된 경우 세션 전달 (postMessage 브릿지)
// 웹앱 → content/index.js → background → popup 흐름
export function ExtensionSync() {
  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!data.session) return
        window.postMessage(
          { type: 'BOOKMARKER_SESSION_UPDATED', session: data.session },
          window.location.origin
        )
      })
  }, [])

  return null
}
