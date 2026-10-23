const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

let supabaseClientPromise;

export function getSupabaseClient() {
  if (!isSupabaseConfigured) return Promise.resolve(null);
  supabaseClientPromise ||= import('@supabase/supabase-js').then(({ createClient }) => createClient(supabaseUrl, supabaseAnonKey));
  return supabaseClientPromise;
}
