import { Client } from '@/types/database'

type ClientBadgeProps = {
  client: Client | null
  className?: string
}

export default function ClientBadge({ client, className = '' }: ClientBadgeProps) {
  if (!client) return null

  return (
    <div className={`inline-flex items-center space-x-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg ${className}`}>
      <div className="w-6 h-6 bg-gradient-to-br from-green-400 to-green-500 rounded flex items-center justify-center">
        <span className="text-white font-medium text-xs">
          {client.name.charAt(0).toUpperCase()}
        </span>
      </div>
      <div>
        <div className="text-xs font-medium text-green-900">
          {client.name}
        </div>
        <div className="text-xs text-green-600">
          {client.company_name}
        </div>
      </div>
    </div>
  )
}
