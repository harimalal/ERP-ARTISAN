-- Plafond de protection IA : 350 appels par semaine ISO et par tenant,
-- partagé par ai_analyse_bc (Import BC) et ai_extract_doc (onboarding).
-- Écriture réservée au serveur (service_role) : le navigateur peut lire
-- son compteur, jamais le modifier.

create table if not exists public.ai_usage_semaine (
  tenant_id  uuid        not null references public.tenants(id) on delete cascade,
  semaine    text        not null,
  appels     integer     not null default 0,
  tokens     bigint      not null default 0,
  updated_at timestamptz not null default now(),
  constraint ai_usage_semaine_pkey primary key (tenant_id, semaine)
);

alter table public.ai_usage_semaine enable row level security;

drop policy if exists ai_usage_semaine_lecture on public.ai_usage_semaine;
create policy ai_usage_semaine_lecture on public.ai_usage_semaine
  for select to authenticated
  using (tenant_id = public.my_tenant_id());

revoke insert, update, delete, truncate on public.ai_usage_semaine from anon, authenticated;

-- Réserve un appel AVANT l'appel Anthropic. Atomique : l'incrément et le
-- contrôle de la limite se font dans la même instruction, donc des requêtes
-- simultanées ne peuvent pas dépasser p_limite.
create or replace function public.reserver_appel_ia(p_tenant uuid, p_limite integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_semaine text := to_char(now() at time zone 'Europe/Paris', 'IYYY-"W"IW');
  v_appels  integer;
begin
  insert into ai_usage_semaine as u (tenant_id, semaine, appels)
  values (p_tenant, v_semaine, 1)
  on conflict on constraint ai_usage_semaine_pkey do update
    set appels = u.appels + 1, updated_at = now()
    where u.appels < p_limite
  returning u.appels into v_appels;

  if v_appels is not null then
    return jsonb_build_object('autorise', true, 'appels', v_appels, 'semaine', v_semaine);
  end if;

  select u.appels into v_appels
  from ai_usage_semaine u
  where u.tenant_id = p_tenant and u.semaine = v_semaine;

  return jsonb_build_object('autorise', false, 'appels', v_appels, 'semaine', v_semaine);
end;
$$;

create or replace function public.enregistrer_tokens_ia(p_tenant uuid, p_semaine text, p_tokens bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update ai_usage_semaine
  set tokens = tokens + greatest(coalesce(p_tokens, 0), 0), updated_at = now()
  where tenant_id = p_tenant and semaine = p_semaine;
$$;

revoke all on function public.reserver_appel_ia(uuid, integer)        from public, anon, authenticated;
revoke all on function public.enregistrer_tokens_ia(uuid, text, bigint) from public, anon, authenticated;
grant execute on function public.reserver_appel_ia(uuid, integer)        to service_role;
grant execute on function public.enregistrer_tokens_ia(uuid, text, bigint) to service_role;
