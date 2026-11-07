import { createClient } from '@supabase/supabase-js'
// Solo la clave anon va en el navegador. La seguridad real está en RLS (schema.sql).
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
)
