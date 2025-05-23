import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import type { Database } from './client'

// Server-side auth helper
export const createServerSupabaseClient = () => {
  const cookieStore = cookies()
  return createServerComponentClient<Database>({ cookies: () => cookieStore })
}

// Get current user on server
export async function getCurrentUser() {
  const supabase = createServerSupabaseClient()
  
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    
    if (error) {
      console.error('Error getting user:', error)
      return null
    }
    
    return user
  } catch (error) {
    console.error('Error in getCurrentUser:', error)
    return null
  }
}

// Get current user with profile data
export async function getCurrentUserProfile() {
  const supabase = createServerSupabaseClient()
  
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return null
    }
    
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()
    
    if (profileError) {
      console.error('Error getting user profile:', profileError)
      return null
    }
    
    return { user, profile }
  } catch (error) {
    console.error('Error in getCurrentUserProfile:', error)
    return null
  }
}

// Require authentication (redirect if not authenticated)
export async function requireAuth() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/auth/login')
  }
  
  return user
}

// Require admin role
export async function requireAdmin() {
  const userProfile = await getCurrentUserProfile()
  
  if (!userProfile || userProfile.profile.role !== 'admin') {
    redirect('/unauthorized')
  }
  
  return userProfile
}
