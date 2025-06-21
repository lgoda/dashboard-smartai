'use client'

import './globals.css'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter, usePathname } from 'next/navigation'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

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

  const isLoginPage = pathname === '/'

  return (
    <html lang="it">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-slate-50">
        {!isLoginPage && (
          <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center h-16">
                {/* Logo */}
                <div className="flex items-center">
                  <Link href="/dashboard" className="flex items-center space-x-3 group">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform">
                      <span className="text-white font-bold text-sm">🧠</span>
                    </div>
                    <span className="text-xl font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
                      SmartBot Dashboard
                    </span>
                  </Link>
                </div>

                {/* Desktop Navigation */}
                <div className="hidden md:flex items-center space-x-1">
                  <Link
                    href="/dashboard"
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      pathname === '/dashboard'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    📊 Dashboard
                  </Link>
                  <Link
                    href="/dashboard/conversations"
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      pathname === '/dashboard/conversations'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    💬 Conversazioni
                  </Link>
                  <Link
                    href="/dashboard/leads"
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      pathname === '/dashboard/leads'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    📇 Lead
                  </Link>
                </div>

                {/* User Menu */}
                <div className="flex items-center space-x-4">
                  {user && (
                    <div className="hidden sm:flex items-center space-x-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-slate-400 to-slate-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-medium">
                          {user.email?.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="text-sm">
                        <p className="text-slate-900 font-medium">Benvenuto</p>
                        <p className="text-slate-500 truncate max-w-32">{user.email}</p>
                      </div>
                    </div>
                  )}
                  
                  {user ? (
                    <button
                      onClick={handleLogout}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-200"
                    >
                      Logout
                    </button>
                  ) : (
                    <Link
                      href="/"
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                      Login
                    </Link>
                  )}

                  {/* Mobile menu button */}
                  <button
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                    className="md:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Mobile Navigation */}
              {isMenuOpen && (
                <div className="md:hidden py-4 border-t border-slate-200">
                  <div className="space-y-2">
                    <Link
                      href="/dashboard"
                      className={`block px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        pathname === '/dashboard'
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                      onClick={() => setIsMenuOpen(false)}
                    >
                      📊 Dashboard
                    </Link>
                    <Link
                      href="/dashboard/conversations"
                      className={`block px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        pathname === '/dashboard/conversations'
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                      onClick={() => setIsMenuOpen(false)}
                    >
                      💬 Conversazioni
                    </Link>
                    <Link
                      href="/dashboard/leads"
                      className={`block px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        pathname === '/dashboard/leads'
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                      onClick={() => setIsMenuOpen(false)}
                    >
                      📇 Lead
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </nav>
        )}
        
        <main className={isLoginPage ? '' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'}>
          {children}
        </main>
      </body>
    </html>
  )
}