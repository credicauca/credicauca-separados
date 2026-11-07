import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { cop } from '../lib/types'

const TIPO: Record<string, [string, string]> = { vencido: ['Vencido', 'er'], proximo_a_vencer: ['Próximo a vencer', 'wn'], saldo_pendiente: ['Saldo pendiente', ''], pagado_pendiente_entrega: ['Pagado, pendiente de entrega', 'ok'] }
export default function Alertas() {
  const [r, setR] = useState<any[] | null>(null)
  useEffect(() => { supabase.from('v_alertas').select('id,numero,fecha_limite,saldo,tipo').not('tipo', 'is', null).order('fecha_limite').then(({ data }) => setR(data ?? [])) }, [])
  return (<><h2>Alertas</h2><p className="sub">Los separados nunca se cancelan solos: aquí solo se avisa.</p>
    <div className="sc"><table><thead><tr><th>Alerta</th><th>Separado</th><th>Fecha límite</th><th className="r">Saldo</th></tr></thead><tbody>
      {r?.map(a => <tr key={a.id + a.tipo}><td><span className={`chip ${TIPO[a.tipo]?.[1]}`}>{TIPO[a.tipo]?.[0]}</span></td><td><Link to={`/separado/${a.id}`}><b>{a.numero}</b></Link></td>
        <td>{new Date(a.fecha_limite + 'T00:00').toLocaleDateString('es-CO')}</td><td className="r">{cop(a.saldo)}</td></tr>)}</tbody></table>
      {r && r.length === 0 && <div className="empty">Sin alertas.</div>}{!r && <div className="empty">Cargando…</div>}</div></>)
}
