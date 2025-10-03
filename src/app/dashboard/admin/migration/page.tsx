'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { useUserRole } from '@/hooks/useUserRole'
import { Client } from '@/types/database'
import RoleGuard from '@/app/components/RoleGuard'

type OrphanedData = {
  leads: number
  conversations: number
  conversationSessions: number
}

export default function MigrationPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClientId, setSelectedClientId] = useState<string>('')
  const [orphanedData, setOrphanedData] = useState<OrphanedData>({
    leads: 0,
    conversations: 0,
    conversationSessions: 0
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isMigrating, setIsMigrating] = useState(false)
  const [migrationResult, setMigrationResult] = useState<{
    success: boolean
    message: string
    leadsUpdated?: number
    conversationsUpdated?: number
  } | null>(null)
  const router = useRouter()
  const { isAdmin } = useUserRole()

  useEffect(() => {
    if (!isAdmin) {
      router.push('/dashboard')
      return
    }

    fetchData()
  }, [isAdmin, router])

  const fetchData = async () => {
    try {
      setIsLoading(true)
      const supabase = createClient()

      const [clientsRes, leadsRes, convsRes] = await Promise.all([
        supabase.from('clients').select('*').order('name'),
        supabase.from('leads').select('id').is('client_id', null),
        supabase.from('conversations').select('id, session_id').is('client_id', null)
      ])

      if (clientsRes.data) {
        setClients(clientsRes.data)
      }

      const uniqueSessions = new Set(
        (convsRes.data || []).map(c => c.session_id)
      ).size

      setOrphanedData({
        leads: leadsRes.data?.length || 0,
        conversations: convsRes.data?.length || 0,
        conversationSessions: uniqueSessions
      })
    } catch (error) {
      console.error('Errore nel caricamento dei dati:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleMigration = async () => {
    if (!selectedClientId) {
      setMigrationResult({
        success: false,
        message: 'Seleziona un cliente per la migrazione'
      })
      return
    }

    setIsMigrating(true)
    setMigrationResult(null)

    try {
      const supabase = createClient()

      const [leadsUpdate, convsUpdate] = await Promise.all([
        supabase
          .from('leads')
          .update({ client_id: selectedClientId })
          .is('client_id', null),
        supabase
          .from('conversations')
          .update({ client_id: selectedClientId })
          .is('client_id', null)
      ])

      if (leadsUpdate.error) throw leadsUpdate.error
      if (convsUpdate.error) throw convsUpdate.error

      const leadsUpdated = leadsUpdate.count || 0
      const conversationsUpdated = convsUpdate.count || 0

      setMigrationResult({
        success: true,
        message: 'Migrazione completata con successo!',
        leadsUpdated,
        conversationsUpdated
      })

      await fetchData()
    } catch (error) {
      console.error('Errore durante la migrazione:', error)
      setMigrationResult({
        success: false,
        message: 'Errore durante la migrazione. Verifica la console per i dettagli.'
      })
    } finally {
      setIsMigrating(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-slate-200 rounded-lg loading"></div>
          <div className="h-8 bg-slate-200 rounded w-48 loading"></div>
        </div>
      </div>
    )
  }

  const hasOrphanedData = orphanedData.leads > 0 || orphanedData.conversations > 0

  return (
    <RoleGuard allowedRoles={['admin']}>
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center">
            <span className="text-white text-lg">🔄</span>
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Migrazione Dati</h1>
            <p className="text-slate-600 mt-1">Assegna dati orfani a un cliente specifico</p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <div className="flex items-start space-x-3">
            <span className="text-2xl">ℹ️</span>
            <div>
              <h3 className="font-semibold text-blue-900 mb-2">Informazioni sulla Migrazione</h3>
              <p className="text-sm text-blue-800 mb-2">
                I dati senza <code className="bg-blue-100 px-1 rounded">client_id</code> sono stati creati prima dell'implementazione del sistema multi-tenant.
              </p>
              <p className="text-sm text-blue-800">
                Usa questa pagina per assegnare massivamente questi dati a un cliente specifico.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 uppercase tracking-wide">Lead Orfani</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{orphanedData.leads}</p>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <span className="text-green-600 text-xl">📇</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 uppercase tracking-wide">Messaggi Orfani</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{orphanedData.conversations}</p>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <span className="text-blue-600 text-xl">💬</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-600 uppercase tracking-wide">Sessioni Orfane</p>
                <p className="text-3xl font-bold text-slate-900 mt-2">{orphanedData.conversationSessions}</p>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <span className="text-purple-600 text-xl">🗂️</span>
              </div>
            </div>
          </div>
        </div>

        {hasOrphanedData ? (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
            <h2 className="text-xl font-semibold text-slate-900 mb-6">Assegna Dati a Cliente</h2>

            <div className="space-y-4">
              <div>
                <label htmlFor="client" className="block text-sm font-medium text-slate-700 mb-2">
                  Seleziona Cliente di Destinazione
                </label>
                <select
                  id="client"
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
                  disabled={isMigrating}
                >
                  <option value="">-- Seleziona un cliente --</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>
                      {client.name} ({client.company_name})
                    </option>
                  ))}
                </select>
              </div>

              {selectedClientId && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <p className="text-sm text-orange-800">
                    <strong>Attenzione:</strong> Questa operazione assegnerà tutti i dati orfani al cliente selezionato.
                    L'operazione è irreversibile.
                  </p>
                </div>
              )}

              <button
                onClick={handleMigration}
                disabled={!selectedClientId || isMigrating}
                className="w-full bg-gradient-to-r from-orange-500 to-orange-600 text-white font-medium px-6 py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:from-orange-600 hover:to-orange-700 transition-all shadow-lg hover:shadow-xl"
              >
                {isMigrating ? (
                  <span className="flex items-center justify-center space-x-2">
                    <span className="animate-spin">⏳</span>
                    <span>Migrazione in corso...</span>
                  </span>
                ) : (
                  <span className="flex items-center justify-center space-x-2">
                    <span>🔄</span>
                    <span>Avvia Migrazione</span>
                  </span>
                )}
              </button>
            </div>

            {migrationResult && (
              <div className={`mt-4 p-4 rounded-lg border ${
                migrationResult.success
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <p className={`font-medium ${
                  migrationResult.success ? 'text-green-900' : 'text-red-900'
                }`}>
                  {migrationResult.message}
                </p>
                {migrationResult.success && (
                  <div className="mt-2 text-sm text-green-800">
                    <p>Lead aggiornati: {migrationResult.leadsUpdated}</p>
                    <p>Conversazioni aggiornate: {migrationResult.conversationsUpdated}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-slate-200">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-green-600 text-2xl">✅</span>
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              Nessun dato orfano trovato
            </h3>
            <p className="text-slate-600">
              Tutti i lead e le conversazioni sono già assegnati a un cliente.
            </p>
          </div>
        )}
      </div>
    </RoleGuard>
  )
}
