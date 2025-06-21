import { createClient } from '@supabase/supabase-js'

// Fallback values to prevent crashes during development
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

// Only create the client if we have valid environment variables
let supabase: any = null

try {
  if (supabaseUrl !== 'https://placeholder.supabase.co' && supabaseAnonKey !== 'placeholder-key') {
    supabase = createClient(supabaseUrl, supabaseAnonKey)
  } else {
    // Create a mock client that won't crash the app
    supabase = {
      auth: {
        getUser: () => Promise.resolve({ data: { user: null }, error: new Error('Supabase not configured') }),
        getSession: () => Promise.resolve({ data: { session: null }, error: new Error('Supabase not configured') }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signOut: () => Promise.resolve({ error: new Error('Supabase not configured') })
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: [], error: new Error('Supabase not configured') })
          })
        })
      })
    }
  }
} catch (error) {
  console.error('Failed to initialize Supabase client:', error)
  // Fallback mock client
  supabase = {
    auth: {
      getUser: () => Promise.resolve({ data: { user: null }, error: new Error('Supabase not configured') }),
      getSession: () => Promise.resolve({ data: { session: null }, error: new Error('Supabase not configured') }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: () => Promise.resolve({ error: new Error('Supabase not configured') })
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: [], error: new Error('Supabase not configured') })
        })
      })
    })
  }
}

export { supabase }