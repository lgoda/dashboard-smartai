import { createClient } from '@/utils/supabase/client'
import { UserProfile, UserRole } from '@/types/database'

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error('Error fetching user profile:', error)
    return null
  }

  return data
}

export async function createUserProfile(userId: string, role: UserRole = 'user', clientId: string | null = null): Promise<UserProfile | null> {
  const supabase = createClient()

  const { data, error } = await supabase
    .from('user_profiles')
    .insert({
      id: userId,
      role,
      client_id: clientId
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating user profile:', error)
    return null
  }

  return data
}

export async function updateUserRole(userId: string, role: UserRole, clientId: string | null = null): Promise<boolean> {
  const supabase = createClient()

  const { error } = await supabase
    .from('user_profiles')
    .update({
      role,
      client_id: role === 'admin' ? null : clientId
    })
    .eq('id', userId)

  if (error) {
    console.error('Error updating user role:', error)
    return false
  }

  return true
}

export function isAdmin(profile: UserProfile | null): boolean {
  return profile?.role === 'admin'
}

export function isUser(profile: UserProfile | null): boolean {
  return profile?.role === 'user'
}

export function hasClientAccess(profile: UserProfile | null): boolean {
  return profile?.role === 'admin' || (profile?.role === 'user' && profile?.client_id !== null)
}
