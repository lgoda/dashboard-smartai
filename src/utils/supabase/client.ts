'use client'

import { createBrowserClient } from '@supabase/ssr'

export const createClient = () => {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          if (typeof document === 'undefined') return undefined
          return document.cookie
            .split('; ')
            .find(row => row.startsWith(`${name}=`))
            ?.split('=')[1]
        },
        set(name: string, value: string, options: any) {
          if (typeof document === 'undefined') return

          let cookie = `${name}=${value}`

          if (options?.maxAge) {
            cookie += `; Max-Age=${options.maxAge}`
          }
          if (options?.path) {
            cookie += `; Path=${options.path}`
          } else {
            cookie += '; Path=/'
          }

          cookie += '; SameSite=None; Secure'

          document.cookie = cookie
        },
        remove(name: string, options: any) {
          if (typeof document === 'undefined') return
          document.cookie = `${name}=; Path=${options?.path || '/'}; Max-Age=0; SameSite=None; Secure`
        },
      },
    }
  )
}