import { useEffect } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import Login from './pages/Login'; import Separados from './pages/Separados'; import Detalle from './pages/Detalle'; import RegistrarAbono from './pages/RegistrarAbono'
import CrearSeparado from './pages/CrearSeparado'; import Dashboard from './pages/Dashboard'; import Pagos from './pages/Pagos'; import Auditoria from './pages/Auditoria'
import Usuarios from './pages/Usuarios'; import Sedes from './pages/Sedes'; import Cuenta from './pages/Cuenta'
import Imprimir from './pages/Imprimir'; import Publico from './pages/Publico'

const cls = ({ isActive }: { isActive: boolean }) => isActive ? 'on' : ''
function Privado({ children }: { children: JSX.Element }) {
  const { perfil, cargando, salir } = useAuth(); const loc = useLocation()
  useEffect(() => { document.getElementById('contenido')?.focus({ preventScroll: true }) }, [loc.pathname])
  if (cargando) return <p className="empty">Cargando…</p>
  if (!perfil) return <Navigate to="/login" />
  // Esta guarda solo mejora la experiencia. Los permisos reales los aplica la base de datos (RLS).
  const adm = perfil.acceso === 'administrativo', rol = perfil.rol.charAt(0).toUpperCase() + perfil.rol.slice(1)
  return (<div className="app"><a className="skip" href="#contenido">Saltar al contenido</a><nav className="nav" aria-label="Principal">
    <div className="brand">Credicauca<small>Sistema de separados</small></div>
    {adm && <NavLink to="/" end className={cls}>Panel</NavLink>}
    <NavLink to={adm ? '/separados' : '/'} end className={cls}>Separados</NavLink>
    {perfil.rol !== 'consulta' && perfil.rol !== 'cajero' && <NavLink to="/crear" className={cls}>Crear separado</NavLink>}
    <NavLink to="/pagos" className={cls}>Pagos</NavLink>
    {perfil.rol === 'gerencia' && <NavLink to="/usuarios" className={cls}>Usuarios</NavLink>}
    {perfil.rol === 'gerencia' && <NavLink to="/sedes" className={cls}>Sedes</NavLink>}
    {adm && <NavLink to="/auditoria" className={cls}>Auditoría</NavLink>}
    <div className="who"><NavLink to="/cuenta" className={cls}>Mi cuenta</NavLink><div style={{ marginTop: 8 }}><b>{perfil.nombre}</b><span>{rol}</span></div><button className="sm" onClick={salir}>Salir</button></div>
  </nav><main id="contenido" tabIndex={-1}>{children}</main></div>)
}
function Inicio() { const { perfil } = useAuth(); return perfil?.acceso === 'administrativo' ? <Dashboard /> : <Separados /> }
export default function App() {
  const P = (e: JSX.Element) => <Privado>{e}</Privado>
  return (<AuthProvider><BrowserRouter><Routes>
    <Route path="/login" element={<Login />} /><Route path="/q/:token" element={<Publico />} />
    <Route path="/" element={P(<Inicio />)} /><Route path="/separados" element={P(<Separados />)} /><Route path="/crear" element={P(<CrearSeparado />)} />
    <Route path="/usuarios" element={P(<Usuarios />)} /><Route path="/sedes" element={P(<Sedes />)} /><Route path="/cuenta" element={P(<Cuenta />)} />
    <Route path="/pagos" element={P(<Pagos />)} /><Route path="/auditoria" element={P(<Auditoria />)} />
    <Route path="/separado/:id" element={P(<Detalle />)} /><Route path="/separado/:id/abono" element={P(<RegistrarAbono />)} /><Route path="/separado/:id/imprimir" element={P(<Imprimir />)} />
  </Routes></BrowserRouter></AuthProvider>)
}
