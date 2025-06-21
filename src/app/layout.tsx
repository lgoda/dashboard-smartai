'use client'

import './globals.css'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    const fetchUser = async () => {
      const { data, error } = await supabase.auth.getSession()
      if (data?.session?.user) {
        setUser(data.session.user)
      } else {
        console.log('Nessun utente trovato o errore sessione:', error)
      }
    }

    fetchUser()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    router.push('/')
  }

  return (
    <html lang="en">
      <body>
        <nav className="flex justify-between items-center bg-gray-800 text-white px-6 py-3">
          <div className="text-xl font-bold">
            <Link href="/">🧠 ChatBot Admin</Link>
          </div>
          <div className="flex items-center space-x-4">
            {user && (
              <span className="text-sm text-gray-300">Ciao, {user.email}</span>
            )}
            {user ? (
              <button onClick={handleLogout} className="hover:underline">
                Logout
              </button>
            ) : (
              <Link href="/" className="hover:underline">
                Login
              </Link>
            )}
          </div>
        </nav>
        <main className="p-6">{children}</main>
      </body>
    </html>
  )
}
