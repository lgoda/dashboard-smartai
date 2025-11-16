'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from './AuthProvider'
import { useEffect } from 'react'
import Link from 'next/link'

export function Navigation() {
  const { user, loading, signOut } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const isAuthPage = pathname === '/' || pathname === '/login' || pathname === '/signup'

  useEffect(() => {
    if (!loading) {
      if (user && isAuthPage) {
        router.push('/dashboard')
      } else if (!user && !isAuthPage) {
        router.push('/')
      }
    }
  }, [user, loading, isAuthPage, router])

  if (loading) {
    return null
  }

  if (!user || isAuthPage) {
    return null
  }

  return (
    <nav className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <Link href="/dashboard" className="flex items-center space-x-2">
              <img
                src="/logo-smartservice.png"
                alt="SmartService"
                className="h-8 w-auto"
              />
            </Link>

            <div className="hidden md:flex space-x-1">
              <Link
                href="/dashboard"
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  pathname === '/dashboard'
                    ? 'bg-pink-50 text-pink-600'
                    : 'text-slate-600 hover:bg-orange-50 hover:text-orange-600'
                }`}
              >
                Dashboard
              </Link>
              <Link
                href="/dashboard/leads"
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  pathname === '/dashboard/leads'
                    ? 'bg-pink-50 text-pink-600'
                    : 'text-slate-600 hover:bg-orange-50 hover:text-orange-600'
                }`}
              >
                Lead
              </Link>
              <Link
                href="/dashboard/conversations"
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  pathname === '/dashboard/conversations'
                    ? 'bg-pink-50 text-pink-600'
                    : 'text-slate-600 hover:bg-orange-50 hover:text-orange-600'
                }`}
              >
                Conversazioni
              </Link>
              <Link
                href="/dashboard/ai-calls"
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  pathname?.startsWith('/dashboard/ai-calls')
                    ? 'bg-pink-50 text-pink-600'
                    : 'text-slate-600 hover:bg-orange-50 hover:text-orange-600'
                }`}
              >
                Chiamate IA
              </Link>
              <Link
                href="/dashboard/settings"
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  pathname === '/dashboard/settings'
                    ? 'bg-pink-50 text-pink-600'
                    : 'text-slate-600 hover:bg-orange-50 hover:text-orange-600'
                }`}
              >
                Impostazioni
              </Link>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="hidden sm:block text-sm text-slate-600">
              {user.email}
            </div>
            <button
              onClick={signOut}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-pink-600 hover:bg-pink-50 rounded-lg transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
