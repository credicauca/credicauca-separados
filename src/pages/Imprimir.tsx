import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { supabase } from '../lib/supabase'
import { cop, METODOS, Abono, Saldo } from '../lib/types'
import { ev } from '../components'

export default function Imprimir() {
  const { id } = useParams(); const [q] = useSearchParams(); const soloAbono = q.get('abono'); const nuevo = q.get('nuevo')
  const [s, setS] = useState<any>(null); const [items, setItems] = useState<any[]>([]); const [ab, setAb] = useState<Abono[]>([]); const [sal, setSal] = useState<Saldo | null>(null); const [qr, setQr] = useState(''); const [err, setErr] = useState('')
  useEffect(() => { (async () => {
    const a = await supabase.from('separados').select('id,numero,valor_total,fecha_creacion,fecha_limite,estado,qr_token,observaciones,ref_facturacion,clientes(nombre,documento,celular),sedes(codigo,nombre),vendedor:perfiles!separados_vendedor_id_fkey(nombre)').eq('id', id).single()
    if (a.error) return setErr(a.error.message)
    const i = await supabase.from('separado_items').select('descripcion,marca,referencia,medida,cantidad,precio_unitario,descuento,total').eq('separado_id', id)
    const b = await supabase.from('abonos').select('id,fecha,valor,abono_pagos(id,metodo_id,valor,estado,referencia_bancaria)').eq('separado_id', id).order('fecha')
    const c = await supabase.from('v_separados_saldo').select('*').eq('id', id).single()
    setS(a.data); setItems(i.data ?? []); setAb((b.data as unknown as Abono[]) ?? []); setSal(c.data as Saldo)
    setQr(await QRCode.toDataURL(`${window.location.origin}/q/${(a.data as any).qr_token}`, { margin: 1, width: 220 }))
  })() }, [id])
  if (err) return <div className="msg" role="alert">{err}</div>
  if (!s || !sal) return <p className="empty">Cargando…</p>
  const lista = soloAbono ? ab.filter(x => x.id === soloAbono) : ab
  const num = soloAbono ? `${s.numero}-A${ab.findIndex(x => x.id === soloAbono) + 1}` : s.numero
  return (<><div className="noprint bar" style={{ marginBottom: 14 }}>
      {nuevo && <span className="chip ok" role="status">{soloAbono ? 'Abono registrado' : 'Separado creado'}</span>}
      <button className="p" onClick={() => window.print()}>Imprimir</button><Link className="btn" style={{ background: 'var(--sf)', color: 'var(--tx)', border: '1px solid var(--ln)' }} to={`/separado/${id}`}>Ir al separado</Link></div>
    <article className="doc">
      <header><div><h1>Credicauca S.A.S.</h1><p>{s.sedes?.nombre} · {s.sedes?.codigo}</p></div>
        <div className="r"><small>{soloAbono ? 'Comprobante de abono' : 'Separado de mercancía'}</small><b className="num">{num}</b></div></header>
      <section className="cols"><div><small>Cliente</small><b>{s.clientes?.nombre}</b><span>Doc. •••{String(s.clientes?.documento ?? '').slice(-3)}</span></div>
        <div><small>Fecha</small><b>{new Date(s.fecha_creacion).toLocaleDateString('es-CO')}</b><span>Vendedor: {s.vendedor?.nombre ?? '—'}</span></div>
        <div><small>Fecha límite</small><b>{new Date(s.fecha_limite + 'T00:00').toLocaleDateString('es-CO')}</b><span>Estado: {ev(s.estado, sal.saldo).replace('_', ' ')}</span></div></section>
      <table><thead><tr><th>Artículo</th><th className="r">Cant.</th><th className="r">Precio</th><th className="r">Total</th></tr></thead><tbody>
        {items.map((x, k) => <tr key={k}><td>{x.descripcion}{[x.marca, x.referencia, x.medida].filter(Boolean).length ? <small> {[x.marca, x.referencia, x.medida].filter(Boolean).join(' · ')}</small> : null}</td>
          <td className="r">{x.cantidad}</td><td className="r">{cop(x.precio_unitario)}</td><td className="r">{cop(x.total)}</td></tr>)}</tbody></table>
      <table><thead><tr><th>Abono</th><th>Método</th><th>Estado</th><th className="r">Valor</th></tr></thead><tbody>
        {lista.flatMap(a => a.abono_pagos.map(p => <tr key={p.id}><td>{new Date(a.fecha).toLocaleString('es-CO')}</td><td>{METODOS.find(m => m.id === p.metodo_id)?.nombre}{p.referencia_bancaria ? ` · ${p.referencia_bancaria}` : ''}</td>
          <td>{p.estado === 'confirmado' ? 'Confirmado' : p.estado === 'reversado' ? 'Reversado' : 'Pendiente de verificación'}</td><td className="r">{cop(p.valor)}</td></tr>))}</tbody></table>
      <section className="tot"><div><small>Valor total</small><b>{cop(sal.valor_total)}</b></div><div><small>Recibido confirmado</small><b>{cop(sal.recibido_confirmado)}</b></div>
        <div><small>Pendiente de verificación</small><b>{cop(sal.pendiente_verificacion)}</b></div><div className="key"><small>Saldo</small><b>{cop(sal.saldo)}</b></div></section>
      <footer><img src={qr} alt="Código QR para consultar el separado" width="110" height="110" />
        <p>Escanee el código para consultar el estado de su separado.<br />{s.ref_facturacion ? `Nota de venta / factura: ${s.ref_facturacion}` : 'Conserve este comprobante.'}<br />Las transferencias cuentan como recibidas solo cuando son verificadas.</p></footer></article></>)
}
