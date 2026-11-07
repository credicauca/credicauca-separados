import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Auditoria() {
  const [r, setR] = useState<any[] | null>(null); const [n, setN] = useState<Record<string, string>>({}); const [err, setErr] = useState('')
  useEffect(() => { (async () => {
    const a = await supabase.from('auditoria').select('id,creado_en,usuario_id,tabla,operacion,registro_id').order('id', { ascending: false }).limit(150)
    if (a.error) return setErr(a.error.message)
    const p = await supabase.from('perfiles').select('id,nombre')
    setN(Object.fromEntries((p.data ?? []).map((x: any) => [x.id, x.nombre]))); setR(a.data)
  })() }, [])
  return (<><h2>Auditoría</h2><p className="sub">Solo lectura. Últimos 150 eventos. Nadie puede borrar ni editar este registro.</p>
    {err && <div className="msg" role="alert">{err}</div>}
    <div className="sc"><table><thead><tr><th>Fecha</th><th>Usuario</th><th>Tabla</th><th>Operación</th></tr></thead><tbody>
      {r?.map(e => <tr key={e.id}><td>{new Date(e.creado_en).toLocaleString('es-CO')}</td><td>{n[e.usuario_id] ?? 'Sistema'}</td><td>{e.tabla}</td><td>{e.operacion}</td></tr>)}</tbody></table>
      {r && r.length === 0 && <div className="empty">Sin eventos.</div>}</div></>)
}
