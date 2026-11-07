-- MEJORAS: estado automático, reversos, cancelación, entregas, referencia de factura.
-- 1) Corrección del saldo: un pago totalmente reversado ya no se descuenta dos veces.
create or replace view v_separados_saldo as
select s.id, s.sede_id, s.numero, s.valor_total,
  coalesce(sum(p.valor) filter (where p.estado='confirmado'),0)
    - coalesce((select sum(r.valor) from reversos r join abono_pagos x on x.id=r.abono_pago_id and x.estado='confirmado'
                join abonos a2 on a2.id=x.abono_id where a2.separado_id=s.id),0)       as recibido_confirmado,
  coalesce(sum(p.valor) filter (where p.estado='pendiente_verificacion'),0)             as pendiente_verificacion,
  s.valor_total
    - (coalesce(sum(p.valor) filter (where p.estado='confirmado'),0)
    - coalesce((select sum(r.valor) from reversos r join abono_pagos x on x.id=r.abono_pago_id and x.estado='confirmado'
                join abonos a2 on a2.id=x.abono_id where a2.separado_id=s.id),0))      as saldo
from separados s
left join abonos a on a.separado_id=s.id and a.sync='sincronizado'
left join abono_pagos p on p.abono_id=a.id
group by s.id;
alter view v_separados_saldo set (security_invoker = true);

-- 2) Estado automático según el saldo confirmado
create or replace function recalcular_estado(p_sep uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_saldo numeric; v_est estado_separado;
begin
  select estado into v_est from separados where id = p_sep;
  if v_est in ('cancelado','entregado') then return; end if;
  select saldo into v_saldo from v_separados_saldo where id = p_sep;
  if v_saldo <= 0 and v_est <> 'pendiente_entrega' then update separados set estado='pendiente_entrega' where id = p_sep;
  elsif v_saldo > 0 and v_est = 'pendiente_entrega' then update separados set estado='pendiente_pago' where id = p_sep; end if;
end $$;

create or replace function fn_estado_pago() returns trigger language plpgsql security definer set search_path = public as $$
begin perform recalcular_estado((select separado_id from abonos where id = new.abono_id)); return new; end $$;
create or replace function fn_estado_reverso() returns trigger language plpgsql security definer set search_path = public as $$
begin perform recalcular_estado((select a.separado_id from abono_pagos p join abonos a on a.id = p.abono_id where p.id = new.abono_pago_id)); return new; end $$;
drop trigger if exists estado_tras_pago on abono_pagos;
drop trigger if exists estado_tras_reverso on reversos;
create trigger estado_tras_pago    after insert or update on abono_pagos for each row execute function fn_estado_pago();
create trigger estado_tras_reverso after insert on reversos              for each row execute function fn_estado_reverso();

-- 3) Reversos / correcciones / devoluciones (el pago original no se toca)
create or replace function registrar_reverso(p_pago uuid, p_valor numeric, p_tipo tipo_reverso, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_valor numeric; v_est estado_pago; v_sede uuid; v_prev numeric;
begin
  if rol_actual() not in ('cajero','administrador','gerencia') then raise exception 'Sin permiso'; end if;
  if coalesce(trim(p_motivo),'') = '' then raise exception 'Indique el motivo'; end if;
  select p.valor, p.estado, a.sede_id into v_valor, v_est, v_sede from abono_pagos p join abonos a on a.id = p.abono_id where p.id = p_pago;
  if not found or not ve_sede(v_sede) then raise exception 'Pago no disponible'; end if;
  if v_est <> 'confirmado' then raise exception 'Solo se reversan pagos confirmados'; end if;
  select coalesce(sum(valor),0) into v_prev from reversos where abono_pago_id = p_pago;
  if p_valor <= 0 or p_valor > v_valor - v_prev then raise exception 'Valor de reverso inválido'; end if;
  insert into reversos(abono_pago_id, tipo, valor, motivo, usuario_id) values (p_pago, p_tipo, p_valor, p_motivo, auth.uid());
end $$;

-- 4) Cancelación (cambia el estado, nunca borra)
create or replace function cancelar_separado(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_sede uuid; v_est estado_separado;
begin
  if rol_actual() not in ('administrador','gerencia') then raise exception 'Sin permiso para cancelar'; end if;
  if coalesce(trim(p_motivo),'') = '' then raise exception 'Indique el motivo'; end if;
  select sede_id, estado into v_sede, v_est from separados where id = p_id;
  if not found or not ve_sede(v_sede) then raise exception 'Separado no disponible'; end if;
  if v_est in ('cancelado','entregado') then raise exception 'El separado ya está %', v_est; end if;
  insert into cancelaciones(separado_id, motivo, usuario_id) values (p_id, p_motivo, auth.uid());
  update separados set estado = 'cancelado' where id = p_id;
end $$;

-- 5) Entrega (con excepción documentada si hay saldo)
create or replace function registrar_entrega(p_id uuid, p_articulos text, p_recibido boolean, p_obs text, p_excepcion boolean, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_sede uuid; v_est estado_separado;
begin
  if rol_actual() not in ('vendedor','cajero','administrador','gerencia') then raise exception 'Sin permiso'; end if;
  select sede_id, estado into v_sede, v_est from separados where id = p_id;
  if not found or not ve_sede(v_sede) then raise exception 'Separado no disponible'; end if;
  if v_est in ('cancelado','entregado') then raise exception 'El separado está %', v_est; end if;
  if not p_recibido then raise exception 'Confirme que el cliente recibió la mercancía'; end if;
  insert into entregas(separado_id, responsable_id, articulos, recibido_confirmado, excepcion_saldo, motivo_excepcion, observaciones)
    values (p_id, auth.uid(), to_jsonb(p_articulos), p_recibido, coalesce(p_excepcion,false), nullif(trim(p_motivo),''), p_obs);
  update separados set estado = 'entregado' where id = p_id;
end $$;

-- 6) Referencia manual de nota de venta o factura
create or replace function registrar_ref_facturacion(p_id uuid, p_ref text) returns void
language plpgsql security definer set search_path = public as $$
declare v_sede uuid;
begin
  if rol_actual() = 'consulta' or rol_actual() is null then raise exception 'Sin permiso'; end if;
  select sede_id into v_sede from separados where id = p_id;
  if not found or not ve_sede(v_sede) then raise exception 'Separado no disponible'; end if;
  update separados set ref_facturacion = nullif(trim(p_ref),'') where id = p_id;
end $$;

-- 7) Permisos de ejecución
revoke execute on function registrar_reverso(uuid,numeric,tipo_reverso,text) from public, anon;
revoke execute on function cancelar_separado(uuid,text) from public, anon;
revoke execute on function registrar_entrega(uuid,text,boolean,text,boolean,text) from public, anon;
revoke execute on function registrar_ref_facturacion(uuid,text) from public, anon;
revoke execute on function recalcular_estado(uuid) from public, anon, authenticated;
grant execute on function registrar_reverso(uuid,numeric,tipo_reverso,text) to authenticated;
grant execute on function cancelar_separado(uuid,text) to authenticated;
grant execute on function registrar_entrega(uuid,text,boolean,text,boolean,text) to authenticated;
grant execute on function registrar_ref_facturacion(uuid,text) to authenticated;
-- Pone al día los separados que ya existen
select recalcular_estado(id) from separados;
