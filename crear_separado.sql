-- Crear separado: todo en una sola transacción, con consecutivo y validaciones en el servidor.
create or replace function crear_separado(
  p_id uuid, p_sede uuid, p_documento text, p_nombre text, p_celular text, p_direccion text,
  p_items jsonb, p_fecha_limite date, p_obs text, p_pagos jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_cli uuid; v_total numeric; v_min numeric; v_ini numeric; v_item jsonb; v_num text; v_ab uuid := gen_random_uuid();
begin
  if rol_actual() not in ('vendedor','administrador','gerencia') then raise exception 'Sin permiso para crear separados'; end if;
  if not ve_sede(p_sede) then raise exception 'Sede no autorizada'; end if;
  if exists (select 1 from separados where id = p_id) then return p_id; end if;   -- reintento: no duplica
  if coalesce(trim(p_documento),'')='' or coalesce(trim(p_nombre),'')='' or coalesce(trim(p_celular),'')=''
    then raise exception 'Faltan datos del cliente'; end if;
  if p_fecha_limite is null then raise exception 'Falta la fecha límite'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Agregue al menos un artículo'; end if;
  select coalesce(sum((x->>'cantidad')::int * (x->>'precio')::numeric - coalesce((x->>'descuento')::numeric,0)),0)
    into v_total from jsonb_array_elements(p_items) x;
  if v_total <= 0 then raise exception 'El valor total debe ser mayor a cero'; end if;
  select coalesce(sum((x->>'valor')::numeric),0) into v_ini from jsonb_array_elements(p_pagos) x;
  select valor::numeric into v_min from configuracion where clave = 'abono_minimo';
  if v_ini < coalesce(v_min,50000) then raise exception 'El abono inicial mínimo es $%', coalesce(v_min,50000); end if;
  if v_ini > v_total then raise exception 'El abono no puede superar el valor total'; end if;

  insert into clientes(documento,nombre,celular,direccion,creado_por)
    values (trim(p_documento),trim(p_nombre),trim(p_celular),nullif(trim(p_direccion),''),auth.uid())
    on conflict (documento) do nothing;
  select id into v_cli from clientes where documento = trim(p_documento);

  v_num := siguiente_consecutivo(p_sede);
  insert into separados(id,sede_id,numero,cliente_id,vendedor_id,responsable_recaudo,valor_total,fecha_limite,observaciones,estado)
    values (p_id,p_sede,v_num,v_cli,auth.uid(),auth.uid(),v_total,p_fecha_limite,p_obs,'pendiente_pago');
  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into separado_items(separado_id,categoria,descripcion,marca,referencia,medida,cantidad,precio_unitario,descuento)
    values (p_id, v_item->>'categoria', v_item->>'descripcion', nullif(v_item->>'marca',''), nullif(v_item->>'referencia',''),
            nullif(v_item->>'medida',''), (v_item->>'cantidad')::int, (v_item->>'precio')::numeric, coalesce((v_item->>'descuento')::numeric,0));
  end loop;
  perform registrar_abono(v_ab, p_id, p_pagos, 'Abono inicial');
  update abonos set es_inicial = true where id = v_ab;
  return p_id;
end $$;

revoke execute on function crear_separado(uuid,uuid,text,text,text,text,jsonb,date,text,jsonb) from public, anon;
grant  execute on function crear_separado(uuid,uuid,text,text,text,text,jsonb,date,text,jsonb) to authenticated;
