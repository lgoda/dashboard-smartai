import { UserRole } from '@/types/database'

type RoleBadgeProps = {
  role: UserRole
  className?: string
}

export default function RoleBadge({ role, className = '' }: RoleBadgeProps) {
  const isAdmin = role === 'admin'

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        isAdmin
          ? 'bg-purple-100 text-purple-800 border border-purple-200'
          : 'bg-blue-100 text-blue-800 border border-blue-200'
      } ${className}`}
    >
      {isAdmin ? '⚡ Admin' : '👤 User'}
    </span>
  )
}
