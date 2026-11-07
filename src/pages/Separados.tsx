import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { cop, Separado, Saldo } from '../lib/types'
import { Chip, ev, plazo, useTitulo } from '../components'

type F = Separado & { s?: Saldo; clientes: { nombre: string; documento: string } | null }
const cat = (f: F) => {
  const e = ev(f.estado, f.s?.saldo), abierto = e !== 'cancelado' && e !== 'entregado' && (f.s?.saldo ?? 1) > 0, d = plazo(f.fecha_limite).dias
  return { abierto, vencido: abierto && d < 0, pronto: abierto && d >= 0 && d <= 7, entregar: e === 'pendiente_entrega', entregado: e === 'entregado', cancelado: e === 'cancelado' }
}
type C = ReturnType<typeof cat>
export const FILTROS: [string, string, (c: C) => boolean][] = [['todos', 'Todos', () => true], ['por_cobrar', 'Por cobrar', c => c.abierto], ['vencidos', 'Vencidos', c => c.vencido],
  ['vencen', 'Vencen en 7 días', c => c.pronto], ['por_entregar', 'Por entregar', c => c.entregar], ['entregados', 'Entregados', c => c.entregado], ['cancelados', 'Cancelados', c => c.cancelado]]

export default function Separados() {
  useTitulo('Separados')
  const [filas, setFilas] = useState<F[] | null>(null); const [err, setErr] = useState(''); const [q, setQ] = useState('')
  const [sp, setSp] = useSearchParams(); const fid = sp.get('f') ?? 'todos'
  useEffect(() => { (async () => {
    // RLS decide qué sedes y separados ve cada usuario; aquí no se filtra por seguridad.
    const { data, error } = await supabase.from('separados').select('id,numero,valor_total,fecha_limite,estado,sede_id,clientes(nombre,documento)').order('fecha_creacion', { ascending: false })
    if (error) return setErr(error.message)
    const { data: sal } = await supabase.from('v_separados_saldo').select('*').in('id', (data ?? []).map(d => d.id))
    const m = new Map((sal as Saldo[] ?? []).map(x => [x.id, x]))
    setFilas((data as unknown as F[]).map(d => ({ ...d, s: m.get(d.id) })))
  })() }, [])
  const cuentas = useMemo(() => Object.fromEntries(FILTROS.map(([k, , fn]) => [k, (filas ?? []).filter(f => fn(cat(f))).length])), [filas])
  const fn = FILTROS.find(x => x[0] === fid)?.[2] ?? (() => true), t = q.trim().toLowerCase()
  const vista = (filas ?? []).filter(f => fn(cat(f)) && (!t || [f.numero, f.clientes?.nombre, f.clientes?.documento].some(x => x?.toLowerCase().includes(t))))
    .sort((a, b) => fid === 'todos' ? 0 : a.fecha_limite.localeCompare(b.fecha_limite))
  return (<><div className="top-r"><div><h1>Separados</h1><p className="sub">Busque por número, nombre o cédula. Use los filtros para ver qué requiere acción.</p></div><Link className="btn" to="/crear">Crear separado</Link></div>
    <input type="search" className="find" aria-label="Buscar separado por número, nombre o cédula" placeholder="Buscar por número, nombre o cédula" value={q} onChange={e => setQ(e.target.value)} />
    <div className="chips" role="group" aria-label="Filtrar separados">{FILTROS.map(([k, t2]) => <button key={k} type="button" className="fchip" aria-pressed={fid === k} onClick={() => setSp(k === 'todos' ? {} : { f: k }, { replace: true })}>{t2} <span>{cuentas[k] ?? 0}</span></button>)}</div>
    {err && <div className="msg" role="alert">{err}</div>}
    <p className="hint" role="status" style={{ margin: '0 0 8px' }}>{filas ? `${vista.length} ${vista.length === 1 ? 'separado' : 'separados'}` : 'Cargando…'}</p>
    <div className="sc"><table><caption className="sr">Lista de separados</caption><thead><tr><th scope="col">Número</th><th scope="col">Cliente</th><th scope="col" className="r">Total</th><th scope="col" className="r">Saldo</th><th scope="col">Plazo</th><th scope="col">Estado</th></tr></thead>
      <tbody>{vista.map(f => { const c = cat(f), p = plazo(f.fecha_limite); return (<tr key={f.id}>
        <td><Link to={`/separado/${f.id}`}><b>{f.numero ?? 'Provisional'}</b></Link></td><td>{f.clientes?.nombre}</td>
        <td className="r">{cop(f.valor_total)}</td><td className="r"><b>{cop(f.s?.saldo ?? f.valor_total)}</b></td>
        <td>{c.abierto ? <span className={`pl ${p.tono}`}>{p.t}</span> : '—'}</td><td><Chip e={ev(f.estado, f.s?.saldo)} /></td></tr>) })}</tbody></table>
      {filas && vista.length === 0 && <div className="empty">{filas.length === 0 ? 'Aún no hay separados. Cree el primero con el botón de arriba.' : 'Ningún separado coincide. '}{filas.length > 0 && <button className="sm" onClick={() => { setQ(''); setSp({}) }}>Quitar filtros</button>}</div>}</div></>)
}
