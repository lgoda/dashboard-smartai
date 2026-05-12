'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

export function NavigationProgress() {
  const pathname = usePathname()
  const [loading, setLoading] = useState(false)
  const prevPathname = useRef(pathname)
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
      const anchor = (e.target as HTMLElement).closest('a')
      if (!anchor) return
      const href = anchor.getAttribute('href')
      if (!href || !href.startsWith('/') || href === pathname || href.includes('#')) return
      setLoading(true)
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [pathname])

  useEffect(() => {
    if (pathname !== prevPathname.current) {
      prevPathname.current = pathname
      if (doneTimer.current) clearTimeout(doneTimer.current)
      doneTimer.current = setTimeout(() => setLoading(false), 150)
    }
    return () => { if (doneTimer.current) clearTimeout(doneTimer.current) }
  }, [pathname])

  if (!loading) return null

  return (
    <>
      <div className="nav-progress-bar" />
      <div className="fixed inset-0 z-[9998] flex items-center justify-center pointer-events-none">
        <div className="w-10 h-10 rounded-full border-4 border-[#3A3D42] border-t-[#F0AD4E] animate-spin" />
      </div>
    </>
  )
}
