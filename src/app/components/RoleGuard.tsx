'use client'

import { ReactNode } from 'react'
import { useUserRole } from '@/hooks/useUserRole'
import { UserRole } from '@/types/database'

type RoleGuardProps = {
  children: ReactNode
  allowedRoles: UserRole[]
  fallback?: ReactNode
}

export default function RoleGuard({ children, allowedRoles, fallback = null }: RoleGuardProps) {
  const { role, isLoading } = useUserRole()

  if (isLoading) {
    return null
  }

  if (!role || !allowedRoles.includes(role)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}
