import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import type { Acceso } from '../lib/types'

export default function Login() {
  const { entrar } = useAuth(); const nav = useNavigate()
  const [acceso, setAcceso] = useState<Acceso>('operativo')
  const [email, setEmail] = useState(''); const [pass, setPass] = useState(''); const [err, setErr] = useState<string | null>(null); const [env, setEnv] = useState(false)
  const enviar = async () => { setEnv(true); const e = await entrar(email, pass, acceso); setEnv(false); e ? setErr(e) : nav('/') }
  return (
    <div className="login"><div>
      <h1>Credicauca S.A.S.</h1><p className="sub">Ingrese con su cuenta personal.</p>
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={acceso === 'administrativo'} onClick={() => setAcceso('administrativo')}>Administración</button>
        <button role="tab" aria-selected={acceso === 'operativo'} onClick={() => setAcceso('operativo')}>Acceso operativo</button>
      </div>
      <p><label>Correo<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></label></p>
      <p><label>Contraseña<input type="password" autoComplete="current-password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviar()} /></label></p>
      {err && <div className="msg" role="alert">{err}</div>}
      <button className="p go" disabled={env || !email || !pass} onClick={enviar}>{env ? 'Ingresando…' : 'Ingresar'}</button>
    </div></div>
  )
}
