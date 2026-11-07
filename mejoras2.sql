-- Integridad: un pago no puede superar lo que falta por pagar (confirmado + pendiente de verificación).
create or replace function fn_no_sobrepago() returns trigger language plpgsql security definer set search_path = public as $$
declare v_sep uuid; v_libre numeric;
begin
  select separado_id into v_sep from abonos where id = new.abono_id;
  select valor_total - recibido_confirmado - pendiente_verificacion into v_libre from v_separados_saldo where id = v_sep;
  if new.valor > v_libre then raise exception 'El pago (%) supera lo que falta por pagar (%)', new.valor, v_libre; end if;
  return new;
end $$;
drop trigger if exists no_sobrepago on abono_pagos;
create trigger no_sobrepago before insert on abono_pagos for each row execute function fn_no_sobrepago();
