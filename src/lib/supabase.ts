import { createClient, type SupabaseClient } from "@supabase/supabase-js"

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!url || !anonKey) {
  console.warn(
    "Supabase env vars missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.",
  )
}

export const supabase: SupabaseClient = createClient(url ?? "", anonKey ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export function hasSupabaseConfig(): boolean {
  return Boolean(url && anonKey)
}
