import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

interface UserState {
  user: User | null
  loaded: boolean
  fetchUser: () => Promise<User | null>
}

// 마운트마다 여러 컴포넌트가 fetchUser를 호출해도 실제 getUser() 네트워크 호출은 1회만 나가도록
// 진행 중인 요청을 공유(inflight)하고, 이미 로드된 경우 캐시된 값을 즉시 반환한다.
let inflight: Promise<User | null> | null = null

export const useUserStore = create<UserState>((set, get) => ({
  user: null,
  loaded: false,
  fetchUser: async () => {
    if (get().loaded) return get().user
    if (inflight) return inflight

    inflight = createClient()
      .auth.getUser()
      .then(({ data: { user } }) => {
        set({ user, loaded: true })
        return user
      })
      .finally(() => {
        inflight = null
      })

    return inflight
  },
}))
