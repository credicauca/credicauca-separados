import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { cop, Saldo } from '../lib/types'
import { PagosForm, filaVacia, resumenPagos, useTitulo } from '../components'

export default function RegistrarAbono() {
  useTitulo('Registrar abono'); const { id } = useParams(); const nav = useNavigate()
  const [info, setInfo] = useState<{ numero: string; cliente: string; s: Saldo } | null>(null)
  const [rows, setRows] = useState([filaVacia()]); const [err, setErr] = useState(''); const [env, setEnv] = useState(false)
  const [pid] = useState(() => crypto.randomUUID()) // el mismo id en reintentos evita duplicar el abono
  useEffect(() => { (async () => {
    const a = await supabase.from('separados').select('numero,clientes(nombre)').eq('id', id).single(); const s = await supabase.from('v_separados_saldo').select('*').eq('id', id).single()
    if (a.data && s.data) setInfo({ numero: (a.data as any).numero, cliente: (a.data as any).clientes?.nombre, s: s.data as Saldo })
  })() }, [id])
  const { pagos, total, porVerificar, sinRef } = resumenPagos(rows)
  const libre = info ? info.s.saldo - info.s.pendiente_verificacion : 0
  const faltas = [total <= 0 && 'Escriba el valor recibido', sinRef && 'Falta la referencia bancaria', info && total > libre && `El abono no puede superar lo que falta por pagar (${cop(libre)})`].filter(Boolean) as string[]
  const guardar = async () => {
    setEnv(true); setErr('')
    const { error } = await supabase.rpc('registrar_abono', { p_id: pid, p_separado: id, p_pagos: pagos })
    if (error) { setErr(error.message); setEnv(false) } else nav(`/separado/${id}/imprimir?abono=${pid}&nuevo=1`)
  }
  if (!info) return <p className="empty">Cargando…</p>
  return (<><nav aria-label="Ruta" className="sub" style={{ margin: 0 }}><Link to={`/separado/${id}`}>{info.numero}</Link> / Registrar abono</nav>
    <h1 style={{ margin: '4px 0 2px' }}>Registrar abono</h1><p className="sub">{info.numero} · {info.cliente}</p>
    <div className="eq"><div><span>Saldo actual</span><b>{cop(info.s.saldo)}</b></div><i>−</i><div><span>Este abono</span><b>{cop(total)}</b></div><i>=</i><div className="key"><span>Saldo después</span><b>{cop(info.s.saldo - (total - porVerificar))}</b></div></div>
    {porVerificar > 0 && <p className="hint" style={{ margin: '-8px 0 16px' }}>Los {cop(porVerificar)} de transferencia no bajan el saldo hasta verificarse.</p>}
    <PagosForm rows={rows} setRows={setRows} />
    {err && <div className="msg" role="alert">{err}</div>}
    <div className="sum"><p role="status">{faltas.length ? `Falta: ${faltas.join('. ')}.` : 'Listo para guardar.'}</p><button className="p" disabled={faltas.length > 0 || env} onClick={guardar}>{env ? 'Guardando…' : 'Guardar e imprimir recibo'}</button></div></>)
}
