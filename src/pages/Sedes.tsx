import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useTitulo } from '../components'

export default function Sedes() {
  useTitulo('Sedes'); const { perfil } = useAuth(); const [r, setR] = useState<any[] | null>(null); const [cod, setCod] = useState(''); const [nom, setNom] = useState(''); const [err, setErr] = useState('')
  const cargar = useCallback(async () => { const { data } = await supabase.from('sedes').select('id,codigo,nombre,activa').order('codigo'); setR(data ?? []) }, [])
  useEffect(() => { cargar() }, [cargar])
  if (perfil?.rol !== 'gerencia') return <div className="msg">Solo gerencia puede administrar sedes.</div>
  const ok = /^[A-Z]{2,5}$/.test(cod) && nom.trim()
  const crear = async () => { setErr(''); const { error } = await supabase.from('sedes').insert({ codigo: cod, nombre: nom.trim() }); if (error) setErr(error.message.includes('duplicate') ? 'Ya existe una sede con ese código' : error.message); else { setCod(''); setNom(''); cargar() } }
  const estado = async (s: any) => { const { error } = await supabase.from('sedes').update({ activa: !s.activa }).eq('id', s.id); error ? setErr(error.message) : cargar() }
  return (<><h1>Sedes</h1><p className="sub">Cada sede tiene su propio consecutivo: el código es el prefijo de sus números (por ejemplo CAD-00001). El código no se puede cambiar después.</p>
    <div className="item"><h2 style={{ marginTop: 0 }}>Nueva sede</h2><div className="f"><label>Código (2 a 5 letras mayúsculas)<input value={cod} maxLength={5} onChange={e => setCod(e.target.value.toUpperCase())} /></label><label>Nombre de la sede<input value={nom} onChange={e => setNom(e.target.value)} /></label></div>
      <div className="bar" style={{ marginTop: 12 }}><button className="p" disabled={!ok} onClick={crear}>Crear sede</button></div></div>
    {err && <div className="msg" role="alert">{err}</div>}
    <div className="sc"><table><caption className="sr">Sedes</caption><thead><tr><th scope="col">Código</th><th scope="col">Nombre</th><th scope="col">Estado</th><th scope="col"><span className="sr">Acciones</span></th></tr></thead>
      <tbody>{r?.map(s => <tr key={s.id}><td><b>{s.codigo}</b></td><td>{s.nombre}</td><td><span className={`chip ${s.activa ? 'ok' : 'er'}`}>{s.activa ? 'Activa' : 'Inactiva'}</span></td><td><button className="sm" onClick={() => estado(s)}>{s.activa ? 'Desactivar' : 'Activar'}</button></td></tr>)}</tbody></table>
      {r && r.length === 0 && <div className="empty">Aún no hay sedes.</div>}</div></>)
}
