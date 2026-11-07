import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { cop, METODOS, puedeRecaudar, puedeVerificar, Abono, Saldo, Separado } from '../lib/types'
import { Chip, ev, plazo, useTitulo } from '../components'

type Panel = null | { k: 'entrega' } | { k: 'cancelar' } | { k: 'corregir'; id: string; max: number }
const REV: Record<string, string> = { correccion: 'Corrección', reverso: 'Anulación', devolucion: 'Devolución' }
const OPC: [string, string, string][] = [['correccion', 'Me equivoqué al registrar el valor', 'Se descuenta lo registrado de más.'], ['reverso', 'Anular este pago', 'El pago deja de contar como recibido.'], ['devolucion', 'Devolver dinero al cliente', 'Se registra la salida del dinero.']]
export default function Detalle() {
  const { id } = useParams(); const { perfil } = useAuth()
  const [sep, setSep] = useState<(Separado & { ref_facturacion: string | null }) | null>(null); const [items, setItems] = useState<any[]>([])
  const [abonos, setAbonos] = useState<any[]>([]); const [sal, setSal] = useState<Saldo | null>(null); const [cierre, setCierre] = useState<any>(null); const [err, setErr] = useState('')
  const [panel, setPanel] = useState<Panel>(null); const [motivo, setMotivo] = useState(''); const [valor, setValor] = useState(''); const [tipo, setTipo] = useState('correccion')
  const [arts, setArts] = useState(''); const [recibido, setRecibido] = useState(false); const [exc, setExc] = useState(false); const [obs, setObs] = useState(''); const [ref, setRef] = useState('')
  useTitulo(sep?.numero ?? 'Separado')
  const cargar = useCallback(async () => {
    const a = await supabase.from('separados').select('id,numero,valor_total,fecha_limite,estado,sede_id,ref_facturacion,clientes(nombre)').eq('id', id).single()
    if (a.error) return setErr(a.error.message)
    const i = await supabase.from('separado_items').select('descripcion,cantidad,total').eq('separado_id', id)
    const b = await supabase.from('abonos').select('id,fecha,valor,abono_pagos(id,metodo_id,valor,estado,referencia_bancaria,reversos(valor,tipo,motivo))').eq('separado_id', id).order('fecha')
    const c = await supabase.from('v_separados_saldo').select('*').eq('id', id).single()
    const en = await supabase.from('entregas').select('fecha,observaciones,motivo_excepcion').eq('separado_id', id).maybeSingle()
    const ca = await supabase.from('cancelaciones').select('creado_en,motivo').eq('separado_id', id).maybeSingle()
    setSep(a.data as any); setRef((a.data as any).ref_facturacion ?? ''); setItems(i.data ?? []); setArts((i.data ?? []).map((x: any) => `${x.cantidad} x ${x.descripcion}`).join(', '))
    setAbonos(b.data ?? []); setSal(c.data as Saldo); setCierre(en.data ? { t: 'Entregado', f: en.data.fecha, d: [en.data.observaciones, en.data.motivo_excepcion && `Excepción: ${en.data.motivo_excepcion}`].filter(Boolean).join(' · ') } : ca.data ? { t: 'Cancelado', f: ca.data.creado_en, d: ca.data.motivo } : null)
  }, [id])
  useEffect(() => { cargar() }, [cargar])
  const run = async (fn: string, args: object) => { setErr(''); const { error } = await supabase.rpc(fn, args); if (error) setErr(error.message); else { setPanel(null); setMotivo(''); await cargar() } }
  if (!sep || !sal || !perfil) return err ? <div className="msg" role="alert">{err}</div> : <p className="empty">Cargando…</p>
  const r = perfil.rol, admin = r === 'gerencia' || r === 'administrador', cerrado = sep.estado === 'cancelado' || sep.estado === 'entregado', pl = plazo(sep.fecha_limite)
  const abrir = (p: Panel) => { setPanel(panel && p && panel.k === p.k ? null : p); setMotivo(''); setErr('') }
  const sig = sep.estado === 'cancelado' ? { t: 'Este separado está cancelado. Su historial se conserva.', c: '' } : sep.estado === 'entregado' ? { t: 'Mercancía entregada. No hay nada más por hacer.', c: 'ok' }
    : sal.saldo > 0 ? { t: `Falta cobrar ${cop(sal.saldo)}${sal.pendiente_verificacion > 0 ? ` (${cop(sal.pendiente_verificacion)} ya están por verificar)` : ''}. El plazo ${pl.t}.`, c: pl.tono } : { t: 'Pagado por completo. Falta entregar la mercancía.', c: 'ok' }
  return (<><nav aria-label="Ruta" className="sub" style={{ margin: 0 }}><Link to="/separados">Separados</Link> / {sep.numero ?? 'Provisional'}</nav>
    <div className="bar" style={{ margin: '4px 0 4px' }}><h1>{sep.numero ?? 'Provisional'}</h1><Chip e={ev(sep.estado, sal.saldo)} /></div>
    <p className="sub">{sep.clientes?.nombre} · plazo hasta el {new Date(sep.fecha_limite + 'T00:00').toLocaleDateString('es-CO')}</p>
    <div className="eq"><div><span>Mercancía separada</span><b>{cop(sal.valor_total)}</b></div><i>−</i><div><span>Dinero recibido (confirmado)</span><b>{cop(sal.recibido_confirmado)}</b></div><i>=</i><div className="key"><span>Saldo pendiente</span><b>{cop(sal.saldo)}</b></div></div>
    <div className={`next ${sig.c}`}><p>{sig.t}</p><div className="bar" style={{ margin: 0 }}>
      {!cerrado && sal.saldo > 0 && puedeRecaudar(r) && <Link className="btn" to={`/separado/${id}/abono`}>Registrar abono</Link>}
      {!cerrado && sal.saldo <= 0 && r !== 'consulta' && <button className="p" onClick={() => abrir({ k: 'entrega' })}>Registrar entrega</button>}
      <Link className="btn ghost" to={`/separado/${id}/imprimir`}>Imprimir separado</Link>
      {!cerrado && (admin || (r !== 'consulta' && sal.saldo > 0)) && <details className="more"><summary>Más acciones</summary><div>
        {sal.saldo > 0 && r !== 'consulta' && <button onClick={() => abrir({ k: 'entrega' })}>Entregar con saldo pendiente</button>}
        {admin && <button className="danger" onClick={() => abrir({ k: 'cancelar' })}>Cancelar este separado</button>}</div></details>}</div></div>
    {cierre && <p className="hint">{cierre.t} el {new Date(cierre.f).toLocaleDateString('es-CO')}{cierre.d ? `. ${cierre.d}` : ''}</p>}
    {err && <div className="msg" role="alert">{err}</div>}
    {panel && <section className="item" aria-label="Acción en curso" style={{ marginTop: 14 }}>
      {panel.k === 'entrega' && <><h2>Registrar entrega</h2><div className="f"><label>Artículos entregados<input autoFocus value={arts} onChange={e => setArts(e.target.value)} /></label><label>Observaciones (opcional)<input value={obs} onChange={e => setObs(e.target.value)} /></label></div>
        <p><label className="chk"><input type="checkbox" checked={recibido} onChange={e => setRecibido(e.target.checked)} />El cliente confirma que recibió la mercancía</label></p>
        {sal.saldo > 0 && <><div className="msg">Queda un saldo de {cop(sal.saldo)}. Solo se entrega con una excepción documentada.</div><label className="chk"><input type="checkbox" checked={exc} onChange={e => setExc(e.target.checked)} />Entregar con saldo pendiente</label>
          {exc && <label style={{ marginTop: 8 }}>Motivo de la excepción<input value={motivo} onChange={e => setMotivo(e.target.value)} /></label>}</>}
        <div className="bar" style={{ marginTop: 12 }}><button className="p" disabled={!recibido || (sal.saldo > 0 && (!exc || !motivo.trim()))} onClick={() => run('registrar_entrega', { p_id: id, p_articulos: arts, p_recibido: recibido, p_obs: obs, p_excepcion: exc, p_motivo: motivo })}>Confirmar entrega</button><button onClick={() => setPanel(null)}>Volver</button></div></>}
      {panel.k === 'cancelar' && <><h2>Cancelar separado</h2><p className="hint" style={{ marginTop: 0 }}>El separado y sus pagos se conservan. Si hay que devolver dinero, se hace aparte desde el pago.</p>
        <label>Motivo de la cancelación<input autoFocus value={motivo} onChange={e => setMotivo(e.target.value)} /></label>
        <div className="bar" style={{ marginTop: 12 }}><button className="p danger" disabled={!motivo.trim()} onClick={() => run('cancelar_separado', { p_id: id, p_motivo: motivo })}>Cancelar separado</button><button onClick={() => setPanel(null)}>Volver</button></div></>}
      {panel.k === 'corregir' && <><h2>Corregir o devolver dinero</h2><p className="hint" style={{ marginTop: 0 }}>El pago original no se modifica: se agrega un movimiento relacionado.</p>
        <fieldset className="opts"><legend>¿Qué pasó?</legend>{OPC.map(([k, t, d]) => <label key={k} className="opt"><input type="radio" name="tipo" checked={tipo === k} onChange={() => setTipo(k)} /><span><b>{t}</b><small>{d}</small></span></label>)}</fieldset>
        <div className="f" style={{ marginTop: 12 }}><label>Valor a descontar (máximo {cop(panel.max)})<input type="number" value={valor} onChange={e => setValor(e.target.value)} /></label><label>Motivo<input value={motivo} onChange={e => setMotivo(e.target.value)} /></label></div>
        <div className="bar" style={{ marginTop: 12 }}><button className="p" disabled={!motivo.trim() || +valor <= 0 || +valor > panel.max} onClick={() => run('registrar_reverso', { p_pago: panel.id, p_valor: +valor, p_tipo: tipo, p_motivo: motivo })}>Registrar</button><button onClick={() => setPanel(null)}>Volver</button></div></>}</section>}
    <h2>Artículos</h2><div className="sc"><table><caption className="sr">Artículos del separado</caption><tbody>{items.map((x, k) => <tr key={k}><td>{x.descripcion}</td><td className="r">x{x.cantidad}</td><td className="r">{cop(x.total)}</td></tr>)}</tbody></table></div>
    <h2>Pagos</h2>
    {abonos.length === 0 ? <div className="sc"><div className="empty">Sin abonos registrados.</div></div> :
    <ul className="tl">{abonos.flatMap((a: Abono) => a.abono_pagos.map((p: any) => (<li key={p.id}>
      <div>{METODOS.find(m => m.id === p.metodo_id)?.nombre}<small>{new Date(a.fecha).toLocaleString('es-CO')}{p.referencia_bancaria ? ` · Ref. ${p.referencia_bancaria}` : ''}</small>
        {(p.reversos ?? []).map((v: any, k: number) => <small key={k} className="rv">{REV[v.tipo]} de {cop(v.valor)}: {v.motivo}</small>)}</div>
      <div className="bar" style={{ margin: 0 }}><span className="v">{cop(p.valor)}</span><Chip e={p.estado} />
        {p.estado === 'pendiente_verificacion' && puedeVerificar(r) && <button className="sm" onClick={() => run('confirmar_transferencia', { p_pago: p.id })}>Verificar</button>}
        <Link className="sm lnk" to={`/separado/${id}/imprimir?abono=${a.id}`}>Recibo</Link>
        {p.estado === 'confirmado' && puedeVerificar(r) && <button className="sm" onClick={() => { setValor(''); abrir({ k: 'corregir', id: p.id, max: p.valor - (p.reversos ?? []).reduce((x: number, y: any) => x + Number(y.valor), 0) }) }}>Corregir</button>}</div></li>)))}</ul>}
    <h2>Nota de venta o factura</h2>
    <div className="bar"><input style={{ maxWidth: 280, marginTop: 0 }} aria-label="Número de nota de venta o factura" placeholder="Número de nota o factura" value={ref} onChange={e => setRef(e.target.value)} disabled={r === 'consulta'} />
      {r !== 'consulta' && <button onClick={() => run('registrar_ref_facturacion', { p_id: id, p_ref: ref })}>Guardar</button>}</div>
    <p className="hint">Se escribe a mano: no hay conexión con el software de facturación.</p></>)
}
