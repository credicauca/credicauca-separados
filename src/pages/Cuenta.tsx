import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTitulo } from '../components'

export default function Cuenta() {
  useTitulo('Mi cuenta'); const [a, setA] = useState(''); const [b, setB] = useState(''); const [m, setM] = useState<{ ok: boolean; t: string } | null>(null)
  const guardar = async () => { const { error } = await supabase.auth.updateUser({ password: a }); setM(error ? { ok: false, t: error.message } : { ok: true, t: 'Contraseña cambiada.' }); if (!error) { setA(''); setB('') } }
  return (<><h1>Mi cuenta</h1><p className="sub">Cambie la contraseña temporal por una que solo usted conozca.</p>
    <div className="f" style={{ maxWidth: 560 }}><label>Nueva contraseña (8 caracteres o más)<input type="password" autoComplete="new-password" value={a} onChange={e => setA(e.target.value)} /></label>
      <label>Repetir contraseña<input type="password" autoComplete="new-password" value={b} onChange={e => setB(e.target.value)} /></label></div>
    {a && b && a !== b && <p className="hint" role="status">Las contraseñas no coinciden.</p>}
    {m && <div className={m.ok ? 'next ok' : 'msg'} role={m.ok ? 'status' : 'alert'} style={{ marginTop: 14 }}>{m.t}</div>}
    <div className="bar" style={{ marginTop: 14 }}><button className="p" disabled={a.length < 8 || a !== b} onClick={guardar}>Cambiar contraseña</button></div></>)
}
