'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from './AuthProvider'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ProfileModal } from './ProfileModal'

export function Navigation() {
  const { user, profile, loading, signOut } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [showProfile, setShowProfile] = useState(false)

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

  if (loading) return null
  if (!user || isAuthPage) return null

  const initials = (profile?.full_name || user.email || '?').slice(0, 2).toUpperCase()
  const displayName = profile?.full_name || user.email || ''

  return (
    <>
      <nav className="bg-[#2C2E31] border-b border-[#3A3D42] sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-8">
              <Link href="/dashboard" className="flex items-center space-x-2">
                <img src="/logo-smartservice.png" alt="SmartService" className="h-8 w-auto" />
              </Link>

              <div className="hidden md:flex space-x-0.5">
                <Link href="/dashboard"
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname === '/dashboard' ? 'bg-[#F0AD4E] text-[#1e293b]' : 'text-white hover:bg-[#3A3D42] hover:text-[#F0AD4E]'}`}>
                  Dashboard
                </Link>
                <Link href="/dashboard/leads"
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname === '/dashboard/leads' ? 'bg-[#F0AD4E] text-[#1e293b]' : 'text-white hover:bg-[#3A3D42] hover:text-[#F0AD4E]'}`}>
                  Lead
                </Link>
                <Link href="/dashboard/conversations"
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname === '/dashboard/conversations' ? 'bg-[#F0AD4E] text-[#1e293b]' : 'text-white hover:bg-[#3A3D42] hover:text-[#F0AD4E]'}`}>
                  Conversazioni
                </Link>
                <Link href="/dashboard/ai-calls"
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname?.startsWith('/dashboard/ai-calls') ? 'bg-[#F0AD4E] text-[#1e293b]' : 'text-white hover:bg-[#3A3D42] hover:text-[#F0AD4E]'}`}>
                  Chiamate IA
                </Link>
                <Link href="/dashboard/campaigns"
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname?.startsWith('/dashboard/campaigns') ? 'bg-[#F0AD4E] text-[#1e293b]' : 'text-white hover:bg-[#3A3D42] hover:text-[#F0AD4E]'}`}>
                  Campagne
                </Link>
                <Link href="/dashboard/ghl-conversations"
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname?.startsWith('/dashboard/ghl-conversations') ? 'bg-[#F0AD4E] text-[#1e293b]' : 'text-white hover:bg-[#3A3D42] hover:text-[#F0AD4E]'}`}>
                  CRM
                </Link>
                <Link href="/dashboard/settings"
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${pathname === '/dashboard/settings' ? 'bg-[#F0AD4E] text-[#1e293b]' : 'text-white hover:bg-[#3A3D42] hover:text-[#F0AD4E]'}`}>
                  Impostazioni
                </Link>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {profile?.role === 'admin' && (
                <Link href="/dashboard/admin"
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${pathname === '/dashboard/admin' ? 'bg-red-500/20 text-red-400 border-red-500/40' : 'text-gray-400 border-[#3A3D42] hover:bg-[#3A3D42] hover:text-white'}`}>
                  Admin
                </Link>
              )}

              {/* Profile button — avatar only */}
              <button
                onClick={() => setShowProfile(true)}
                title={displayName}
                className="w-8 h-8 bg-[#F0AD4E] rounded-full flex items-center justify-center text-[#1e293b] font-bold text-xs hover:bg-[#E09A3D] transition-colors"
              >
                {initials}
              </button>

              <button
                onClick={async () => { await signOut(); router.push('/') }}
                className="px-3 py-1.5 text-sm font-medium text-white hover:text-[#F0AD4E] hover:bg-[#3A3D42] rounded-lg transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </>
  )
}
