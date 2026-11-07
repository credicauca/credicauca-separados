import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { cop, METODOS, puedeVerificar } from '../lib/types'
import { Chip, useTitulo } from '../components'

const TABS: [string, string][] = [['pendiente_verificacion', 'Por verificar'], ['confirmado', 'Confirmados'], ['reversado', 'Reversados'], ['todos', 'Todos']]
export default function Pagos() {
  useTitulo('Pagos'); const { perfil } = useAuth(); const [sp, setSp] = useSearchParams()
  const f = sp.get('f') ?? (perfil && puedeVerificar(perfil.rol) ? 'pendiente_verificacion' : 'todos')
  const [r, setR] = useState<any[] | null>(null); const [err, setErr] = useState('')
  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('abono_pagos').select('id,valor,metodo_id,estado,referencia_bancaria,abonos(id,fecha,separado_id,separados(numero,clientes(nombre)))').limit(300)
    if (error) return setErr(error.message)
    setR((data ?? []).sort((a: any, b: any) => (b.abonos?.fecha ?? '').localeCompare(a.abonos?.fecha ?? '')))
  }, [])
  useEffect(() => { cargar() }, [cargar])
  const verificar = async (id: string) => { setErr(''); const { error } = await supabase.rpc('confirmar_transferencia', { p_pago: id }); error ? setErr(error.message) : cargar() }
  const cnt = (k: string) => (r ?? []).filter(x => k === 'todos' || x.estado === k).length
  const vista = (r ?? []).filter(x => f === 'todos' || x.estado === f)
  return (<><h1>Pagos</h1><p className="sub">Todo el dinero registrado. Una transferencia no cuenta como recibida hasta que se verifica.</p>
    <div className="chips" role="group" aria-label="Filtrar pagos">{TABS.map(([k, t]) => <button key={k} type="button" className="fchip" aria-pressed={f === k} onClick={() => setSp({ f: k }, { replace: true })}>{t} <span>{cnt(k)}</span></button>)}</div>
    {err && <div className="msg" role="alert">{err}</div>}
    <div className="sc"><table><caption className="sr">Pagos registrados</caption><thead><tr><th scope="col">Fecha</th><th scope="col">Separado</th><th scope="col">Cliente</th><th scope="col">Método</th><th scope="col" className="r">Valor</th><th scope="col">Estado</th><th scope="col"><span className="sr">Acciones</span></th></tr></thead>
      <tbody>{vista.map(p => (<tr key={p.id}><td>{new Date(p.abonos?.fecha).toLocaleString('es-CO')}</td>
        <td><Link to={`/separado/${p.abonos?.separado_id}`}><b>{p.abonos?.separados?.numero}</b></Link></td><td>{p.abonos?.separados?.clientes?.nombre}</td>
        <td>{METODOS.find(m => m.id === p.metodo_id)?.nombre}{p.referencia_bancaria ? ` · ${p.referencia_bancaria}` : ''}</td><td className="r">{cop(p.valor)}</td><td><Chip e={p.estado} /></td>
        <td>{p.estado === 'pendiente_verificacion' && puedeVerificar(perfil!.rol) ? <button className="sm" onClick={() => verificar(p.id)}>Verificar</button> : <Link className="sm lnk" to={`/separado/${p.abonos?.separado_id}/imprimir?abono=${p.abonos?.id}`}>Recibo</Link>}</td></tr>))}</tbody></table>
      {r && vista.length === 0 && <div className="empty">{f === 'pendiente_verificacion' ? 'No hay transferencias por verificar.' : 'No hay pagos en esta vista.'}</div>}{!r && <div className="empty">Cargando…</div>}</div></>)
}
