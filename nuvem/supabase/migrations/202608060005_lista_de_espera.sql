-- Evidentia · Revalida — lista de espera de quem quis comprar e nao pode.
--
-- Existe porque a pagina de vendas ja dizia «Deixe seu e-mail salvo e volte em breve»
-- quando o cobro nao esta ativo, e nao havia uma linha de codigo que guardasse nada.
-- Prometer e nao cumprir e pior do que nao prometer — e, sem cobranca ativa, esse
-- e-mail e a unica coisa de valor que a visita deixa.
--
-- A porta e publica de proposito: quem se interessa ainda nao tem conta. O que a
-- protege e o mesmo desenho do resto: validacao no banco, limite de ritmo, e nenhuma
-- leitura para o cliente.

begin;

create table if not exists public.interessados (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  plano_id text references public.planos(id) on delete set null,
  origem text,
  criado_em timestamptz not null default now(),
  avisado_em timestamptz,
  constraint interessados_email_valido check (position('@' in email) > 1
                                              and char_length(email) between 5 and 200),
  constraint interessados_origem_tamanho check (origem is null or char_length(origem) <= 60)
);

-- Um e-mail entra uma vez por plano: reenviar o formulario nao duplica a lista.
create unique index if not exists interessados_email_plano_idx
  on public.interessados (email, coalesce(plano_id, ''));
create index if not exists interessados_criado_idx on public.interessados (criado_em desc);

alter table public.interessados enable row level security;
-- Sem policy de leitura: a lista e do dono, e ele a ve pelo painel (RPC de admin).

create or replace function public.registrar_interesse(
  p_email text,
  p_plano_id text default null,
  p_origem text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_plano text := nullif(lower(btrim(coalesce(p_plano_id, ''))), '');
  v_recentes integer;
begin
  if v_email !~ '^[^@[:space:]]{1,120}@[^@[:space:]]{1,120}\.[a-z]{2,24}$' then
    raise exception 'email invalido' using errcode = '22023';
  end if;
  if v_plano is not null and not exists (select 1 from public.planos where id = v_plano) then
    v_plano := null;   -- um plano desconhecido nao derruba o cadastro do interesse
  end if;

  -- A porta e publica: sem limite, um roteiro enche a tabela num minuto.
  select count(*) into v_recentes from public.interessados
   where email = v_email and criado_em > now() - interval '1 hour';
  if v_recentes >= 5 then
    raise exception 'muitos registros para este e-mail' using errcode = '53400';
  end if;

  insert into public.interessados (email, plano_id, origem)
  values (v_email, v_plano, left(btrim(coalesce(p_origem, 'pagina_de_vendas')), 60))
  on conflict (email, coalesce(plano_id, '')) do nothing;

  return jsonb_build_object('ok', true);
end;
$$;

-- O dono ve a lista pelo painel: quantas pessoas, quais planos, quem ainda nao foi avisado.
create or replace function public.listar_interessados(p_limite integer default 200)
returns table (email text, plano_id text, origem text, criado_em timestamptz, avisado_em timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.revalida_e_admin() then
    raise exception 'apenas administradores' using errcode = '42501';
  end if;
  return query
    select i.email, i.plano_id, i.origem, i.criado_em, i.avisado_em
      from public.interessados as i
     order by i.criado_em desc
     limit greatest(1, least(coalesce(p_limite, 200), 1000));
end;
$$;

create or replace function public.resumo_interesse()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.revalida_e_admin() then
    raise exception 'apenas administradores' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'total', (select count(*) from public.interessados),
    'ultimos_7d', (select count(*) from public.interessados
                    where criado_em > now() - interval '7 days'),
    'por_plano', (select coalesce(jsonb_object_agg(coalesce(plano_id, 'sem_plano'), n), '{}'::jsonb)
                    from (select plano_id, count(*) as n from public.interessados
                           group by plano_id) as t),
    'nao_avisados', (select count(*) from public.interessados where avisado_em is null)
  );
end;
$$;

revoke all on public.interessados from anon, authenticated;
revoke all on function public.registrar_interesse(text, text, text) from public;
grant execute on function public.registrar_interesse(text, text, text) to anon, authenticated;
revoke all on function public.listar_interessados(integer) from public, anon;
revoke all on function public.resumo_interesse() from public, anon;
grant execute on function public.listar_interessados(integer) to authenticated;
grant execute on function public.resumo_interesse() to authenticated;

commit;
