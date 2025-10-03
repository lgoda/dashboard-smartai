'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Client } from '@/types/database'

type ClientContextType = {
  selectedClient: Client | null
  setSelectedClient: (client: Client | null) => void
  clearSelectedClient: () => void
}

const ClientContext = createContext<ClientContextType | undefined>(undefined)

const STORAGE_KEY = 'selected_client_id'

export function ClientProvider({ children }: { children: ReactNode }) {
  const [selectedClient, setSelectedClientState] = useState<Client | null>(null)

  useEffect(() => {
    const storedClientId = localStorage.getItem(STORAGE_KEY)
    if (storedClientId) {
      fetchClient(storedClientId)
    }
  }, [])

  const fetchClient = async (clientId: string) => {
    try {
      const response = await fetch(`/api/clients/${clientId}`)
      if (response.ok) {
        const client = await response.json()
        setSelectedClientState(client)
      }
    } catch (error) {
      console.error('Error fetching client:', error)
    }
  }

  const setSelectedClient = (client: Client | null) => {
    setSelectedClientState(client)
    if (client) {
      localStorage.setItem(STORAGE_KEY, client.id)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  const clearSelectedClient = () => {
    setSelectedClientState(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  return (
    <ClientContext.Provider value={{ selectedClient, setSelectedClient, clearSelectedClient }}>
      {children}
    </ClientContext.Provider>
  )
}

export function useSelectedClient() {
  const context = useContext(ClientContext)
  if (context === undefined) {
    throw new Error('useSelectedClient must be used within a ClientProvider')
  }
  return context
}
