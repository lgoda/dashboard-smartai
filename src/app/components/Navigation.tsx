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
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">S</span>
              </div>
              <span className="text-xl font-bold text-slate-900">SmartAI</span>
            </Link>

            <div className="hidden md:flex space-x-1">
              <Link
                href="/dashboard"
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  pathname === '/dashboard'
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                Dashboard
              </Link>
              <Link
                href="/dashboard/leads"
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  pathname === '/dashboard/leads'
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                Lead
              </Link>
              <Link
                href="/dashboard/conversations"
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  pathname === '/dashboard/conversations'
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                Conversazioni
              </Link>
              <Link
                href="/dashboard/ai-calls"
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  pathname?.startsWith('/dashboard/ai-calls')
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                Chiamate IA
              </Link>
              <Link
                href="/dashboard/settings"
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  pathname === '/dashboard/settings'
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
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
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}
