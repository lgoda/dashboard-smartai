import Link from 'next/link'
import { ReactNode } from 'react'

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="w-60 bg-white shadow-md border-r p-4">
        <div className="text-xl font-bold mb-6 text-gray-800">🧠 SmartBot</div>

        <nav className="space-y-3 text-sm font-medium text-gray-700">
          <Link
            href="/dashboard"
            className="block px-3 py-2 rounded hover:bg-gray-100 transition"
          >
            📊 Dashboard
          </Link>

          <Link
            href="/dashboard/conversations"
            className="block px-3 py-2 rounded hover:bg-gray-100 transition"
          >
            💬 Conversazioni
          </Link>

          <Link
            href="/dashboard/leads"
            className="block px-3 py-2 rounded hover:bg-gray-100 transition"
          >
            📇 Lead raccolti
          </Link>
        </nav>
      </aside>

      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
