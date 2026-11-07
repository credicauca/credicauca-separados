import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { claveNueva, msgErr, useTitulo } from '../components'
import type { Rol } from '../lib/types'

const ROLES: [Rol, string, string][] = [['vendedor', 'Vendedor', 'Crea separados, registra abonos y ve solo los suyos.'], ['cajero', 'Cajero', 'Registra abonos y verifica transferencias.'],
  ['consulta', 'Consulta', 'Solo lectura. No puede modificar nada.'], ['administrador', 'Administrador', 'Supervisa las sedes que se le asignen.'], ['gerencia', 'Gerencia', 'Ve todas las sedes y administra usuarios.']]
type Panel = null | { k: 'nuevo' } | { k: 'editar'; u: any } | { k: 'clave'; u: any }
const acceso = (r: Rol) => r === 'gerencia' || r === 'administrador' ? 'administrativo' : 'operativo'

export default function Usuarios() {
  useTitulo('Usuarios'); const { perfil } = useAuth()
  const [us, setUs] = useState<any[] | null>(null); const [sedes, setSedes] = useState<any[]>([]); const [map, setMap] = useState<Record<string, string[]>>({})
  const [panel, setPanel] = useState<Panel>(null); const [f, setF] = useState({ nombre: '', correo: '', pass: claveNueva(), rol: 'vendedor' as Rol, sedes: [] as string[] })
  const [err, setErr] = useState(''); const [ok, setOk] = useState<null | { t: string; correo: string; pass: string }>(null); const [env, setEnv] = useState(false)
  const cargar = useCallback(async () => {
    const a = await supabase.from('perfiles').select('id,nombre,correo,rol,activo').order('nombre')
    const b = await supabase.from('usuario_sedes').select('usuario_id,sede_id'); const c = await supabase.from('sedes').select('id,codigo,nombre').order('codigo')
    if (a.error) return setErr(a.error.message)
    const m: Record<string, string[]> = {}; (b.data ?? []).forEach((x: any) => { (m[x.usuario_id] = m[x.usuario_id] || []).push(x.sede_id) })
    setUs(a.data); setSedes(c.data ?? []); setMap(m)
  }, [])
  useEffect(() => { cargar() }, [cargar])
  if (perfil?.rol !== 'gerencia') return <div className="msg">Solo gerencia puede administrar usuarios.</div>
  const abrir = (p: Panel, u?: any) => { setErr(''); setOk(null); setF({ nombre: '', correo: '', pass: claveNueva(), rol: u?.rol ?? 'vendedor', sedes: u ? map[u.id] ?? [] : [] }); setPanel(p) }
  const tog = (id: string) => setF({ ...f, sedes: f.sedes.includes(id) ? f.sedes.filter(x => x !== id) : [...f.sedes, id] })
  const run = async (fn: () => Promise<string | null>, exito?: () => void) => { setEnv(true); setErr(''); const e = await fn(); setEnv(false); if (e) setErr(e); else { setPanel(null); exito?.(); cargar() } }
  const invocar = async (body: object) => { const { error } = await supabase.functions.invoke('admin-usuarios', { body }); return error ? await msgErr(error) : null }
  const sinSede = f.rol !== 'gerencia' && f.sedes.length === 0
  const rolSedes = (<><fieldset className="opts"><legend>Rol</legend>{ROLES.map(([k, t, d]) => <label key={k} className="opt"><input type="radio" name="rol" checked={f.rol === k} onChange={() => setF({ ...f, rol: k })} /><span><b>{t}</b><small>{d}</small></span></label>)}</fieldset>
    <fieldset className="opts" style={{ marginTop: 12 }}><legend>Sedes a las que puede entrar {f.rol === 'gerencia' && '(gerencia ve todas)'}</legend>
      {sedes.length === 0 && <p className="hint">Primero cree una sede en la sección Sedes.</p>}
      {sedes.map(s => <label key={s.id} className="chk" style={{ margin: '4px 0' }}><input type="checkbox" checked={f.sedes.includes(s.id)} disabled={f.rol === 'gerencia'} onChange={() => tog(s.id)} />{s.codigo} · {s.nombre}</label>)}</fieldset></>)
  const faltas = [!f.nombre.trim() && 'Nombre', !f.correo.includes('@') && 'Correo válido', f.pass.length < 8 && 'Contraseña de 8 caracteres o más', sinSede && 'Al menos una sede'].filter(Boolean) as string[]
  return (<><div className="top-r"><div><h1>Usuarios</h1><p className="sub">Cada persona entra con su propia cuenta. No comparta cuentas.</p></div><button className="p" onClick={() => abrir({ k: 'nuevo' })}>Nuevo usuario</button></div>
    {ok && <div className="item" role="status"><h2 style={{ marginTop: 0 }}>{ok.t}</h2><p>Entregue estos datos a la persona. La contraseña no se vuelve a mostrar y debe cambiarla en <b>Mi cuenta</b>.</p>
      <p><b>Correo:</b> {ok.correo}<br /><b>Contraseña temporal:</b> <code>{ok.pass}</code></p><button onClick={() => navigator.clipboard?.writeText(`Correo: ${ok.correo}\nContraseña temporal: ${ok.pass}`)}>Copiar datos</button></div>}
    {err && <div className="msg" role="alert">{err}</div>}
    {panel?.k === 'nuevo' && <section className="item" aria-label="Nuevo usuario"><h2 style={{ marginTop: 0 }}>Nuevo usuario</h2><div className="f">
      <label>Nombre completo<input autoFocus value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} /></label><label>Correo (será su usuario)<input type="email" value={f.correo} onChange={e => setF({ ...f, correo: e.target.value })} /></label>
      <label>Contraseña temporal<input value={f.pass} onChange={e => setF({ ...f, pass: e.target.value })} /></label></div>
      <button type="button" className="sm" style={{ margin: '8px 0 14px' }} onClick={() => setF({ ...f, pass: claveNueva() })}>Generar otra contraseña</button>{rolSedes}
      <div className="bar" style={{ marginTop: 14 }}><button className="p" disabled={faltas.length > 0 || env} onClick={() => run(() => invocar({ accion: 'crear', email: f.correo, password: f.pass, nombre: f.nombre, rol: f.rol, sedes: f.sedes }), () => setOk({ t: 'Usuario creado', correo: f.correo.trim().toLowerCase(), pass: f.pass }))}>{env ? 'Creando…' : 'Crear usuario'}</button><button onClick={() => setPanel(null)}>Cancelar</button>
        <span className="hint" role="status" style={{ margin: 0 }}>{faltas.length ? `Falta: ${faltas.join(', ')}.` : ''}</span></div></section>}
    {panel?.k === 'editar' && <section className="item" aria-label="Editar usuario"><h2 style={{ marginTop: 0 }}>Editar a {panel.u.nombre}</h2>{rolSedes}
      <div className="bar" style={{ marginTop: 14 }}><button className="p" disabled={sinSede || env} onClick={() => run(async () => {
        const a = await supabase.from('perfiles').update({ rol: f.rol, acceso: acceso(f.rol) }).eq('id', panel.u.id); if (a.error) return a.error.message
        const d = await supabase.from('usuario_sedes').delete().eq('usuario_id', panel.u.id); if (d.error) return d.error.message
        if (f.sedes.length) { const i = await supabase.from('usuario_sedes').insert(f.sedes.map(s => ({ usuario_id: panel.u.id, sede_id: s }))); if (i.error) return i.error.message }
        return null })}>Guardar cambios</button><button onClick={() => setPanel(null)}>Cancelar</button></div></section>}
    {panel?.k === 'clave' && <section className="item" aria-label="Restablecer contraseña"><h2 style={{ marginTop: 0 }}>Nueva contraseña para {panel.u.nombre}</h2>
      <label style={{ maxWidth: 320 }}>Contraseña temporal<input autoFocus value={f.pass} onChange={e => setF({ ...f, pass: e.target.value })} /></label>
      <div className="bar" style={{ marginTop: 12 }}><button className="p" disabled={f.pass.length < 8 || env} onClick={() => run(() => invocar({ accion: 'clave', id: panel.u.id, password: f.pass }), () => setOk({ t: 'Contraseña restablecida', correo: panel.u.correo ?? panel.u.nombre, pass: f.pass }))}>Restablecer</button><button onClick={() => setPanel(null)}>Cancelar</button></div></section>}
    <div className="sc" style={{ marginTop: 14 }}><table><caption className="sr">Usuarios del sistema</caption><thead><tr><th scope="col">Nombre</th><th scope="col">Rol</th><th scope="col">Sedes</th><th scope="col">Estado</th><th scope="col"><span className="sr">Acciones</span></th></tr></thead>
      <tbody>{us?.map(u => { const yo = u.id === perfil.id; return (<tr key={u.id}><td><b>{u.nombre}</b><small className="mu" style={{ display: 'block' }}>{u.correo ?? 'Sin correo guardado'}</small></td>
        <td>{ROLES.find(r => r[0] === u.rol)?.[1]}</td><td>{u.rol === 'gerencia' ? 'Todas' : (map[u.id] ?? []).map(id => sedes.find(s => s.id === id)?.codigo).filter(Boolean).join(', ') || 'Ninguna'}</td>
        <td><span className={`chip ${u.activo ? 'ok' : 'er'}`}>{u.activo ? 'Activo' : 'Desactivado'}</span></td>
        <td><div className="bar" style={{ margin: 0 }}><button className="sm" disabled={yo} onClick={() => abrir({ k: 'editar', u }, u)}>Rol y sedes</button><button className="sm" onClick={() => abrir({ k: 'clave', u })}>Contraseña</button>
          <button className="sm" disabled={yo} onClick={() => run(async () => { const r = await supabase.from('perfiles').update({ activo: !u.activo }).eq('id', u.id); return r.error?.message ?? null })}>{u.activo ? 'Desactivar' : 'Activar'}</button></div></td></tr>) })}</tbody></table>
      {us && us.length === 0 && <div className="empty">No hay usuarios.</div>}</div>
    <p className="hint">Desactivar no borra nada: la persona deja de entrar y sus operaciones anteriores se conservan.</p></>)
}
