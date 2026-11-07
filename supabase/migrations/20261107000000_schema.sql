-- ============================================================
-- CREDICAUCA S.A.S. - Sistema de separados
-- Esquema PostgreSQL (compatible con Supabase). Sin datos de conexión.
-- Estado: DISEÑADO, NO PROBADO contra una base real.
-- ============================================================
create extension if not exists pgcrypto;

-- ---------- TIPOS ----------
create type rol_usuario    as enum ('gerencia','administrador','vendedor','cajero','consulta');
create type acceso_tipo    as enum ('administrativo','operativo');
create type estado_pago    as enum ('pendiente_verificacion','confirmado','reversado');
create type estado_separado as enum ('activo','pendiente_pago','pagado','pendiente_entrega','entregado','cancelado');
create type estado_sync    as enum ('sincronizado','pendiente_sincronizacion','conflicto');
create type tipo_reverso   as enum ('correccion','reverso','devolucion');

-- ---------- SEDES Y USUARIOS ----------
create table sedes (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo ~ '^[A-Z]{2,5}$'),   -- p. ej. CAD, OUT, YUM (configurable)
  nombre text not null,
  direccion text,
  activa boolean not null default true
);

create table perfiles (
  id uuid primary key references auth.users(id),                  -- una cuenta por persona
  nombre text not null,
  rol rol_usuario not null,
  acceso acceso_tipo not null,
  activo boolean not null default true,
  check ((rol in ('gerencia','administrador')) = (acceso = 'administrativo'))
);

create table usuario_sedes (
  usuario_id uuid references perfiles(id),
  sede_id uuid references sedes(id),
  primary key (usuario_id, sede_id)
);

create table metodos_pago (
  id serial primary key,
  nombre text not null unique,
  requiere_verificacion boolean not null default false,
  requiere_referencia boolean not null default false,
  activo boolean not null default true
);
insert into metodos_pago(nombre, requiere_verificacion, requiere_referencia) values
 ('Efectivo',false,false),('Transferencia',true,true),
 ('Tarjeta débito',false,true),('Tarjeta crédito',false,true);

-- ---------- FUNCIONES DE PERMISOS ----------
create function rol_actual() returns rol_usuario language sql stable security definer
  as $$ select rol from perfiles where id = auth.uid() and activo $$;

create function es_admin() returns boolean language sql stable security definer
  as $$ select coalesce(rol_actual() in ('gerencia','administrador'), false) $$;

create function ve_sede(p_sede uuid) returns boolean language sql stable security definer
  as $$ select rol_actual() = 'gerencia'
        or exists (select 1 from usuario_sedes where usuario_id = auth.uid() and sede_id = p_sede) $$;

-- ---------- CLIENTES Y CATÁLOGO ----------
create table clientes (
  id uuid primary key default gen_random_uuid(),
  documento text not null unique,
  nombre text not null,
  celular text not null,
  direccion text,
  observaciones text,
  creado_por uuid references perfiles(id),
  creado_en timestamptz not null default now()
);

create table catalogo (
  id uuid primary key default gen_random_uuid(),
  categoria text not null,
  descripcion text not null,
  marca text, referencia text, medida text,
  precio_lista numeric(14,0) check (precio_lista >= 0),
  activo boolean not null default true
);

-- ---------- CONSECUTIVOS POR SEDE ----------
create table consecutivos (
  sede_id uuid primary key references sedes(id),
  ultimo integer not null default 0
);

-- Serializa por fila: dos empleados simultáneos en la misma sede nunca obtienen el mismo número.
create function siguiente_consecutivo(p_sede uuid) returns text
language plpgsql security definer as $$
declare n integer; cod text;
begin
  insert into consecutivos(sede_id) values (p_sede) on conflict do nothing;
  update consecutivos set ultimo = ultimo + 1 where sede_id = p_sede returning ultimo into n;
  select codigo into cod from sedes where id = p_sede;
  return cod || '-' || lpad(n::text, 5, '0');
end $$;

-- ---------- SEPARADOS ----------
create table separados (
  id uuid primary key,                                   -- generado en el dispositivo (offline) o servidor
  sede_id uuid not null references sedes(id),
  numero text,                                           -- null mientras esté provisional (offline)
  ref_provisional text,                                  -- identificador local hasta sincronizar
  cliente_id uuid not null references clientes(id),
  vendedor_id uuid not null references perfiles(id),
  responsable_recaudo uuid references perfiles(id),
  valor_total numeric(14,0) not null check (valor_total > 0),
  fecha_creacion timestamptz not null default now(),
  fecha_limite date not null,
  estado estado_separado not null default 'activo',
  ref_facturacion text,                                  -- captura manual de nota de venta / factura
  observaciones text,
  qr_token text not null unique default encode(gen_random_bytes(24),'hex'),
  sync estado_sync not null default 'sincronizado',
  dispositivo text, hora_local timestamptz,
  unique (sede_id, numero)                               -- permite varios null (provisionales)
);

create table separado_items (
  id uuid primary key default gen_random_uuid(),
  separado_id uuid not null references separados(id),
  catalogo_id uuid references catalogo(id),              -- null = producto fuera de catálogo
  categoria text not null, descripcion text not null,
  marca text, referencia text, medida text,
  cantidad integer not null check (cantidad > 0),
  precio_unitario numeric(14,0) not null check (precio_unitario >= 0),
  descuento numeric(14,0) not null default 0 check (descuento >= 0),
  total numeric(14,0) generated always as (cantidad * precio_unitario - descuento) stored
);

create table modificaciones_separado (                   -- trazabilidad de cambios de precio/valor
  id uuid primary key default gen_random_uuid(),
  separado_id uuid not null references separados(id),
  campo text not null, valor_anterior text, valor_nuevo text,
  motivo text not null,
  usuario_id uuid not null references perfiles(id) default auth.uid(),
  creado_en timestamptz not null default now()
);

-- ---------- ABONOS Y PAGOS ----------
create table abonos (
  id uuid primary key,                                   -- idempotencia: mismo id = mismo abono
  separado_id uuid not null references separados(id),
  valor numeric(14,0) not null check (valor > 0),
  fecha timestamptz not null default now(),
  responsable_id uuid not null references perfiles(id),
  sede_id uuid not null references sedes(id),
  es_inicial boolean not null default false,
  observaciones text,
  sync estado_sync not null default 'sincronizado',
  dispositivo text, hora_local timestamptz
);

create table abono_pagos (                               -- un abono puede tener varios métodos
  id uuid primary key default gen_random_uuid(),
  abono_id uuid not null references abonos(id),
  metodo_id integer not null references metodos_pago(id),
  valor numeric(14,0) not null check (valor > 0),
  referencia_bancaria text,
  soporte_url text,
  estado estado_pago not null,
  verificado_por uuid references perfiles(id),
  verificado_en timestamptz
);

create table reversos (                                  -- el pago original nunca se altera
  id uuid primary key default gen_random_uuid(),
  abono_pago_id uuid not null references abono_pagos(id),
  tipo tipo_reverso not null,
  valor numeric(14,0) not null check (valor > 0),
  motivo text not null,
  usuario_id uuid not null references perfiles(id) default auth.uid(),
  creado_en timestamptz not null default now()
);

create table comprobantes (
  id uuid primary key default gen_random_uuid(),
  abono_id uuid not null unique references abonos(id),   -- uno por abono
  numero text not null,
  generado_por uuid references perfiles(id),
  generado_en timestamptz not null default now()
);

create table entregas (
  id uuid primary key default gen_random_uuid(),
  separado_id uuid not null references separados(id),
  responsable_id uuid not null references perfiles(id),
  fecha timestamptz not null default now(),
  articulos jsonb not null,
  recibido_confirmado boolean not null,
  excepcion_saldo boolean not null default false,
  motivo_excepcion text,
  observaciones text,
  check (not excepcion_saldo or motivo_excepcion is not null)
);

create table cancelaciones (
  id uuid primary key default gen_random_uuid(),
  separado_id uuid not null unique references separados(id),
  motivo text not null,
  usuario_id uuid not null references perfiles(id) default auth.uid(),
  creado_en timestamptz not null default now()
);

-- ---------- SALDOS (siempre calculados) ----------
create view v_separados_saldo as
select s.id, s.sede_id, s.numero, s.valor_total,
  coalesce(sum(p.valor) filter (where p.estado='confirmado'),0)
    - coalesce((select sum(r.valor) from reversos r join abono_pagos x on x.id=r.abono_pago_id
                join abonos a2 on a2.id=x.abono_id where a2.separado_id=s.id),0)       as recibido_confirmado,
  coalesce(sum(p.valor) filter (where p.estado='pendiente_verificacion'),0)             as pendiente_verificacion,
  s.valor_total
    - (coalesce(sum(p.valor) filter (where p.estado='confirmado'),0)
    - coalesce((select sum(r.valor) from reversos r join abono_pagos x on x.id=r.abono_pago_id
                join abonos a2 on a2.id=x.abono_id where a2.separado_id=s.id),0))      as saldo
from separados s
left join abonos a on a.separado_id=s.id and a.sync='sincronizado'
left join abono_pagos p on p.abono_id=a.id
group by s.id;

-- ---------- REGISTRO DE ABONO (idempotente, validado en servidor) ----------
create function registrar_abono(p_id uuid, p_separado uuid, p_pagos jsonb, p_obs text default null,
                                p_dispositivo text default null, p_hora_local timestamptz default null)
returns uuid language plpgsql security definer as $$
declare v_sep separados; v_total numeric := 0; v_pago jsonb; v_met metodos_pago; v_est estado_pago;
begin
  if rol_actual() not in ('vendedor','cajero','administrador','gerencia') then
    raise exception 'Sin permiso para registrar abonos';
  end if;
  if exists (select 1 from abonos where id = p_id) then return p_id; end if;   -- evita duplicados
  select * into v_sep from separados where id = p_separado for update;
  if not found or not ve_sede(v_sep.sede_id) then raise exception 'Separado no disponible'; end if;
  if v_sep.estado = 'cancelado' then raise exception 'Separado cancelado'; end if;
  select coalesce(sum((x->>'valor')::numeric),0) into v_total from jsonb_array_elements(p_pagos) x;
  if v_total <= 0 then raise exception 'El abono debe ser mayor a cero'; end if;
  insert into abonos(id, separado_id, valor, responsable_id, sede_id, observaciones, dispositivo, hora_local)
    values (p_id, p_separado, v_total, auth.uid(), v_sep.sede_id, p_obs, p_dispositivo, p_hora_local);
  for v_pago in select * from jsonb_array_elements(p_pagos) loop
    select * into v_met from metodos_pago where id = (v_pago->>'metodo_id')::int;
    if v_met.requiere_referencia and coalesce(v_pago->>'referencia','') = '' then
      raise exception 'Falta referencia para %', v_met.nombre; end if;
    v_est := case when v_met.requiere_verificacion then 'pendiente_verificacion' else 'confirmado' end;
    insert into abono_pagos(abono_id, metodo_id, valor, referencia_bancaria, soporte_url, estado)
      values (p_id, v_met.id, (v_pago->>'valor')::numeric, v_pago->>'referencia', v_pago->>'soporte', v_est);
  end loop;
  insert into comprobantes(abono_id, numero, generado_por)
    values (p_id, v_sep.numero || '-A' || (select count(*) from abonos where separado_id = p_separado), auth.uid());
  return p_id;
end $$;

create function confirmar_transferencia(p_pago uuid) returns void
language plpgsql security definer as $$
begin
  if rol_actual() not in ('cajero','administrador','gerencia') then raise exception 'Sin permiso'; end if;
  update abono_pagos set estado='confirmado', verificado_por=auth.uid(), verificado_en=now()
   where id = p_pago and estado='pendiente_verificacion';
end $$;

create function consulta_publica(p_token text) returns jsonb       -- QR del cliente
language sql security definer stable as $$
  select jsonb_build_object('numero', s.numero, 'estado', s.estado, 'valor_total', s.valor_total,
    'abonos_confirmados', v.recibido_confirmado, 'saldo', v.saldo,
    'articulos', (select jsonb_agg(jsonb_build_object('descripcion', i.descripcion,'cantidad', i.cantidad))
                  from separado_items i where i.separado_id = s.id))
  from separados s join v_separados_saldo v on v.id = s.id where s.qr_token = p_token $$;

-- ---------- AUDITORÍA ----------
create table auditoria (
  id bigint generated always as identity primary key,
  usuario_id uuid, sede_id uuid,
  tabla text not null, registro_id text, operacion text not null,
  anterior jsonb, posterior jsonb, motivo text,
  creado_en timestamptz not null default now()
);

create function fn_auditar() returns trigger language plpgsql security definer as $$
begin
  insert into auditoria(usuario_id, tabla, registro_id, operacion, anterior, posterior)
  values (auth.uid(), tg_table_name, coalesce((to_jsonb(new)->>'id'),(to_jsonb(old)->>'id')), tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- ---------- INALTERABILIDAD ----------
create function fn_no_borrar() returns trigger language plpgsql as $$
begin raise exception 'Prohibido borrar registros de %', tg_table_name; end $$;

create function fn_pago_inmutable() returns trigger language plpgsql as $$
begin
  if (new.abono_id, new.metodo_id, new.valor, new.referencia_bancaria, new.id)
     is distinct from (old.abono_id, old.metodo_id, old.valor, old.referencia_bancaria, old.id) then
    raise exception 'Los datos de un pago no se pueden editar; registre un reverso'; end if;
  if old.estado = 'confirmado' and new.estado not in ('confirmado','reversado') then
    raise exception 'Un pago confirmado no puede volver a pendiente'; end if;
  if old.estado = 'reversado' and new.estado <> 'reversado' then
    raise exception 'Un pago reversado no puede reactivarse'; end if;
  return new;
end $$;

create function fn_reverso_marca() returns trigger language plpgsql security definer as $$
begin
  if (select coalesce(sum(valor),0) from reversos where abono_pago_id = new.abono_pago_id)
     >= (select valor from abono_pagos where id = new.abono_pago_id) then
    update abono_pagos set estado = 'reversado' where id = new.abono_pago_id;
  end if;
  return new;
end $$;

create function fn_abono_inmutable() returns trigger language plpgsql as $$
begin
  if (new.id, new.separado_id, new.valor, new.fecha) is distinct from (old.id, old.separado_id, old.valor, old.fecha)
  then raise exception 'Un abono no se puede modificar'; end if;
  return new;
end $$;

create function fn_entrega_con_saldo() returns trigger language plpgsql as $$
begin
  if not new.excepcion_saldo and (select saldo from v_separados_saldo where id = new.separado_id) > 0 then
    raise exception 'Hay saldo pendiente; la entrega requiere una excepción documentada'; end if;
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['separados','separado_items','abonos','abono_pagos','reversos','comprobantes',
                           'entregas','cancelaciones','modificaciones_separado','auditoria','consecutivos'] loop
    execute format('create trigger no_borrar_%1$s before delete on %1$s for each row execute function fn_no_borrar()', t);
  end loop;
  foreach t in array array['separados','separado_items','abonos','abono_pagos','reversos','entregas',
                           'cancelaciones','modificaciones_separado','clientes','perfiles','sedes','usuario_sedes'] loop
    execute format('create trigger audit_%1$s after insert or update or delete on %1$s for each row execute function fn_auditar()', t);
  end loop;
end $$;

create trigger pago_inmutable    before update on abono_pagos for each row execute function fn_pago_inmutable();
create trigger abono_inmutable   before update on abonos      for each row execute function fn_abono_inmutable();
create trigger reverso_marca     after insert  on reversos    for each row execute function fn_reverso_marca();
create trigger entrega_valida    before insert on entregas    for each row execute function fn_entrega_con_saldo();
create trigger auditoria_solo_lectura before update on auditoria for each row execute function fn_no_borrar();

-- ---------- ALERTAS Y CONFIGURACIÓN ----------
create table configuracion (clave text primary key, valor text not null, actualizado_por uuid, actualizado_en timestamptz default now());
insert into configuracion values ('abono_minimo','50000',null,now()),('dias_alerta_vencimiento','7',null,now()),
  ('plazo_defecto_dias','60',null,now());

create view v_alertas as
select s.id, s.sede_id, s.numero, s.fecha_limite, v.saldo, s.estado,
  case when s.estado in ('activo','pendiente_pago') and s.fecha_limite < current_date then 'vencido'
       when s.estado in ('activo','pendiente_pago') and s.fecha_limite <=
            current_date + (select valor::int from configuracion where clave='dias_alerta_vencimiento') then 'proximo_a_vencer'
       when s.estado = 'pendiente_entrega' then 'pagado_pendiente_entrega'
       when v.saldo > 0 and s.estado not in ('cancelado','entregado') then 'saldo_pendiente' end as tipo
from separados s join v_separados_saldo v on v.id = s.id;     -- no cancela nada de forma automática

-- ---------- SINCRONIZACIÓN OFFLINE ----------
create table sync_conflictos (
  id uuid primary key default gen_random_uuid(),
  tabla text not null, registro_id uuid not null, dispositivo text,
  usuario_id uuid references perfiles(id), detalle text not null,
  resuelto boolean not null default false, creado_en timestamptz not null default now()
);

-- ---------- RESPALDOS ----------
create table respaldos (
  id uuid primary key default gen_random_uuid(),
  ejecutado_en timestamptz not null default now(),
  exitoso boolean not null, detalle text,
  restauracion_probada boolean not null default false, probada_en timestamptz
);

-- ---------- RLS ----------
do $$ declare t text; begin
  foreach t in array array['sedes','perfiles','usuario_sedes','metodos_pago','clientes','catalogo','consecutivos',
    'separados','separado_items','modificaciones_separado','abonos','abono_pagos','reversos','comprobantes',
    'entregas','cancelaciones','auditoria','configuracion','sync_conflictos','respaldos'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

create policy sedes_ver      on sedes for select using (ve_sede(id));
create policy sedes_admin    on sedes for all using (rol_actual()='gerencia') with check (rol_actual()='gerencia');
create policy perfiles_ver   on perfiles for select using (id = auth.uid() or es_admin());
create policy perfiles_admin on perfiles for all using (rol_actual()='gerencia') with check (rol_actual()='gerencia');
create policy ususedes_ver   on usuario_sedes for select using (usuario_id = auth.uid() or es_admin());
create policy ususedes_admin on usuario_sedes for all using (rol_actual()='gerencia') with check (rol_actual()='gerencia');
create policy metodos_ver    on metodos_pago for select using (auth.uid() is not null);
create policy metodos_admin  on metodos_pago for all using (es_admin()) with check (es_admin());
create policy catalogo_ver   on catalogo for select using (auth.uid() is not null);
create policy catalogo_admin on catalogo for all using (es_admin()) with check (es_admin());
create policy clientes_ver   on clientes for select using (auth.uid() is not null);
create policy clientes_ins   on clientes for insert with check (rol_actual() in ('vendedor','cajero','administrador','gerencia'));
create policy clientes_upd   on clientes for update using (es_admin());

create policy sep_ver on separados for select using (
  ve_sede(sede_id) and (rol_actual() <> 'vendedor' or vendedor_id = auth.uid()));
create policy sep_ins on separados for insert with check (
  rol_actual() in ('vendedor','administrador','gerencia') and ve_sede(sede_id) and vendedor_id = auth.uid());
create policy sep_upd on separados for update using (es_admin() and ve_sede(sede_id));
-- sin política de DELETE: nadie puede borrar separados

create policy items_ver on separado_items for select using (exists (select 1 from separados s where s.id = separado_id));
create policy items_ins on separado_items for insert with check (exists (select 1 from separados s where s.id = separado_id));
create policy mods_ver  on modificaciones_separado for select using (exists (select 1 from separados s where s.id = separado_id));
create policy mods_ins  on modificaciones_separado for insert with check (es_admin() or rol_actual()='vendedor');
create policy abonos_ver on abonos for select using (exists (select 1 from separados s where s.id = separado_id));
create policy pagos_ver  on abono_pagos for select using (exists (select 1 from abonos a where a.id = abono_id));
create policy rev_ver    on reversos for select using (exists (select 1 from abono_pagos p join abonos a on a.id=p.abono_id where p.id = abono_pago_id));
create policy rev_ins    on reversos for insert with check (rol_actual() in ('cajero','administrador','gerencia'));
create policy comp_ver   on comprobantes for select using (exists (select 1 from abonos a where a.id = abono_id));
create policy ent_ver    on entregas for select using (exists (select 1 from separados s where s.id = separado_id));
create policy ent_ins    on entregas for insert with check (rol_actual() in ('vendedor','cajero','administrador','gerencia'));
create policy canc_ver   on cancelaciones for select using (exists (select 1 from separados s where s.id = separado_id));
create policy canc_ins   on cancelaciones for insert with check (rol_actual() in ('administrador','gerencia'));
create policy audit_ver  on auditoria for select using (es_admin());
create policy conf_ver   on configuracion for select using (auth.uid() is not null);
create policy conf_admin on configuracion for all using (rol_actual()='gerencia') with check (rol_actual()='gerencia');
create policy sync_ver   on sync_conflictos for select using (es_admin() or usuario_id = auth.uid());
create policy resp_ver   on respaldos for select using (rol_actual()='gerencia');
-- abonos / abono_pagos / comprobantes / consecutivos se escriben solo con las funciones security definer.

revoke all on auditoria, consecutivos, respaldos from anon, authenticated;
grant select on auditoria to authenticated;
grant execute on function consulta_publica(text) to anon;
