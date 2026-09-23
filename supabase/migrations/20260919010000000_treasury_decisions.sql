begin;
create table public.treasury_settings(id boolean primary key default true check(id), minimums jsonb not null default '{"CLP":0,"USD":0,"UF":0,"UTM":0}', stale_hours int not null default 30 check(stale_hours between 1 and 168));
insert into public.treasury_settings default values;
create table public.treasury_scenarios (
 id uuid primary key default gen_random_uuid(), batch_id uuid not null references public.daily_base_batches(id) on delete cascade,
 name text not null, context jsonb not null, adjustments jsonb not null, snapshot jsonb not null, source_revision text not null,
 revision int not null default 1, engine_version text not null default 'decision-v1', created_by uuid references public.profiles(id), created_at timestamptz not null default clock_timestamp()
);
create table public.treasury_forecasts (
 id uuid primary key default gen_random_uuid(), batch_id uuid not null references public.daily_base_batches(id) on delete cascade,
 context jsonb not null, snapshot jsonb not null, source_revision text not null, engine_version text not null default 'decision-v1',
 created_by uuid references public.profiles(id),created_at timestamptz not null default clock_timestamp(), unique(batch_id,source_revision,context)
);
create table public.treasury_tasks (
 id uuid primary key default gen_random_uuid(), batch_id uuid references public.daily_base_batches(id) on delete cascade,
 title text not null check(length(title) between 1 and 200), note text not null default '' check(length(note)<=2000),
 due_date date not null, assignee uuid references public.profiles(id), status text not null default 'open' check(status in ('open','done')),
 revision int not null default 1,created_by uuid references public.profiles(id),updated_at timestamptz not null default clock_timestamp()
);
create table public.treasury_manual_details (
 batch_id uuid not null, manual_id uuid not null, estimated_date date, due_date date, confirmed_date date, assignee uuid references public.profiles(id), recurrence_id uuid,
 primary key(batch_id,manual_id),foreign key(batch_id,manual_id) references public.daily_manual(batch_id,id) on delete cascade
);
create table public.treasury_comments (
 id uuid primary key default gen_random_uuid(),batch_id uuid not null,manual_id uuid not null,
 body text not null check(length(body) between 1 and 2000),author uuid references public.profiles(id),created_at timestamptz not null default clock_timestamp(),
 foreign key(batch_id,manual_id) references public.daily_manual(batch_id,id) on delete cascade
);
create table public.treasury_attachments (
 id uuid primary key default gen_random_uuid(),batch_id uuid not null,manual_id uuid not null,name text not null check(length(name) between 1 and 200),
 mime text not null check(mime in ('application/pdf','image/png','image/jpeg','text/plain')),content bytea not null check(octet_length(content) between 1 and 2097152),
 author uuid references public.profiles(id),created_at timestamptz not null default clock_timestamp(),foreign key(batch_id,manual_id) references public.daily_manual(batch_id,id) on delete cascade
);
create function public.treasury_members() returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin perform public.treasury_require(); return (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'role',p.role) order by p.name),'[]') from public.profiles p join public.treasury_access a on a.user_id=p.id where a.status='approved'); end; $$;
create function public.treasury_revision(p_batch uuid) returns text language sql stable security definer set search_path=public,pg_temp as $$ select md5(((s - 'latestId' - 'links') || jsonb_build_object('links', coalesce((select jsonb_agg(l order by l::text) from jsonb_array_elements(s->'links') l),'[]'::jsonb)))::text) from (select public.get_daily_base_snapshot(p_batch) s) snapshot; $$;
create function public.treasury_workspace(p_batch uuid default null) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare bid uuid:=coalesce(p_batch,public.daily_latest()); prev uuid;
begin
 perform public.treasury_require();
 if bid is not null and not exists(select 1 from public.daily_base_batches where id=bid) then raise exception 'La BASE ya no existe.'; end if;
 select id into prev from public.daily_base_batches where cutoff<(select cutoff from public.daily_base_batches where id=bid) order by cutoff desc,created_at desc,id desc limit 1;
 return jsonb_build_object('revision',public.treasury_revision(bid),'previous',case when prev is null then null else public.get_daily_base_snapshot(prev) end,
 'settings',(select to_jsonb(s) from public.treasury_settings s),
 'tasks',coalesce((select jsonb_agg(t order by due_date,id) from public.treasury_tasks t where batch_id=bid or batch_id is null),'[]'),
 'scenarios',coalesce((select jsonb_agg(to_jsonb(s)-'snapshot'-'adjustments' order by created_at desc) from public.treasury_scenarios s where batch_id=bid),'[]'),
 'details',coalesce((select jsonb_agg(d) from public.treasury_manual_details d where batch_id=bid),'[]'),
 'comments',coalesce((select jsonb_agg(c order by created_at,id) from public.treasury_comments c where batch_id=bid),'[]'),
 'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',id,'manual_id',manual_id,'name',name,'size',octet_length(content))) from public.treasury_attachments where batch_id=bid),'[]'));
end; $$;
create function public.treasury_save_settings(p_minimums jsonb,p_stale_hours int) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare pair record; begin
 perform public.treasury_require(true);
 if public.current_role()<>'administrador' then raise exception 'Solo administración puede configurar alertas.'; end if;
 if jsonb_typeof(p_minimums) is distinct from 'object' or p_stale_hours is null then raise exception 'Configuración inválida.'; end if;
 for pair in select * from jsonb_each_text(p_minimums) loop
 if pair.key not in ('CLP','USD','UF','UTM') or pair.value !~ '^[0-9]+([.][0-9]+)?$' then raise exception 'Umbral o moneda inválidos.'; end if;
 end loop;
 update public.treasury_settings set minimums='{"CLP":0,"USD":0,"UF":0,"UTM":0}'::jsonb||p_minimums,stale_hours=p_stale_hours;
 perform public.treasury_audit('Configuró umbrales','Alertas',null,p_minimums);
end; $$;
create function public.treasury_validate_scenario(p_batch uuid,p_source_revision text,p_context jsonb,p_adjustments jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare snap jsonb; item jsonb; target jsonb;
begin
 perform public.treasury_require(true); perform pg_advisory_xact_lock(728394107);
 if not exists(select 1 from public.daily_base_batches where id=p_batch) then raise exception 'La BASE ya no existe.'; end if;
 if public.treasury_revision(p_batch) is distinct from p_source_revision then raise exception 'La BASE o MANUAL cambiaron. Revisa y rebasa tus supuestos antes de guardar.'; end if;
 if coalesce(p_context->>'currency','') not in ('CLP','USD','UF','UTM') or coalesce(p_context->>'horizon','') !~ '^[0-9]+$'
 or (p_context->>'horizon')::int not between 1 and 366 or coalesce(p_context->>'minimum','') !~ '^[0-9]+([.][0-9]+)?$'
 or p_context->>'cutoff' is distinct from (select cutoff::text from public.daily_base_batches where id=p_batch) then raise exception 'Contexto financiero inválido.'; end if;
 if jsonb_typeof(p_adjustments) is distinct from 'array' or jsonb_array_length(p_adjustments)>20000 then raise exception 'Supuestos inválidos.'; end if;
 if exists(select 1 from jsonb_array_elements(p_adjustments) x group by x->>'key' having count(*)>1) then raise exception 'Supuesto duplicado.'; end if;
 snap:=public.get_daily_base_snapshot(p_batch);
 for item in select value from jsonb_array_elements(p_adjustments) loop
 select value into target from jsonb_array_elements((snap->'rows')||(snap->'manual')) r where (r->>'kind')||':'||(r->>'id')=item->>'key';
 if target is null or target->>'kind'='cash_flow' then raise exception 'Los supuestos solo pueden modificar movimientos futuros existentes.'; end if;
 if item ? 'amount' and (coalesce(item->>'amount','') !~ '^[0-9]+([.][0-9]+)?$' or (item->>'amount')::numeric<=0) then raise exception 'Importe inválido.'; end if;
 if item ? 'date' then
 if coalesce(item->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Fecha inválida.'; end if;
 perform (item->>'date')::date; end if;
 if item ? 'excluded' and jsonb_typeof(item->'excluded')<>'boolean' then raise exception 'Exclusión inválida.'; end if;
 end loop;
 return snap;
end; $$;
create function public.treasury_save_scenario(p_id uuid,p_revision int,p_batch uuid,p_source_revision text,p_name text,p_context jsonb,p_adjustments jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare snap jsonb; item public.treasury_scenarios%rowtype;
begin
 snap:=public.treasury_validate_scenario(p_batch,p_source_revision,p_context,p_adjustments);
 if length(trim(coalesce(p_name,''))) not between 1 and 120 then raise exception 'Escribe un nombre de hasta 120 caracteres.'; end if;
 if p_id is not null then
 select * into item from public.treasury_scenarios where id=p_id for update;
 if not found or item.revision is distinct from p_revision or item.batch_id<>p_batch then raise exception 'El escenario cambió o ya no existe.'; end if;
 end if;
 insert into public.treasury_scenarios(id,batch_id,name,context,adjustments,snapshot,source_revision,created_by)
 values(coalesce(p_id,gen_random_uuid()),p_batch,trim(p_name),p_context,p_adjustments,snap,p_source_revision,auth.uid())
 on conflict(id) do update set name=excluded.name,context=excluded.context,adjustments=excluded.adjustments,snapshot=excluded.snapshot,source_revision=excluded.source_revision,revision=treasury_scenarios.revision+1 returning * into item;
 perform public.treasury_audit('Guardó escenario','Escenarios',null,jsonb_build_object('id',item.id,'revision',item.revision,'context',p_context));
 return to_jsonb(item);
end; $$;
create function public.treasury_freeze_forecast(p_batch uuid,p_source_revision text,p_context jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare snap jsonb; item public.treasury_forecasts%rowtype;
begin
 snap:=public.treasury_validate_scenario(p_batch,p_source_revision,p_context,'[]');
 insert into public.treasury_forecasts(batch_id,source_revision,context,snapshot,created_by) values(p_batch,p_source_revision,p_context,snap,auth.uid())
 on conflict(batch_id,source_revision,context) do nothing returning * into item;
 if item.id is null then select * into item from public.treasury_forecasts where batch_id=p_batch and source_revision=p_source_revision and context=p_context; end if;
 perform public.treasury_audit('Congeló previsión','Precisión',null,jsonb_build_object('id',item.id)); return to_jsonb(item);
end; $$;
create function public.treasury_save_task(p_id uuid,p_revision int,p_batch uuid,p_title text,p_note text,p_date date,p_assignee uuid,p_status text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.treasury_tasks%rowtype;
begin
 perform public.treasury_require(true);
 if p_assignee is not null and not exists(select 1 from public.treasury_access where user_id=p_assignee and status='approved') then raise exception 'Responsable no autorizado.'; end if;
 if p_id is not null then select * into item from public.treasury_tasks where id=p_id for update;
 if not found or item.revision is distinct from p_revision or item.batch_id is distinct from p_batch then raise exception 'La tarea cambió. Actualiza la pantalla.'; end if; end if;
 insert into public.treasury_tasks(id,batch_id,title,note,due_date,assignee,status,created_by) values(coalesce(p_id,gen_random_uuid()),p_batch,trim(p_title),p_note,p_date,p_assignee,p_status,auth.uid())
 on conflict(id) do update set title=excluded.title,note=excluded.note,due_date=excluded.due_date,assignee=excluded.assignee,status=excluded.status,revision=treasury_tasks.revision+1,updated_at=clock_timestamp() returning * into item;
 perform public.treasury_audit('Guardó tarea','Agenda',null,to_jsonb(item)); return to_jsonb(item);
end; $$;
create function public.treasury_save_manual(p_batch uuid,p_id uuid,p_revision int,p_values jsonb,p_details jsonb,p_frequency text default null,p_count int default 1) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare item jsonb; result jsonb:='[]'; start_day date; day date; recurrence uuid; assignee uuid; i int;
begin
 perform public.treasury_require(true); perform pg_advisory_xact_lock(728394107);
 if p_count is null or p_count not between 1 and 60 or (p_id is not null and p_count<>1) or (p_count>1 and coalesce(p_frequency,'') not in ('weekly','monthly')) then raise exception 'Recurrencia inválida. Máximo 60 movimientos nuevos.'; end if;
 start_day:=coalesce(nullif(p_details->>'confirmed_date','')::date,(p_values->>'date')::date); assignee:=nullif(p_details->>'assignee','')::uuid;
 if assignee is not null and not exists(select 1 from public.treasury_access where user_id=assignee and status='approved') then raise exception 'Responsable no autorizado.'; end if;
 if p_count>1 then recurrence:=gen_random_uuid(); end if;
 for i in 0..p_count-1 loop
 day:=case p_frequency when 'weekly' then start_day+i*7 when 'monthly' then (start_day+make_interval(months=>i))::date else start_day end;
 item:=public.save_daily_manual(p_batch,p_id,p_revision,p_values||jsonb_build_object('date',day));
 insert into public.treasury_manual_details(batch_id,manual_id,estimated_date,due_date,confirmed_date,assignee,recurrence_id)
 values(p_batch,(item->>'id')::uuid,case p_frequency when 'weekly' then (p_values->>'date')::date+i*7 when 'monthly' then ((p_values->>'date')::date+make_interval(months=>i))::date else (p_values->>'date')::date end,nullif(p_details->>'due_date','')::date+(day-start_day),case when nullif(p_details->>'confirmed_date','') is not null then day else null end,assignee,recurrence)
 on conflict(batch_id,manual_id) do update set estimated_date=excluded.estimated_date,due_date=excluded.due_date,confirmed_date=excluded.confirmed_date,assignee=excluded.assignee;
 result:=result||jsonb_build_array(item);
 end loop;
 perform public.treasury_audit('Guardó agenda MANUAL','Agenda',null,jsonb_build_object('batch',p_batch,'count',p_count,'frequency',p_frequency));
 return result;
end; $$;
create function public.treasury_carry_details() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.treasury_manual_details(batch_id,manual_id,estimated_date,due_date,confirmed_date,assignee,recurrence_id)
 select new.batch_id,new.id,d.estimated_date,d.due_date,d.confirmed_date,d.assignee,d.recurrence_id from public.treasury_manual_details d join public.daily_base_batches b on b.id=d.batch_id
 where d.manual_id=new.id and d.batch_id<>new.batch_id and b.cutoff<=(select cutoff from public.daily_base_batches where id=new.batch_id)
 order by b.cutoff desc,b.created_at desc,b.id desc limit 1 on conflict do nothing; return new;
end; $$;
create trigger treasury_manual_carry after insert on public.daily_manual for each row when(new.edited) execute function public.treasury_carry_details();
create function public.treasury_comment(p_batch uuid,p_manual uuid,p_body text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.treasury_require(true); perform pg_advisory_xact_lock(728394107);
 if not exists(select 1 from public.daily_manual where batch_id=p_batch and id=p_manual and not deleted) then raise exception 'MANUAL no está disponible.'; end if;
 insert into public.treasury_comments(batch_id,manual_id,body,author) values(p_batch,p_manual,trim(p_body),auth.uid());
 perform public.treasury_audit('Comentó MANUAL','Agenda',null,jsonb_build_object('batch',p_batch,'id',p_manual));
end; $$;
create function public.treasury_attach(p_batch uuid,p_manual uuid,p_name text,p_mime text,p_content text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.treasury_require(true); perform pg_advisory_xact_lock(728394107);
 if not exists(select 1 from public.daily_manual where batch_id=p_batch and id=p_manual and not deleted) then raise exception 'MANUAL no está disponible.'; end if;
 if (select count(*) from public.treasury_attachments where batch_id=p_batch and manual_id=p_manual)>=10 then raise exception 'Máximo 10 adjuntos por movimiento.'; end if;
 if length(p_content)>2800000 then raise exception 'Máximo 2 MB por adjunto.'; end if;
 insert into public.treasury_attachments(batch_id,manual_id,name,mime,content,author) values(p_batch,p_manual,p_name,p_mime,decode(p_content,'base64'),auth.uid());
 perform public.treasury_audit('Adjuntó documento','Agenda',null,jsonb_build_object('batch',p_batch,'id',p_manual,'name',p_name));
end; $$;
create function public.treasury_attachment(p_id uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin perform public.treasury_require(false,'export'); perform public.treasury_audit('Descargó adjunto','Agenda',null,jsonb_build_object('id',p_id));
 return (select jsonb_build_object('name',name,'content',encode(content,'base64')) from public.treasury_attachments where id=p_id); end; $$;
create function public.treasury_read(p_kind text,p_id uuid default null,p_offset int default 0) returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform public.treasury_require();
 if p_offset<0 then raise exception 'Página inválida.'; end if;
 case p_kind
 when 'scenario' then return (select to_jsonb(s) from public.treasury_scenarios s where id=p_id);
 when 'forecasts' then return (select coalesce(jsonb_agg(f),'[]') from (select * from public.treasury_forecasts order by created_at desc,id desc offset p_offset limit 50) f);
 when 'observations' then return (with batches as(select distinct on(cutoff) id,cutoff from public.daily_base_batches order by cutoff,created_at desc,id desc)
 select coalesce(jsonb_agg(x order by date,currency),'[]') from (select b.cutoff::text date,r.normalized_json->>'currency' currency,
 sum((r.normalized_json->>'amount')::numeric*case when r.normalized_json->>'type'='expense' then -1 else 1 end) amount
 from batches b join public.daily_base_rows r on r.batch_id=b.id where r.entity_type='cash_flow' and r.normalized_json->>'sourceOrigin'='BANCO'
 and (r.normalized_json->>'date')::date<=b.cutoff group by b.cutoff,r.normalized_json->>'currency') x);
 when 'access' then
 if public.current_role()<>'administrador' then raise exception 'Solo administración puede revisar accesos.' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'email',p.email,'role',p.role,'status',a.status,'can_export',a.can_export,'can_delete',a.can_delete) order by p.name),'[]') from public.profiles p join public.treasury_access a on a.user_id=p.id);
 else raise exception 'Consulta desconocida.'; end case;
end; $$;
-- All new state is read-only through table APIs, with authenticated RPC writes.
do $$ declare t text; f record; begin
 foreach t in array array['treasury_settings','treasury_scenarios','treasury_forecasts','treasury_tasks','treasury_manual_details','treasury_comments','treasury_attachments'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 if t<>'treasury_attachments' then
 execute format('grant select on public.%I to authenticated',t);
 execute format('create policy approved_read on public.%I for select to authenticated using(public.treasury_approved())',t); end if;
 end loop;
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('treasury_members','treasury_revision','treasury_workspace','treasury_save_settings','treasury_validate_scenario','treasury_save_scenario','treasury_freeze_forecast','treasury_save_task','treasury_save_manual','treasury_carry_details','treasury_comment','treasury_attach','treasury_attachment','treasury_read') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 if f.proname not in ('treasury_validate_scenario','treasury_carry_details') then execute format('grant execute on function %s to authenticated',f.signature); end if;
 end loop;
end; $$;
notify pgrst,'reload schema';
commit;
