import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { cop } from '../lib/types'
import { Chip, ev } from '../components'

// Página pública del QR: solo lectura, sin cédula, teléfono ni dirección.
export default function Publico() {
  const { token } = useParams(); const [d, setD] = useState<any>(null); const [fallo, setFallo] = useState(false)
  useEffect(() => { supabase.rpc('consulta_publica', { p_token: token }).then(({ data, error }) => (error || !data) ? setFallo(true) : setD(data)) }, [token])
  return (<div className="pub"><div className="brand">Credicauca S.A.S.<small>Consulta de separado</small></div>
    {fallo && <div className="msg">No encontramos este separado. Verifique el código QR.</div>}
    {!d && !fallo && <p className="empty">Cargando…</p>}
    {d && <><div className="bar" style={{ margin: '18px 0 6px' }}><h2>{d.numero}</h2><Chip e={ev(d.estado, d.saldo)} /></div>
      <div className="eq"><div><span>Valor total</span><b>{cop(d.valor_total)}</b></div><div><span>Abonos confirmados</span><b>{cop(d.abonos_confirmados)}</b></div><div className="key"><span>Saldo</span><b>{cop(d.saldo)}</b></div></div>
      <h3>Artículos</h3><div className="sc"><table><tbody>{(d.articulos ?? []).map((a: any, i: number) => <tr key={i}><td>{a.descripcion}</td><td className="r">x{a.cantidad}</td></tr>)}</tbody></table></div>
      <p className="hint">Solo consulta. Para cualquier cambio comuníquese con la tienda.</p></>}</div>)
}
