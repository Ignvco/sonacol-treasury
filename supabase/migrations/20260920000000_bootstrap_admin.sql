-- Bootstrap de una instalación vacía. En una base nueva, el primer perfil
-- registrado queda como administrador aprobado; de lo contrario nadie podría
-- autorizar accesos ni configurar alertas, porque la aprobación es solo para
-- administradores. En instalaciones con datos el comportamiento no cambia:
-- los perfiles nuevos siguen entrando como 'consulta' y 'pending'.
-- Solo reemplaza dos funciones: no toca tablas ni datos.
begin;
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_profile boolean;
begin
  select not exists(select 1 from public.profiles) into first_profile;
  insert into public.profiles(id,email,role,name)
  values(new.id,new.email,
    case when first_profile then 'administrador' else 'consulta' end,
    coalesce(new.raw_user_meta_data->>'name',split_part(coalesce(new.email,'usuario'),'@',1)))
  on conflict(id) do nothing;
  return new;
end; $$;

create or replace function public.treasury_new_access() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into public.treasury_access(user_id,status,can_export,can_delete)
  values(new.id,
    case when new.role='administrador' then 'approved' else 'pending' end,
    new.role in ('administrador','tesoreria','contabilidad'),
    new.role='administrador')
  on conflict(user_id) do nothing;
  return new;
end; $$;
notify pgrst,'reload schema';
commit;
