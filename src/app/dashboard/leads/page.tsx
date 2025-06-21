'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/app/lib/supabaseClient'
import { useRouter } from 'next/navigation'

type Lead = {
  id: string
  name: string
  email: string
  phone: string
  message: string
  source: string
  created_at: string
}

export default function LeadsPage() {
  const [user, setUser] = useState<any>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const router = useRouter()

  useEffect(() => {
    const fetchData = async () => {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData?.user) return router.push('/')
      setUser(userData.user)

      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('user_id', userData.user.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Errore nel recupero dei lead:', error)
      } else {
        setLeads(data || [])
      }
    }

    fetchData()
  }, [router])

  const exportCSV = () => {
    const csv = leads.map(l =>
      `${l.name},${l.email},${l.phone},${l.message},${l.source},${l.created_at}`
    )
    const header = 'Nome,Email,Telefono,Messaggio,Fonte,Creato il\n'
    const csvString = header + csv.join('\n')
    const blob = new Blob([csvString], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'leads.csv'
    link.click()
  }

  if (!user) return <p className="text-center mt-10">Caricamento...</p>

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">📇 Contatti raccolti</h1>
        <button
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          onClick={exportCSV}
        >
          Esporta CSV
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-200 rounded-lg">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3 border-b text-left">Nome</th>
              <th className="p-3 border-b text-left">Email</th>
              <th className="p-3 border-b text-left">Telefono</th>
              <th className="p-3 border-b text-left">Messaggio</th>
              <th className="p-3 border-b text-left">Fonte</th>
              <th className="p-3 border-b text-left">Data</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="border-t hover:bg-gray-50">
                <td className="p-3">{lead.name}</td>
                <td className="p-3">{lead.email}</td>
                <td className="p-3">{lead.phone}</td>
                <td className="p-3">{lead.message}</td>
                <td className="p-3">{lead.source}</td>
                <td className="p-3">{new Date(lead.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
