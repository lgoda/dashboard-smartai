'use client'

import './globals.css'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabaseClient'
import { useRouter } from 'next/navigation'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    const getUser = async () => {
      const { data } = await supabase.auth.getUser()
      setUser(data?.user || null)
    }
    getUser()
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
          <div>
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
