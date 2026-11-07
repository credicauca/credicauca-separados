import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Perfil, Acceso } from '../lib/types'

interface Ctx { perfil: Perfil | null; cargando: boolean; entrar(email: string, pass: string, acceso: Acceso): Promise<string | null>; salir(): Promise<void> }
const C = createContext<Ctx>(null as never)
export const useAuth = () => useContext(C)

async function cargarPerfil(): Promise<Perfil | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('perfiles').select('id,nombre,rol,acceso').eq('id', user.id).eq('activo', true).single()
  return (data as Perfil) ?? null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [perfil, setPerfil] = useState<Perfil | null>(null)
  const [cargando, setCargando] = useState(true)
  useEffect(() => { cargarPerfil().then(p => { setPerfil(p); setCargando(false) }) }, [])
  const entrar: Ctx['entrar'] = async (email, pass, acceso) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass })
    if (error) return 'Correo o contraseña incorrectos.'
    const p = await cargarPerfil()
    if (!p || p.acceso !== acceso) { await supabase.auth.signOut(); return 'Esta cuenta no tiene ese tipo de acceso.' }
    setPerfil(p); return null
  }
  const salir = async () => { await supabase.auth.signOut(); setPerfil(null) }
  return <C.Provider value={{ perfil, cargando, entrar, salir }}>{children}</C.Provider>
}
