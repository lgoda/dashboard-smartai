'use client'

import { useEffect, useState } from 'react'
import { Client } from '@/types/database'
import { useSelectedClient } from '@/contexts/ClientContext'
import { createClient } from '@/utils/supabase/client'

export default function ClientSelector() {
  const [clients, setClients] = useState<Client[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const { selectedClient, setSelectedClient } = useSelectedClient()

  useEffect(() => {
    fetchClients()
  }, [])

  const fetchClients = async () => {
    try {
      setIsLoading(true)
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

  const handleSelect = (client: Client) => {
    setSelectedClient(client)
    setIsOpen(false)
    setSearchTerm('')
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors min-w-[200px]"
      >
        {selectedClient ? (
          <>
            <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-green-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-medium text-sm">
                {selectedClient.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 text-left">
              <div className="text-sm font-medium text-slate-900 truncate">
                {selectedClient.name}
              </div>
              <div className="text-xs text-slate-500 truncate">
                {selectedClient.company_name}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center">
              <span className="text-slate-500">🏢</span>
            </div>
            <span className="text-sm text-slate-600">Seleziona Cliente</span>
          </>
        )}
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-96 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-96 overflow-hidden">
            <div className="p-3 border-b border-slate-200">
              <input
                type="text"
                placeholder="Cerca cliente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
            </div>

            <div className="overflow-y-auto max-h-80">
              {isLoading ? (
                <div className="p-8 text-center text-slate-500">
                  Caricamento...
                </div>
              ) : filteredClients.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  Nessun cliente trovato
                </div>
              ) : (
                filteredClients.map((client) => (
                  <button
                    key={client.id}
                    onClick={() => handleSelect(client)}
                    className={`w-full flex items-center space-x-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left ${
                      selectedClient?.id === client.id ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="w-10 h-10 bg-gradient-to-br from-green-400 to-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
                      <span className="text-white font-medium">
                        {client.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">
                        {client.name}
                      </div>
                      <div className="text-xs text-slate-500 truncate">
                        {client.company_name}
                      </div>
                      <div className="text-xs text-slate-400 truncate">
                        {client.email}
                      </div>
                    </div>
                    {selectedClient?.id === client.id && (
                      <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
