// Edge Function: administración de usuarios. Solo gerencia. Usa la clave de servicio, que nunca sale del servidor.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const ROLES = ['gerencia', 'administrador', 'vendedor', 'cajero', 'consulta']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: { user } } = await admin.auth.getUser(token)
    if (!user) return json({ error: 'Sesión no válida' }, 401)
    const { data: yo } = await admin.from('perfiles').select('rol,activo').eq('id', user.id).single()
    if (!yo || !yo.activo || yo.rol !== 'gerencia') return json({ error: 'Solo gerencia puede administrar usuarios' }, 403)
    const b = await req.json()
    const auditar = (operacion: string, registro: string, posterior: unknown) =>
      admin.from('auditoria').insert({ usuario_id: user.id, tabla: 'perfiles', registro_id: registro, operacion, posterior })

    if (b.accion === 'crear') {
      const email = String(b.email ?? '').trim().toLowerCase(), nombre = String(b.nombre ?? '').trim(), sedes: string[] = b.sedes ?? []
      if (!email.includes('@') || !nombre) return json({ error: 'Faltan el nombre o el correo' }, 400)
      if (typeof b.password !== 'string' || b.password.length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400)
      if (!ROLES.includes(b.rol)) return json({ error: 'Rol no válido' }, 400)
      if (b.rol !== 'gerencia' && sedes.length === 0) return json({ error: 'Asigne al menos una sede' }, 400)
      const acceso = ['gerencia', 'administrador'].includes(b.rol) ? 'administrativo' : 'operativo'
      const { data: c, error: e1 } = await admin.auth.admin.createUser({ email, password: b.password, email_confirm: true })
      if (e1) return json({ error: /already|registered/i.test(e1.message) ? 'Ya existe un usuario con ese correo' : e1.message }, 400)
      const id = c.user.id
      const { error: e2 } = await admin.from('perfiles').insert({ id, nombre, rol: b.rol, acceso, correo: email })
      if (e2) { await admin.auth.admin.deleteUser(id); return json({ error: e2.message }, 400) }
      if (sedes.length) {
        const { error: e3 } = await admin.from('usuario_sedes').insert(sedes.map((s) => ({ usuario_id: id, sede_id: s })))
        if (e3) { await admin.from('perfiles').delete().eq('id', id); await admin.auth.admin.deleteUser(id); return json({ error: e3.message }, 400) }
      }
      await auditar('CREAR_USUARIO', id, { correo: email, rol: b.rol, sedes })
      return json({ ok: true, id })
    }
    if (b.accion === 'clave') {
      if (typeof b.password !== 'string' || b.password.length < 8) return json({ error: 'La contraseña debe tener al menos 8 caracteres' }, 400)
      const { error } = await admin.auth.admin.updateUserById(b.id, { password: b.password })
      if (error) return json({ error: error.message }, 400)
      await auditar('RESTABLECER_CLAVE', b.id, null)
      return json({ ok: true })
    }
    return json({ error: 'Acción no válida' }, 400)
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500) }
})
