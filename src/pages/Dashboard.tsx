import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { cop, METODOS, Saldo, Separado } from '../lib/types'
import { ev, plazo, useTitulo } from '../components'

type F = Separado & { s?: Saldo }
export default function Dashboard() {
  useTitulo('Panel'); const [f, setF] = useState<F[] | null>(null); const [pg, setPg] = useState<any[]>([]); const [pv, setPv] = useState({ n: 0, v: 0 }); const [err, setErr] = useState('')
  useEffect(() => { (async () => {
    const a = await supabase.from('separados').select('id,numero,valor_total,fecha_limite,estado,sede_id')
    if (a.error) return setErr(a.error.message)
    const { data: sal } = await supabase.from('v_separados_saldo').select('*').in('id', (a.data ?? []).map(d => d.id))
    const m = new Map((sal as Saldo[] ?? []).map(x => [x.id, x]))
    setF((a.data as unknown as Separado[]).map(d => ({ ...d, s: m.get(d.id) })))
    const c = await supabase.from('abono_pagos').select('valor,metodo_id,abonos(fecha)').eq('estado', 'confirmado'); setPg(c.data ?? [])
    const p = await supabase.from('abono_pagos').select('valor').eq('estado', 'pendiente_verificacion')
    setPv({ n: (p.data ?? []).length, v: (p.data ?? []).reduce((x: number, y: any) => x + Number(y.valor), 0) })
  })() }, [])
  if (err) return <div className="msg" role="alert">{err}</div>
  if (!f) return <p className="empty">Cargando…</p>
  const vivos = f.filter(x => x.estado !== 'cancelado')
  const abiertos = vivos.filter(x => ev(x.estado, x.s?.saldo) !== 'entregado' && (x.s?.saldo ?? 1) > 0)
  const venc = abiertos.filter(x => plazo(x.fecha_limite).dias < 0).length, pronto = abiertos.filter(x => { const d = plazo(x.fecha_limite).dias; return d >= 0 && d <= 7 }).length
  const entregar = vivos.filter(x => ev(x.estado, x.s?.saldo) === 'pendiente_entrega').length
  const tot = vivos.reduce((a, x) => a + Number(x.valor_total), 0), rec = vivos.reduce((a, x) => a + Number(x.s?.recibido_confirmado ?? 0), 0)
  const d0 = new Date(); d0.setHours(0, 0, 0, 0); const sem = new Date(d0); sem.setDate(d0.getDate() - ((d0.getDay() + 6) % 7)); const mes = new Date(d0.getFullYear(), d0.getMonth(), 1)
  const suma = (desde: Date) => pg.filter(x => new Date(x.abonos?.fecha) >= desde).reduce((a, x) => a + Number(x.valor), 0)
  const porMetodo = METODOS.map(m => [m.nombre, pg.filter(x => x.metodo_id === m.id).reduce((a, x) => a + Number(x.valor), 0)] as const).filter(x => x[1] > 0)
  const Fila = ({ n, t, to, tono, extra }: { n: number; t: string; to: string; tono: string; extra?: string }) => (n > 0
    ? <li><Link to={to} className="todo"><b className={tono}>{n}</b><span>{t}{extra ? <small>{extra}</small> : null}</span><i aria-hidden="true">›</i></Link></li>
    : <li><div className="todo off"><b>0</b><span>{t}</span></div></li>)
  return (<><div className="top-r"><div><h1>Panel</h1><p className="sub">Resumen de las sedes que su usuario puede ver.</p></div><Link className="btn" to="/crear">Crear separado</Link></div>
    <div className="eq"><div><span>Mercancía separada</span><b>{cop(tot)}</b></div><i>−</i><div><span>Dinero recibido (confirmado)</span><b>{cop(rec)}</b></div><i>=</i><div className="key"><span>Saldo pendiente</span><b>{cop(tot - rec)}</b></div></div>
    <div className="g2"><section><h2>Por hacer</h2><ul className="todos" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      <Fila n={pv.n} t="transferencias por verificar" extra={cop(pv.v)} to="/pagos?f=pendiente_verificacion" tono="wn" />
      <Fila n={venc} t="separados vencidos con saldo" to="/separados?f=vencidos" tono="er" />
      <Fila n={pronto} t="vencen en los próximos 7 días" to="/separados?f=vencen" tono="wn" />
      <Fila n={entregar} t="pagados, listos para entregar" to="/separados?f=por_entregar" tono="ok" /></ul></section>
      <section><h2>Recaudo confirmado</h2><div className="sc"><table><caption className="sr">Recaudo confirmado por periodo y método</caption><tbody>
        <tr><th scope="row">Hoy</th><td className="r">{cop(suma(d0))}</td></tr><tr><th scope="row">Esta semana</th><td className="r">{cop(suma(sem))}</td></tr><tr><th scope="row">Este mes</th><td className="r">{cop(suma(mes))}</td></tr>
        {porMetodo.map(([n, v]) => <tr key={n}><td className="mu">{n}</td><td className="r mu">{cop(v)}</td></tr>)}</tbody></table></div>
        <p className="hint">Cifras brutas: no descuentan reversos ni devoluciones.</p></section></div></>)
}
