import './globals.css'
import { AuthProvider } from './components/AuthProvider'
import { Navigation } from './components/Navigation'
import { ReactNode } from 'react'

export const metadata = {
  title: 'Dashboard SmartService',
  description: 'Dashboard per gestire lead, conversazioni e servizi AI',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="it">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-slate-50">
        <AuthProvider>
          <Navigation />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </AuthProvider>
      </body>
    </html>
  )
}
