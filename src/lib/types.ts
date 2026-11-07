export type Rol = 'gerencia' | 'administrador' | 'vendedor' | 'cajero' | 'consulta'
export type Acceso = 'administrativo' | 'operativo'
export type EstadoPago = 'pendiente_verificacion' | 'confirmado' | 'reversado'
export interface Perfil { id: string; nombre: string; rol: Rol; acceso: Acceso }
export interface Saldo { id: string; valor_total: number; recibido_confirmado: number; pendiente_verificacion: number; saldo: number }
export interface Separado { id: string; numero: string | null; valor_total: number; fecha_limite: string; estado: string; sede_id: string; clientes: { nombre: string } | null }
export interface Pago { id: string; metodo_id: number; valor: number; estado: EstadoPago; referencia_bancaria: string | null }
export interface Abono { id: string; fecha: string; valor: number; abono_pagos: Pago[] }
export const METODOS = [
  { id: 1, nombre: 'Efectivo', ref: false }, { id: 2, nombre: 'Transferencia', ref: true },
  { id: 3, nombre: 'Tarjeta débito', ref: true }, { id: 4, nombre: 'Tarjeta crédito', ref: true },
]
export const cop = (n: number) => '$' + n.toLocaleString('es-CO')
export const puedeRecaudar = (r: Rol) => r !== 'consulta'
export const puedeVerificar = (r: Rol) => ['cajero', 'administrador', 'gerencia'].includes(r)
export const ESTADO: Record<string, [string, string]> = {
  activo: ['Activo', ''], pendiente_pago: ['Pendiente de pago', 'wn'], pagado: ['Pagado', 'ok'],
  pendiente_entrega: ['Pendiente de entrega', 'ok'], entregado: ['Entregado', ''], cancelado: ['Cancelado', 'er'],
  confirmado: ['Confirmado', 'ok'], pendiente_verificacion: ['Pendiente de verificación', 'wn'], reversado: ['Reversado', 'er'],
}
