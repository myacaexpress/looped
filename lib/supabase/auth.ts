import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { Database } from './client'

// Client-side auth helper
export const createClientSupabaseClient = () => {
  return createClientComponentClient<Database>()
}

// Sign up with email and password
export async function signUpWithEmail(email: string, password: string, userData: {
  companyName?: string
  fullName?: string
}) {
  const supabase = createClientSupabaseClient()
  
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: userData.fullName,
        company_name: userData.companyName,
      },
    },
  })
  
  return { data, error }
}

// Sign in with email and password
export async function signInWithEmail(email: string, password: string) {
  const supabase = createClientSupabaseClient()
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  
  return { data, error }
}

// Sign in with Google
export async function signInWithGoogle() {
  const supabase = createClientSupabaseClient()
  
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
    },
  })
  
  return { data, error }
}

// Sign out
export async function signOut() {
  const supabase = createClientSupabaseClient()
  
  const { error } = await supabase.auth.signOut()
  
  if (!error) {
    window.location.href = '/login'
  }
  
  return { error }
}

// Reset password
export async function resetPassword(email: string) {
  const supabase = createClientSupabaseClient()
  
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`,
  })
  
  return { data, error }
}

// Update password
export async function updatePassword(password: string) {
  const supabase = createClientSupabaseClient()
  
  const { data, error } = await supabase.auth.updateUser({
    password,
  })
  
  return { data, error }
}

// Create user profile after signup
export async function createUserProfile(userId: string, profileData: {
  email: string
  fullName?: string
  companyId: string
  role: 'admin' | 'employee'
}) {
  const supabase = createClientSupabaseClient()
  
  const { data, error } = await supabase
    .from('users')
    .insert({
      id: userId,
      email: profileData.email,
      full_name: profileData.fullName,
      company_id: profileData.companyId,
      role: profileData.role,
    })
    .select()
    .single()
  
  return { data, error }
}

// Create company during signup
export async function createCompany(companyData: {
  name: string
  adminUserId: string
}) {
  const supabase = createClientSupabaseClient()
  
  const { data, error } = await supabase
    .from('companies')
    .insert({
      name: companyData.name,
      admin_user_id: companyData.adminUserId,
    })
    .select()
    .single()
  
  return { data, error }
}
