import './globals.css'
import { AuthProvider } from './components/AuthProvider'
import { Navigation } from './components/Navigation'
import { NavigationProgress } from './components/NavigationProgress'
import { ChatWidget } from './components/ChatWidget'
import { ReactNode } from 'react'
import { Inter } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
})

export const metadata = {
  title: 'Dashboard SmartService',
  description: 'Dashboard per gestire lead, conversazioni e servizi AI',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it" className={inter.className}>
      <head />
      <body className="bg-[#2C2E31] min-h-screen">
        <AuthProvider>
          <NavigationProgress />
          <Navigation />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
          <ChatWidget />
        </AuthProvider>
      </body>
    </html>
  )
}
