'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { Client } from '@/types/database'
import { useSelectedClient } from '@/contexts/ClientContext'
import { useUserRole } from '@/hooks/useUserRole'

export default function SelectClientPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const { setSelectedClient } = useSelectedClient()
  const { isAdmin } = useUserRole()
  const router = useRouter()

  useEffect(() => {
    if (!isAdmin) {
      router.push('/dashboard')
      return
    }
    fetchClients()
  }, [isAdmin, router])

  const fetchClients = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('name', { ascending: true })

      if (error) throw error
      setClients(data || [])
    } catch (error) {
      console.error('Error fetching clients:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.company_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client)
    router.push('/dashboard')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 bg-slate-200 rounded-full animate-pulse mx-auto mb-4"></div>
          <p className="text-slate-600">Caricamento clienti...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div className="text-center">
        <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <span className="text-white text-3xl">⚡</span>
        </div>
        <h1 className="text-4xl font-bold text-slate-900 mb-3">Benvenuto, Admin</h1>
        <p className="text-lg text-slate-600">
          Seleziona un cliente per visualizzare e gestire i suoi dati
        </p>
      </div>

      <div className="max-w-2xl mx-auto">
        <div className="relative mb-6">
          <input
            type="text"
            placeholder="Cerca cliente per nome, azienda o email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-4 border border-slate-300 rounded-xl text-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 shadow-sm"
          />
          <svg className="absolute left-4 top-5 w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {filteredClients.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-slate-200">
            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-slate-400 text-3xl">🏢</span>
            </div>
            <h3 className="text-xl font-medium text-slate-900 mb-3">
              {searchTerm ? 'Nessun cliente trovato' : 'Nessun cliente configurato'}
            </h3>
            <p className="text-slate-600 mb-6">
              {searchTerm
                ? 'Prova a modificare i criteri di ricerca'
                : 'Crea il tuo primo cliente per iniziare'
              }
            </p>
            {!searchTerm && (
              <button
                onClick={() => router.push('/dashboard/admin/clients')}
                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Crea Primo Cliente
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredClients.map((client) => (
              <button
                key={client.id}
                onClick={() => handleSelectClient(client)}
                className="bg-white rounded-xl p-6 shadow-sm border border-slate-200 hover:border-purple-300 hover:shadow-md transition-all text-left group"
              >
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-green-400 to-green-500 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                    <span className="text-white font-bold text-xl">
                      {client.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-semibold text-slate-900 mb-1 group-hover:text-purple-600 transition-colors">
                      {client.name}
                    </h3>
                    <p className="text-sm text-slate-600 truncate">{client.company_name}</p>
                    <p className="text-sm text-slate-500 truncate">{client.email}</p>
                  </div>
                  <div className="text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="text-center">
        <button
          onClick={() => router.push('/dashboard/admin/clients')}
          className="text-purple-600 hover:text-purple-700 font-medium text-lg"
        >
          Gestisci Clienti →
        </button>
      </div>
    </div>
  )
}
