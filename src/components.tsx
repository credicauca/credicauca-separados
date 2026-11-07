import { useEffect } from 'react'
import { ESTADO, METODOS } from './lib/types'

export const Chip = ({ e }: { e: string }) => { const [t, c] = ESTADO[e] ?? [e, '']; return <span className={`chip ${c}`}>{t}</span> }
// Estado visible: saldo confirmado en 0 y sin entregar/cancelar = pagado, pendiente de entrega.
export const ev = (e: string, saldo?: number) => e === 'cancelado' || e === 'entregado' ? e : saldo !== undefined && saldo <= 0 ? 'pendiente_entrega' : e
export const useTitulo = (t: string) => useEffect(() => { document.title = `${t} · Credicauca` }, [t])
export function plazo(fecha: string) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const d = Math.round((new Date(fecha + 'T00:00').getTime() - hoy.getTime()) / 864e5)
  const t = d < 0 ? `venció hace ${-d} ${-d === 1 ? 'día' : 'días'}` : d === 0 ? 'vence hoy' : `vence en ${d} ${d === 1 ? 'día' : 'días'}`
  return { t, dias: d, tono: d < 0 ? 'er' : d <= 7 ? 'wn' : '' }
}
export interface Fila { metodo: number; valor: string; ref: string }
export const filaVacia = (metodo = 1): Fila => ({ metodo, valor: '', ref: '' })
const pideRef = (id: number) => !!METODOS.find(m => m.id === id)?.ref
export function resumenPagos(rows: Fila[]) {
  const pagos = rows.filter(r => +r.valor > 0).map(r => ({ metodo_id: r.metodo, valor: +r.valor, referencia: pideRef(r.metodo) ? r.ref : null }))
  return { pagos, total: pagos.reduce((a, p) => a + p.valor, 0), porVerificar: pagos.filter(p => p.metodo_id === 2).reduce((a, p) => a + p.valor, 0),
    sinRef: rows.some(r => +r.valor > 0 && pideRef(r.metodo) && !r.ref.trim()) }
}
// Un solo formulario de pagos para "crear separado" y "registrar abono".
export function PagosForm({ rows, setRows }: { rows: Fila[]; setRows: (r: Fila[]) => void }) {
  const set = (i: number, k: keyof Fila, v: string | number) => setRows(rows.map((r, j) => j === i ? { ...r, [k]: v } : r))
  const libre = METODOS.find(m => !rows.some(r => r.metodo === m.id))
  return (<div>{rows.map((r, i) => (<div className="pay" key={i}>
      <label>Método de pago<select value={r.metodo} onChange={e => set(i, 'metodo', +e.target.value)}>{METODOS.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>
      <label>Valor recibido<input type="number" inputMode="numeric" min="0" placeholder="0" value={r.valor} onChange={e => set(i, 'valor', e.target.value)} /></label>
      {pideRef(r.metodo) ? <label>Referencia bancaria<input value={r.ref} onChange={e => set(i, 'ref', e.target.value)} /></label> : <span />}
      {rows.length > 1 && <button type="button" className="sm" aria-label={`Quitar el pago ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>Quitar</button>}</div>))}
    {libre && <button type="button" onClick={() => setRows([...rows, filaVacia(libre.id)])}>Dividir el abono en otro método</button>}
    {rows.some(r => r.metodo === 2) && <p className="hint">La transferencia queda pendiente hasta que un cajero o administrador la verifique.</p>}</div>)
}
// Lee el mensaje de error de una Edge Function.
export const msgErr = async (e: any): Promise<string> => { try { const j = await e.context.json(); return j.error ?? e.message } catch { return e?.message ?? 'Ocurrió un error' } }
export const claveNueva = () => { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'; return Array.from(crypto.getRandomValues(new Uint32Array(10)), x => a[x % a.length]).join('') }
