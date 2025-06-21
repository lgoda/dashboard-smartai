'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/app/lib/supabaseClient'
import Link from 'next/link'

type Stats = {
  date: string
  leads: number
  conversations: number
}

export default function Dashboard() {
  const [userId, setUserId] = useState<string | null>(null)
  const [stats, setStats] = useState<Stats[]>([])
  const [totalLeads, setTotalLeads] = useState(0)
  const [totalConvs, setTotalConvs] = useState(0)

  useEffect(() => {
    const fetchStats = async () => {
      const { data: session } = await supabase.auth.getUser()
      const user = session?.user
      if (!user) return

      setUserId(user.id)

      const to = new Date()
      const from = new Date()
      from.setDate(to.getDate() - 6)

      // Statistiche ultimi 7 giorni
      const [leadsRes, convsRes] = await Promise.all([
        supabase.from('leads')
          .select('created_at')
          .gte('created_at', from.toISOString())
          .lte('created_at', to.toISOString())
          .eq('user_id', user.id),
        supabase.from('conversations')
          .select('created_at')
          .gte('created_at', from.toISOString())
          .lte('created_at', to.toISOString())
          .eq('user_id', user.id)
      ])

      if (leadsRes.error || convsRes.error) {
        console.error(leadsRes.error || convsRes.error)
        return
      }

      const format = (date: Date) => date.toISOString().slice(0, 10)
      const range: Stats[] = []
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        range.push({ date: format(d), leads: 0, conversations: 0 })
      }

      const countByDay = (arr: any[]) => {
        return arr.reduce((acc, curr) => {
          const d = format(new Date(curr.created_at))
          acc[d] = (acc[d] || 0) + 1
          return acc
        }, {} as Record<string, number>)
      }

      const leadCount = countByDay(leadsRes.data || [])
      const convCount = countByDay(convsRes.data || [])

      const updated = range.map(day => ({
        date: day.date,
        leads: leadCount[day.date] || 0,
        conversations: convCount[day.date] || 0,
      }))

      setStats(updated)
      setTotalLeads(leadsRes.data?.length || 0)
      setTotalConvs(convsRes.data?.length || 0)
    }

    fetchStats()
  }, [])

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">📊 Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-white">
        <div className="bg-blue-600 rounded-xl p-4">
          <h2 className="text-sm uppercase">Totale Leads</h2>
          <p className="text-2xl font-semibold">{totalLeads}</p>
        </div>
        <div className="bg-purple-600 rounded-xl p-4">
          <h2 className="text-sm uppercase">Totale Conversazioni</h2>
          <p className="text-2xl font-semibold">{totalConvs}</p>
        </div>
        <Link href="/dashboard/leads" className="bg-green-600 rounded-xl p-4 hover:brightness-110">
          <h2 className="text-sm uppercase">Vai a Leads</h2>
          <p className="text-lg font-medium">📥</p>
        </Link>
        <Link href="/dashboard/conversations" className="bg-yellow-600 rounded-xl p-4 hover:brightness-110">
          <h2 className="text-sm uppercase">Vai a Conversazioni</h2>
          <p className="text-lg font-medium">💬</p>
        </Link>
      </div>

      <div className="bg-white rounded-xl p-4 shadow mt-6">
        <h2 className="text-lg font-semibold mb-2">Ultimi 7 giorni</h2>
        <table className="min-w-full text-sm text-left">
          <thead>
            <tr className="border-b">
              <th className="py-2">Data</th>
              <th className="py-2">Leads</th>
              <th className="py-2">Conversazioni</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => (
              <tr key={i} className="border-t hover:bg-gray-50">
                <td className="py-2">{s.date}</td>
                <td className="py-2">{s.leads}</td>
                <td className="py-2">{s.conversations}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
