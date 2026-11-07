import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { cop } from '../lib/types'
import { PagosForm, filaVacia, resumenPagos, useTitulo } from '../components'

const MIN = 50000
const CATS = ['Colchones', 'Camas', 'Bases', 'Armarios', 'Juegos de alcoba', 'Salas', 'Comedores', 'Cabeceros', 'Electrodomésticos', 'Otros']
const en = (d: number) => { const x = new Date(); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10) }
interface Item { categoria: string; descripcion: string; marca: string; referencia: string; medida: string; cantidad: number; precio: number; descuento: number }
const vacio = (): Item => ({ categoria: 'Colchones', descripcion: '', marca: '', referencia: '', medida: '', cantidad: 1, precio: 0, descuento: 0 })

export default function CrearSeparado() {
  useTitulo('Crear separado'); const nav = useNavigate()
  const [sedes, setSedes] = useState<{ id: string; codigo: string; nombre: string }[]>([]); const [sede, setSede] = useState('')
  const [cli, setCli] = useState({ documento: '', nombre: '', celular: '', direccion: '' }); const [existe, setExiste] = useState(false)
  const [items, setItems] = useState<Item[]>([vacio()]); const [rows, setRows] = useState([filaVacia()])
  const [limite, setLimite] = useState(en(60)); const [obs, setObs] = useState(''); const [err, setErr] = useState(''); const [env, setEnv] = useState(false)
  const [pid] = useState(() => crypto.randomUUID()) // mismo id en reintentos: no se duplica el separado
  useEffect(() => { supabase.from('sedes').select('id,codigo,nombre').eq('activa', true).then(({ data }) => { const d = data ?? []; setSedes(d); if (d.length === 1) setSede(d[0].id) }) }, [])
  const buscar = async () => {
    if (!cli.documento.trim()) return
    const { data } = await supabase.from('clientes').select('nombre,celular,direccion').eq('documento', cli.documento.trim()).maybeSingle()
    if (data) { setCli({ ...cli, nombre: data.nombre, celular: data.celular, direccion: data.direccion ?? '' }); setExiste(true) } else setExiste(false)
  }
  const set = (i: number, k: keyof Item, v: string | number) => setItems(items.map((x, j) => j === i ? { ...x, [k]: v } : x))
  const total = items.reduce((a, i) => a + i.cantidad * i.precio - i.descuento, 0)
  const { pagos, total: abono, porVerificar, sinRef } = resumenPagos(rows)
  const faltas = [!sede && 'Elegir la sede', !cli.documento.trim() && 'Cédula o NIT', !cli.nombre.trim() && 'Nombre del cliente', !cli.celular.trim() && 'Celular',
    items.some(i => !i.descripcion.trim() || i.cantidad < 1 || i.precio <= 0) && 'Descripción, cantidad y precio de cada artículo', total > 0 && abono < MIN && `Abono inicial de al menos ${cop(MIN)}`,
    abono > total && 'El abono no puede superar el valor total', sinRef && 'Referencia bancaria del pago', !limite && 'Fecha límite'].filter(Boolean) as string[]
  const guardar = async () => {
    setEnv(true); setErr('')
    const { data, error } = await supabase.rpc('crear_separado', { p_id: pid, p_sede: sede, p_documento: cli.documento, p_nombre: cli.nombre, p_celular: cli.celular, p_direccion: cli.direccion, p_items: items, p_fecha_limite: limite, p_obs: obs, p_pagos: pagos })
    if (error) { setErr(error.message); setEnv(false) } else nav(`/separado/${data}/imprimir?nuevo=1`)
  }
  const N = ({ n, t }: { n: number; t: string }) => <h2 className="step"><span aria-hidden="true">{n}</span>{t}</h2>
  return (<><h1>Crear separado</h1><p className="sub">Cuatro pasos. El consecutivo y el saldo los calcula el sistema.</p>
    {sedes.length === 0 && <div className="msg">Su usuario no tiene sedes asignadas. Pida a gerencia que lo asigne a una sede.</div>}
    <N n={1} t="Cliente" />
    <div className="f">{sedes.length > 1 && <label>Sede<select value={sede} onChange={e => setSede(e.target.value)}><option value="">Elegir…</option>{sedes.map(s => <option key={s.id} value={s.id}>{s.codigo} · {s.nombre}</option>)}</select></label>}
      <label>Cédula o NIT<input value={cli.documento} onChange={e => { setCli({ ...cli, documento: e.target.value }); setExiste(false) }} onBlur={buscar} /></label>
      <label>Nombre completo<input autoComplete="name" value={cli.nombre} disabled={existe} onChange={e => setCli({ ...cli, nombre: e.target.value })} /></label>
      <label>Celular<input type="tel" autoComplete="tel" value={cli.celular} disabled={existe} onChange={e => setCli({ ...cli, celular: e.target.value })} /></label>
      <label>Dirección (opcional)<input value={cli.direccion} disabled={existe} onChange={e => setCli({ ...cli, direccion: e.target.value })} /></label></div>
    {existe && <p className="hint" role="status">Cliente ya registrado: se usan sus datos guardados.</p>}
    <N n={2} t="Artículos" />
    {items.map((it, i) => (<fieldset className="item" key={i}><legend>Artículo {i + 1}</legend><div className="f">
      <label>Categoría<select value={it.categoria} onChange={e => set(i, 'categoria', e.target.value)}>{CATS.map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Descripción<input value={it.descripcion} onChange={e => set(i, 'descripcion', e.target.value)} /></label>
      <label>Cantidad<input type="number" min="1" value={it.cantidad} onChange={e => set(i, 'cantidad', +e.target.value)} /></label>
      <label>Precio unitario<input type="number" min="0" value={it.precio || ''} onChange={e => set(i, 'precio', +e.target.value)} /></label>
      <label>Marca (opcional)<input value={it.marca} onChange={e => set(i, 'marca', e.target.value)} /></label>
      <label>Referencia (opcional)<input value={it.referencia} onChange={e => set(i, 'referencia', e.target.value)} /></label>
      <label>Medida (opcional)<input value={it.medida} placeholder="Ej. 140 x 190" onChange={e => set(i, 'medida', e.target.value)} /></label>
      <label>Descuento en valor (opcional)<input type="number" min="0" value={it.descuento || ''} onChange={e => set(i, 'descuento', +e.target.value)} /></label></div>
      <div className="bar" style={{ marginTop: 10, justifyContent: 'space-between' }}><b>Total del artículo: {cop(it.cantidad * it.precio - it.descuento)}</b>
        {items.length > 1 && <button type="button" className="sm" onClick={() => setItems(items.filter((_, j) => j !== i))}>Quitar artículo {i + 1}</button>}</div></fieldset>))}
    <button type="button" onClick={() => setItems([...items, vacio()])}>Agregar otro artículo</button>
    <N n={3} t="Abono inicial" /><PagosForm rows={rows} setRows={setRows} />
    <N n={4} t="Plazo y notas" /><div className="f"><label>Fecha límite<input type="date" value={limite} onChange={e => setLimite(e.target.value)} /></label><label>Observaciones (opcional)<input value={obs} onChange={e => setObs(e.target.value)} /></label></div>
    {err && <div className="msg" role="alert">{err}</div>}
    <div className="sum"><div className="eq" style={{ margin: 0, padding: 0, border: 0, gap: '4px 22px' }}><div><span>Valor total</span><b>{cop(total)}</b></div><div><span>Abono inicial</span><b>{cop(abono)}</b></div><div className="key"><span>Saldo</span><b>{cop(Math.max(0, total - (abono - porVerificar)))}</b></div></div>
      <div><p role="status">{faltas.length ? `Falta: ${faltas.join('. ')}.` : porVerificar > 0 ? 'Listo. La transferencia queda por verificar.' : 'Listo para guardar.'}</p><button className="p" disabled={faltas.length > 0 || env} onClick={guardar}>{env ? 'Guardando…' : 'Guardar e imprimir'}</button></div></div></>)
}
