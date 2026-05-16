'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from './AuthProvider'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ProfileModal } from './ProfileModal'

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard', exact: true },
  { href: '/dashboard/leads', label: 'Lead', exact: true },
  { href: '/dashboard/conversations', label: 'Conversazioni', exact: true },
  { href: '/dashboard/ai-calls', label: 'Chiamate IA', exact: false },
  { href: '/dashboard/campaigns', label: 'Campagne', exact: false },
  { href: '/dashboard/ghl-conversations', label: 'CRM', exact: false },
  { href: '/dashboard/settings', label: 'Impostazioni', exact: true },
]

export function Navigation() {
  const { user, profile, loading, signOut } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [showProfile, setShowProfile] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const isAuthPage = pathname === '/' || pathname === '/login' || pathname === '/signup'

  useEffect(() => {
    if (!loading) {
      if (user && isAuthPage) {
        // Non redirigere se siamo in un flow di invito/recovery (l'utente deve impostare la password)
        const inInviteFlow = typeof window !== 'undefined' &&
          sessionStorage.getItem('smartbot-invite-flow') === '1'
        if (!inInviteFlow) router.push('/dashboard')
      } else if (!user && !isAuthPage) {
        router.push('/')
      }
    }
  }, [user, loading, isAuthPage, router])

  // Chiudi il menu mobile al cambio pagina
  useEffect(() => { setMobileOpen(false) }, [pathname])

  if (loading) return null
  if (!user || isAuthPage) return null

  const initials = (profile?.full_name || user.email || '?').slice(0, 2).toUpperCase()
  const displayName = profile?.full_name || user.email || ''

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname?.startsWith(href)

  const linkClass = (href: string, exact: boolean) =>
    `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive(href, exact)
        ? 'bg-[#F59E0B] text-[#1e293b]'
        : 'text-white hover:bg-[#222428] hover:text-[#F59E0B]'
    }`

  const mobileLinkClass = (href: string, exact: boolean) =>
    `block px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
      isActive(href, exact)
        ? 'bg-[#F59E0B] text-[#1e293b]'
        : 'text-white hover:bg-[#222428] hover:text-[#F59E0B]'
    }`

  return (
    <>
      <nav className="bg-[#18191C] border-b border-[#222428] sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">

            {/* Logo + desktop links */}
            <div className="flex items-center space-x-6">
              <Link href="/dashboard" className="flex items-center space-x-2 shrink-0">
                <img src="/logo-smartservice.png" alt="SmartService" className="h-8 w-auto" />
              </Link>
              <div className="hidden md:flex space-x-0.5">
                {NAV_LINKS.map(l => (
                  <Link key={l.href} href={l.href} className={linkClass(l.href, l.exact)}>
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2">
              {profile?.role === 'admin' && (
                <Link href="/dashboard/admin"
                  className={`hidden sm:block px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    pathname === '/dashboard/admin'
                      ? 'bg-red-500/20 text-red-400 border-red-500/40'
                      : 'text-gray-400 border-[#222428] hover:bg-[#222428] hover:text-white'
                  }`}>
                  Admin
                </Link>
              )}

              <button
                onClick={() => setShowProfile(true)}
                title={displayName}
                className="w-8 h-8 bg-[#F59E0B] rounded-full flex items-center justify-center text-[#1e293b] font-bold text-xs hover:bg-[#D97706] transition-colors shrink-0"
              >
                {initials}
              </button>

              <button
                onClick={async () => { await signOut(); router.push('/') }}
                className="hidden sm:block px-3 py-1.5 text-sm font-medium text-white hover:text-[#F59E0B] hover:bg-[#222428] rounded-lg transition-colors"
              >
                Logout
              </button>

              {/* Hamburger */}
              <button
                onClick={() => setMobileOpen(o => !o)}
                className="md:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[#222428] transition-colors"
                aria-label="Menu"
              >
                {mobileOpen ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-[#222428] bg-[#18191C] px-4 py-3 space-y-1">
            {NAV_LINKS.map(l => (
              <Link key={l.href} href={l.href} className={mobileLinkClass(l.href, l.exact)}>
                {l.label}
              </Link>
            ))}
            {profile?.role === 'admin' && (
              <Link href="/dashboard/admin" className={mobileLinkClass('/dashboard/admin', true)}>
                Admin
              </Link>
            )}
            <div className="pt-2 border-t border-[#222428]">
              <button
                onClick={async () => { await signOut(); router.push('/') }}
                className="w-full text-left px-4 py-3 rounded-lg text-sm font-medium text-red-400 hover:bg-[#222428] transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </nav>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
    </>
  )
}
