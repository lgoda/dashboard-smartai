import './globals.css'
import { AuthProvider } from './components/AuthProvider'
import { Navigation } from './components/Navigation'
import { NavigationProgress } from './components/NavigationProgress'
import { ChatWidget } from './components/ChatWidget'
import { ReactNode } from 'react'
import { Inter, Bricolage_Grotesque, Geist_Mono } from 'next/font/google'

// Body / UI — dense, neutral, legible.
const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
})

// Display — page titles and panel headings. Carries the personality.
const bricolage = Bricolage_Grotesque({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-bricolage',
  display: 'swap',
})

// Data — every number that is content (metrics, durations, counts, IDs).
const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-geist-mono',
  display: 'swap',
})

export const metadata = {
  title: 'Dashboard SmartService',
  description: 'Dashboard per gestire lead, conversazioni e servizi AI',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it" className={`${inter.variable} ${bricolage.variable} ${geistMono.variable}`}>
      <head />
      <body className="bg-[#141517] min-h-screen">
        <AuthProvider>
          <NavigationProgress />
          <Navigation />
          <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
            {children}
          </main>
          <ChatWidget />
        </AuthProvider>
      </body>
    </html>
  )
}
