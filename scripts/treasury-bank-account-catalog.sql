-- SONACOL Treasury / PATCH 07. MANUAL, REVIEWED installation ONLY.
-- Never run via automatic db push while migration-history drift is unresolved.
-- A catalog entry binds an ERP ledger to a physical bank account; it does not
-- change any financial posting, historic opening, reconciliation or forecast.
begin;
select pg_advisory_xact_lock(728394107);

-- Fail closed on reruns and collisions: no implicit schema replacement.
do $$ begin
 if to_regclass('public.treasury_bank_account_catalog') is not null
    or to_regclass('public.treasury_bank_account_catalog_events') is not null
    or to_regprocedure('public.treasury_bank_catalog()') is not null
    or to_regprocedure('public.treasury_save_bank_binding(text,text,text,text,text,text,integer)') is not null then
  raise exception 'PATCH 07 ya existe o está parcialmente instalado; revisar, NO ejecutar de nuevo.';
 end if;
 if to_regprocedure('public.treasury_require(boolean,text)') is null
    or to_regprocedure('public.current_role()') is null then
  raise exception 'Faltan funciones de autorización de tesorería.';
 end if;
end $$;

create table public.treasury_bank_account_catalog (
 company text not null check(company = btrim(company) and length(company) between 1 and 80),
 ledger text not null check(ledger = btrim(ledger) and length(ledger) between 1 and 80),
 currency text not null check(currency ~ '^[A-Z]{3}$'),
 bank text not null check(bank = btrim(bank) and length(bank) between 2 and 120),
 bank_key text generated always as (upper(regexp_replace(btrim(bank), '[[:space:]]+', ' ', 'g'))) stored,
 account_number text not null check(account_number ~ '^[0-9]{5,30}$'),
 evidence_ref text not null check(length(btrim(evidence_ref)) between 5 and 300),
 verified_by uuid not null references public.profiles(id),
 verified_at timestamptz not null default clock_timestamp(),
 revision integer not null default 1 check(revision >= 1),
 primary key(company,ledger,currency),
 unique(company,bank_key,currency,account_number)
);
create table public.treasury_bank_account_catalog_events (
 id bigint generated always as identity primary key,
 company text not null, ledger text not null, currency text not null,
 event text not null check(event in ('created','reverified')),
 revision integer not null,
 actor uuid not null references public.profiles(id),
 bank text not null,
 previous_last4 text,
 current_last4 text not null,
 evidence_ref text not null,
 recorded_at timestamptz not null default clock_timestamp()
);
alter table public.treasury_bank_account_catalog enable row level security;
alter table public.treasury_bank_account_catalog_events enable row level security;
revoke all on public.treasury_bank_account_catalog,public.treasury_bank_account_catalog_events from public,anon,authenticated;
revoke all on sequence public.treasury_bank_account_catalog_events_id_seq from public,anon,authenticated;
-- No policies: authenticated users cannot SELECT the raw account number or event log.
-- Only the following SECURITY DEFINER RPCs expose authorized, redacted data.

create function public.treasury_bank_catalog() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 perform public.treasury_require();
 return coalesce((select jsonb_agg(jsonb_build_object(
  'company',c.company,'ledger',c.ledger,'currency',c.currency,'bank',c.bank,
  'maskedNumber','•••• '||right(c.account_number,4),
  'verifiedAt',c.verified_at,'revision',c.revision
 ) order by c.company,c.ledger,c.currency)
 from public.treasury_bank_account_catalog c),'[]'::jsonb);
end; $$;
revoke all on function public.treasury_bank_catalog() from public,anon,authenticated;
grant execute on function public.treasury_bank_catalog() to authenticated;

create function public.treasury_save_bank_binding(
 p_company text, p_ledger text, p_currency text, p_bank text,
 p_account_number text, p_evidence_ref text, p_expected_revision integer default null
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp set statement_timeout='20s' as $$
declare
 c text:=btrim(p_company); l text:=btrim(p_ledger); cur text:=upper(btrim(p_currency));
 bank_name text:=btrim(p_bank); num text; evidence text:=btrim(p_evidence_ref);
 previous public.treasury_bank_account_catalog%rowtype;
 saved public.treasury_bank_account_catalog%rowtype;
 operation text;
begin
 perform public.treasury_require(true);
 if public.current_role() is distinct from 'administrador' then
  raise exception 'Solo el administrador puede verificar números de cuenta bancaria.' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(728394107);
 if p_company is null or p_ledger is null or p_currency is null or p_bank is null
   or p_account_number is null or p_evidence_ref is null then
  raise exception 'Datos bancarios y evidencia obligatorios.';
 end if;
 if c is distinct from p_company or length(c) not between 1 and 80
    or l is distinct from p_ledger or length(l) not between 1 and 80
    or cur !~ '^[A-Z]{3}$' or length(bank_name) not between 2 and 120
    or length(evidence) not between 5 and 300 then
  raise exception 'Empresa, cuenta contable, moneda, banco o evidencia inválidos.';
 end if;
 -- Permit only separators accepted by the frontend contract. Preserve zeros.
 if btrim(p_account_number) !~ '^[0-9][0-9 -]*[0-9]$' then
  raise exception 'Número bancario inválido; ingresar solo dígitos y separadores.';
 end if;
 num:=replace(replace(btrim(p_account_number),' ',''),'-','');
 if length(num) not between 5 and 30 then raise exception 'Longitud de cuenta bancaria inválida.'; end if;
 -- Evidence metadata must not accidentally reproduce the protected number.
 if position(num in regexp_replace(evidence,'[^0-9]','','g'))>0 then
  raise exception 'La referencia documental no debe incluir el número bancario completo.';
 end if;
 if exists(select 1 from public.treasury_bank_account_catalog t
   where t.company=c and t.bank_key=upper(regexp_replace(bank_name,'[[:space:]]+',' ','g'))
    and t.currency=cur and t.account_number=num and t.ledger<>l) then
  raise exception 'Número bancario ya vinculado a otra cuenta contable; requiere revisión.';
 end if;
 select * into previous from public.treasury_bank_account_catalog
  where company=c and ledger=l and currency=cur for update;
 if found then
  if p_expected_revision is distinct from previous.revision then
   raise exception 'Vinculación modificada por otro usuario; actualizar y revisar de nuevo.';
  end if;
  update public.treasury_bank_account_catalog
   set bank=bank_name,account_number=num,evidence_ref=evidence,
       verified_by=auth.uid(),verified_at=clock_timestamp(),revision=revision+1
   where company=c and ledger=l and currency=cur returning * into saved;
  operation:='reverified';
 else
  if p_expected_revision is not null then
   raise exception 'No existe la vinculación esperada; actualizar el catálogo.';
  end if;
  insert into public.treasury_bank_account_catalog(company,ledger,currency,bank,account_number,evidence_ref,verified_by)
   values(c,l,cur,bank_name,num,evidence,auth.uid()) returning * into saved;
  operation:='created';
 end if;
 insert into public.treasury_bank_account_catalog_events
  (company,ledger,currency,event,revision,actor,bank,previous_last4,current_last4,evidence_ref)
 values(c,l,cur,operation,saved.revision,auth.uid(),bank_name,
  case when operation='reverified' then right(previous.account_number,4) else null end,
  right(saved.account_number,4),evidence);
 -- Financial audit log NEVER receives a complete bank-account number.
 perform public.treasury_audit('Verificó cuenta bancaria','Catálogo bancario',null,
  jsonb_build_object('company',c,'ledger',l,'currency',cur,'bank',bank_name,
   'revision',saved.revision,'event',operation,'maskedNumber','•••• '||right(saved.account_number,4)));
 return jsonb_build_object('company',c,'ledger',l,'currency',cur,'bank',bank_name,
  'maskedNumber','•••• '||right(saved.account_number,4),'verifiedAt',saved.verified_at,
  'revision',saved.revision);
end; $$;
revoke all on function public.treasury_save_bank_binding(text,text,text,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.treasury_save_bank_binding(text,text,text,text,text,text,integer) to authenticated;
notify pgrst,'reload schema';
commit;
