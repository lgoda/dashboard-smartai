'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from './AuthProvider'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ProfileModal } from './ProfileModal'
import { supabase } from '@/app/lib/supabaseClient'

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard', exact: true },
  { href: '/dashboard/leads', label: 'Lead', exact: true },
  { href: '/dashboard/conversations', label: 'Conversazioni', exact: true },
  { href: '/dashboard/ai-calls', label: 'Chiamate IA', exact: false },
  { href: '/dashboard/campaigns', label: 'Campagne', exact: false },
  { href: '/dashboard/ghl-conversations', label: 'CRM', exact: false },
  { href: '/dashboard/settings', label: 'Impostazioni', exact: true },
  { href: '/dashboard/billing', label: 'Fatturazione', exact: true },
]

export function Navigation() {
  const { user, profile, loading, signOut } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [showProfile, setShowProfile] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [hasConsumo, setHasConsumo] = useState(false)
  const [hasWhatsapp, setHasWhatsapp] = useState(false)

  // Consumo view and WhatsApp are opt-in per client → only show the links when enabled.
  useEffect(() => {
    if (!user?.id) { setHasConsumo(false); setHasWhatsapp(false); return }
    supabase
      .from('user_services')
      .select('has_consumo, has_whatsapp')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setHasConsumo(!!data?.has_consumo)
        setHasWhatsapp(!!data?.has_whatsapp)
      }, () => {})
  }, [user?.id])

  const isAuthPage = pathname === '/' || pathname === '/login' || pathname === '/signup'
  // Pagine pubbliche "standalone": nessun redirect, né da loggati né da non loggati
  // (es. impostazione password via link riutilizzabile, reset sessione).
  const isStandalonePage = pathname === '/imposta-password' || pathname === '/reset' || pathname === '/collega-whatsapp'

  useEffect(() => {
    if (!loading && !isStandalonePage) {
      if (user && isAuthPage) {
        // Non redirigere se siamo in un flow di invito/recovery (l'utente deve impostare la password)
        const inInviteFlow = typeof window !== 'undefined' &&
          sessionStorage.getItem('smartbot-invite-flow') === '1'
        if (!inInviteFlow) router.push('/dashboard')
      } else if (!user && !isAuthPage) {
        router.push('/')
      }
    }
  }, [user, loading, isAuthPage, isStandalonePage, router])

  // Chiudi il menu mobile al cambio pagina
  useEffect(() => { setMobileOpen(false) }, [pathname])

  if (loading) return null
  if (!user || isAuthPage || isStandalonePage) return null

  const initials = (profile?.full_name || user.email || '?').slice(0, 2).toUpperCase()
  const displayName = profile?.full_name || user.email || ''

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname?.startsWith(href)

  const linkClass = (href: string, exact: boolean) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
      isActive(href, exact)
        ? 'bg-[rgba(245,158,11,0.12)] text-[var(--amber)]'
        : 'text-[var(--mute)] hover:text-[var(--text)]'
    }`

  const mobileLinkClass = (href: string, exact: boolean) =>
    `block px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
      isActive(href, exact)
        ? 'bg-[rgba(245,158,11,0.12)] text-[var(--amber)]'
        : 'text-white hover:bg-[var(--surface-2)] hover:text-[var(--amber)]'
    }`

  return (
    <>
      <nav className="bg-[var(--ink)] border-b border-[var(--line)] sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16 gap-3">

            {/* Logo + desktop links */}
            <div className="flex items-center gap-3 min-w-0">
              <Link href="/dashboard" className="flex items-center space-x-2 shrink-0">
                <img src="/logo-smartservice.png" alt="SmartService" className="h-8 w-auto" />
              </Link>
              <span className="hidden xl:block w-px h-7 bg-[var(--line)]" />
              <div className="hidden xl:flex items-center gap-0.5 bg-[var(--surface)] border border-[var(--line)] rounded-xl p-1">
                {NAV_LINKS.map(l => (
                  <Link key={l.href} href={l.href} className={linkClass(l.href, l.exact)}>
                    {l.label}
                  </Link>
                ))}
                {hasConsumo && (
                  <Link href="/dashboard/consumo" className={linkClass('/dashboard/consumo', true)}>
                    Consumo
                  </Link>
                )}
                {hasWhatsapp && (
                  <Link href="/dashboard/whatsapp" className={linkClass('/dashboard/whatsapp', false)}>
                    WhatsApp
                  </Link>
                )}
              </div>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2 shrink-0">
              {profile?.role === 'admin' && (
                <>
                  <Link href="/dashboard/admin/billing"
                    className={`hidden xl:block px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      pathname?.startsWith('/dashboard/admin/billing')
                        ? 'bg-[#F59E0B]/20 text-[#F59E0B] border-[#F59E0B]/40'
                        : 'text-gray-400 border-[var(--line)] hover:bg-[var(--surface-2)] hover:text-white'
                    }`}>
                    Billing
                  </Link>
                  <Link href="/dashboard/admin"
                    className={`hidden xl:block px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      pathname === '/dashboard/admin'
                        ? 'bg-red-500/20 text-red-400 border-red-500/40'
                        : 'text-gray-400 border-[var(--line)] hover:bg-[var(--surface-2)] hover:text-white'
                    }`}>
                    Admin
                  </Link>
                </>
              )}

              <span className="hidden sm:block w-px h-6 bg-[var(--line)] mx-0.5" />

              <button
                onClick={() => setShowProfile(true)}
                title={displayName}
                className="w-8 h-8 bg-[#F59E0B] rounded-full flex items-center justify-center text-[#1b1d20] font-mono font-semibold text-xs hover:bg-[var(--amber-deep)] transition-colors shrink-0"
              >
                {initials}
              </button>

              <button
                onClick={async () => { await signOut(); router.push('/') }}
                className="hidden sm:block px-3 py-1.5 text-sm font-medium text-[var(--mute)] hover:text-[var(--amber)] hover:bg-[var(--surface-2)] rounded-lg transition-colors"
              >
                Logout
              </button>

              {/* Hamburger */}
              <button
                onClick={() => setMobileOpen(o => !o)}
                className="xl:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-[var(--surface-2)] transition-colors"
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
          <div className="xl:hidden border-t border-[var(--line)] bg-[var(--ink)] px-4 py-3 space-y-1">
            {NAV_LINKS.map(l => (
              <Link key={l.href} href={l.href} className={mobileLinkClass(l.href, l.exact)}>
                {l.label}
              </Link>
            ))}
            {hasConsumo && (
              <Link href="/dashboard/consumo" className={mobileLinkClass('/dashboard/consumo', true)}>
                Consumo
              </Link>
            )}
            {hasWhatsapp && (
              <Link href="/dashboard/whatsapp" className={mobileLinkClass('/dashboard/whatsapp', false)}>
                WhatsApp
              </Link>
            )}
            {profile?.role === 'admin' && (
              <>
                <Link href="/dashboard/admin/billing" className={mobileLinkClass('/dashboard/admin/billing', false)}>
                  Billing
                </Link>
                <Link href="/dashboard/admin" className={mobileLinkClass('/dashboard/admin', true)}>
                  Admin
                </Link>
              </>
            )}
            <div className="pt-2 border-t border-[var(--line)]">
              <button
                onClick={async () => { await signOut(); router.push('/') }}
                className="w-full text-left px-4 py-3 rounded-lg text-sm font-medium text-red-400 hover:bg-[var(--surface-2)] transition-colors"
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
