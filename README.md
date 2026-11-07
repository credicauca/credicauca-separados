# Credicauca · Separados (fase 2-4, parcial)
1. Cree un proyecto Supabase de PRUEBA y ejecute `schema.sql` en el editor SQL.
2. Cree usuarios en Authentication y sus filas en `perfiles`, `sedes` y `usuario_sedes`.
3. Copie `.env.example` a `.env` y complete URL y clave anon.
4. `npm install` y `npm run dev`.
Hecho: login por tipo de acceso, lista, detalle con saldo, registrar abono (RPC), verificar transferencia.
Pendiente: crear separado, reversos/anulaciones, entregas, QR público, offline, informes, usuarios, sedes, auditoría, respaldos.
No probado: no se pudo instalar ni compilar en el entorno donde se escribió.

## Actualización: mejoras
1. Ejecute `mejoras.sql` en el SQL Editor de Supabase (corrige el saldo con reversos y agrega estado automático, reversos, cancelación, entregas y referencia de factura).
2. Ejecute `npm install` (nueva dependencia `qrcode`) y luego `npm run dev`.
Nuevo: panel de gerencia, alertas, auditoría, impresión de separado y de cada abono con QR, consulta pública por QR en /q/<código>.
Pendiente: informes Excel/PDF, usuarios y sedes desde pantalla, catálogo, offline, respaldos, filtros del panel y recaudo diario/semanal/mensual.

## Revisión de interfaz
Ejecute también `mejoras2.sql` (un pago ya no puede superar lo que falta por pagar). Cambios: "Alertas" se eliminó y ahora son filtros claros en Separados; nueva pantalla Pagos (cola de verificación); panel de gerencia con "Por hacer"; formulario único de pagos; ficha con siguiente paso; mejoras de accesibilidad.

## Usuarios y sedes desde la pantalla
1. Ejecute `usuarios.sql` en el SQL Editor.
2. Despliegue la Edge Function `admin-usuarios` (archivo `supabase/functions/admin-usuarios/index.ts`) desde Edge Functions > Deploy a new function > Via Editor.
3. Como gerencia: menú Sedes y Usuarios.
