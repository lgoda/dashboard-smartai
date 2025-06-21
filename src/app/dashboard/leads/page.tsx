'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/app/lib/supabaseClient'

export default function LeadsPage() {
  const [leads, setLeads] = useState([])

  useEffect(() => {
    const fetchLeads = async () => {
      const { data, error } = await supabase.from('leads').select('*')
      if (!error && data) setLeads(data)
    }

    fetchLeads()
  }, [])

  return (
    <div>
      <h1>Leads raccolti</h1>
      <ul>
        {leads.map((lead) => (
          <li key={lead.id}>{lead.name} - {lead.email}</li>
        ))}
      </ul>
    </div>
  )
}
