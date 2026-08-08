-- Evidentia · Revalida — privacidade, retencao e endurecimento do backend.
--
-- Esta migracao e deliberadamente aditiva: corrige o estado produzido pelas
-- migracoes anteriores sem reescrever o historico. Pode ser aplicada novamente.

begin;

-- ---------------------------------------------------------------------------
-- Auditoria: nunca guardar credenciais, e-mail ou identificadores redundantes
-- dentro do JSON livre. As colunas ator_id/alvo_user_id continuam sendo o elo
-- operacional enquanto a conta existe e viram NULL quando ela e excluida.
-- ---------------------------------------------------------------------------

create or replace function public.revalida_sanitizar_json(p_valor jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_chave text;
  v_item jsonb;
  v_saida jsonb;
begin
  if p_valor is null then
    return '{}'::jsonb;
  end if;

  case jsonb_typeof(p_valor)
    when 'object' then
      v_saida := '{}'::jsonb;
      for v_chave, v_item in select key, value from jsonb_each(p_valor)
      loop
        -- A expressao cobre tambem variantes como payer_email e refresh_token.
        if lower(v_chave) ~ '(e-?mail|senha|password|authorization|access[_-]?token|refresh[_-]?token|purchase[_-]?token|user[_-]?id)' then
          continue;
        end if;
        v_saida := v_saida || jsonb_build_object(v_chave, public.revalida_sanitizar_json(v_item));
      end loop;
      return v_saida;
    when 'array' then
      select coalesce(jsonb_agg(public.revalida_sanitizar_json(value)), '[]'::jsonb)
        into v_saida
        from jsonb_array_elements(p_valor);
      return v_saida;
    else
      return p_valor;
  end case;
end;
$$;

create or replace function public.revalida_sanitiza_auditoria()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.detalhes := public.revalida_sanitizar_json(coalesce(new.detalhes, '{}'::jsonb));
  return new;
end;
$$;

drop trigger if exists auditoria_sanitiza_detalhes on public.auditoria;
create trigger auditoria_sanitiza_detalhes
before insert or update of detalhes on public.auditoria
for each row execute function public.revalida_sanitiza_auditoria();

-- Corrige tambem o pequeno historico ja existente.
update public.auditoria
   set detalhes = public.revalida_sanitizar_json(detalhes)
 where detalhes <> public.revalida_sanitizar_json(detalhes);

create or replace function public.revalida_audita(
  p_acao text,
  p_alvo uuid default null,
  p_detalhes jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.auditoria (ator_id, acao, alvo_user_id, detalhes)
  values (
    auth.uid(),
    left(btrim(coalesce(p_acao, 'evento.sem_nome')), 120),
    p_alvo,
    public.revalida_sanitizar_json(coalesce(p_detalhes, '{}'::jsonb))
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Licenca: um usuario autenticado so consulta o proprio JTI.
-- ---------------------------------------------------------------------------

create or replace function public.licenca_valida(p_jti uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
      from public.licencas as l
     where l.jti = p_jti
       and l.user_id = auth.uid()
       and l.revogada_em is null
       and l.expira_em > now()
       and exists (
         select 1
           from public.assinaturas as a
          where a.user_id = auth.uid()
            and a.status = 'ativa'
            and a.fim > now()
       )
  );
$$;

-- ---------------------------------------------------------------------------
-- Serializacao de pagamentos e checkouts.
--
-- O lock no evento acontece antes de registrar_pagamento calcular max(fim). O
-- trigger da assinatura e uma segunda linha de defesa e recalcula a janela sob
-- o mesmo lock, eliminando sobreposicao entre webhooks simultaneos.
-- ---------------------------------------------------------------------------

-- O e-mail pode mudar durante a vida da conta. Estes elos internos permitem
-- anonimizar tambem compras feitas com um endereco anterior; ambos usam
-- ON DELETE SET NULL para que a retencao fiscal deixe de estar vinculada.
alter table public.eventos_pagamento
  add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.checkouts
  add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.interessados
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create index if not exists eventos_pagamento_user_idx
  on public.eventos_pagamento (user_id, recebido_em desc) where user_id is not null;
create index if not exists checkouts_user_idx
  on public.checkouts (user_id, criado_em desc) where user_id is not null;
create index if not exists interessados_user_idx
  on public.interessados (user_id, criado_em desc) where user_id is not null;

-- Faz o melhor backfill possivel para o historico anterior a esta migracao.
update public.eventos_pagamento as e
   set user_id = u.id
  from auth.users as u
 where e.user_id is null
   and lower(btrim(coalesce(e.email, ''))) = lower(btrim(coalesce(u.email, '')))
   and nullif(btrim(coalesce(e.email, '')), '') is not null;

update public.checkouts as c
   set user_id = u.id
  from auth.users as u
 where c.user_id is null
   and lower(btrim(coalesce(c.email, ''))) = lower(btrim(coalesce(u.email, '')))
   and nullif(btrim(coalesce(c.email, '')), '') is not null;

update public.interessados as i
   set user_id = u.id
  from auth.users as u
 where i.user_id is null
   and lower(btrim(coalesce(i.email, ''))) = lower(btrim(coalesce(u.email, '')))
   and nullif(btrim(coalesce(i.email, '')), '') is not null;

create or replace function public.revalida_vincula_historico_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(lower(btrim(coalesce(new.email, ''))), '') is null then
    return new;
  end if;
  update public.eventos_pagamento
     set user_id = new.id
   where user_id is null
     and lower(btrim(coalesce(email, ''))) = lower(btrim(new.email));
  update public.checkouts
     set user_id = new.id
   where user_id is null
     and lower(btrim(coalesce(email, ''))) = lower(btrim(new.email));
  update public.interessados
     set user_id = new.id
   where user_id is null
     and lower(btrim(coalesce(email, ''))) = lower(btrim(new.email));
  return new;
end;
$$;

drop trigger if exists revalida_vincula_historico_usuario on auth.users;
create trigger revalida_vincula_historico_usuario
after insert or update of email on auth.users
for each row execute function public.revalida_vincula_historico_usuario();

create or replace function public.revalida_vincula_interesse_email()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select u.id into new.user_id
    from auth.users as u
   where lower(btrim(coalesce(u.email, ''))) = lower(btrim(coalesce(new.email, '')));
  return new;
end;
$$;

drop trigger if exists interessados_vincula_usuario on public.interessados;
create trigger interessados_vincula_usuario
before insert or update of email on public.interessados
for each row execute function public.revalida_vincula_interesse_email();

create or replace function public.revalida_serializa_evento_pagamento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if nullif(lower(btrim(coalesce(new.email, ''))), '') is not null then
    select u.id into v_user_id
      from auth.users as u
     where lower(u.email) = lower(btrim(new.email));
  end if;

  new.user_id := v_user_id;

  if v_user_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('pagamento:user:' || v_user_id::text, 0));
  else
    perform pg_advisory_xact_lock(hashtextextended(
      'pagamento:evento:' || coalesce(new.provedor, '') || ':' || coalesce(new.provedor_evento_id, ''), 0));
  end if;
  return new;
end;
$$;

drop trigger if exists eventos_pagamento_serializa on public.eventos_pagamento;
create trigger eventos_pagamento_serializa
before insert on public.eventos_pagamento
for each row execute function public.revalida_serializa_evento_pagamento();

alter table public.assinaturas
  add column if not exists janela_autoritativa boolean not null default false;

comment on column public.assinaturas.janela_autoritativa is
  'Quando true, inicio/fim vieram da loja nativa e nao podem ser estendidos localmente.';

create or replace function public.revalida_encadeia_assinatura_paga()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_inicio timestamptz;
  v_dias integer;
begin
  if new.origem <> 'pagamento' or new.status <> 'ativa' then
    return new;
  end if;

  -- Assinaturas recorrentes Apple/Google trazem a data final autoritativa do
  -- provedor. Elas ainda tomam o lock, mas nunca sao empilhadas artificialmente.
  if new.janela_autoritativa then
    perform pg_advisory_xact_lock(hashtextextended('pagamento:user:' || new.user_id::text, 0));
    return new;
  end if;

  v_dias := coalesce(
    new.dias,
    greatest(1, ceil(extract(epoch from (new.fim - new.inicio)) / 86400)::integer)
  );
  if v_dias not between 1 and 3650 then
    raise exception 'dias fora do intervalo permitido' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('pagamento:user:' || new.user_id::text, 0));
  select greatest(now(), coalesce(max(a.fim), now()))
    into v_inicio
    from public.assinaturas as a
   where a.user_id = new.user_id
     and a.status = 'ativa'
     and a.fim > now()
     and a.origem = 'pagamento';

  new.inicio := v_inicio;
  new.fim := v_inicio + make_interval(days => v_dias);
  new.dias := v_dias;
  return new;
end;
$$;

drop trigger if exists assinaturas_pagamento_encadeia on public.assinaturas;
create trigger assinaturas_pagamento_encadeia
before insert on public.assinaturas
for each row execute function public.revalida_encadeia_assinatura_paga();

do $rev$
begin
  alter table public.assinaturas
    add constraint assinaturas_dias_intervalo
    check (dias is null or dias between 1 and 3650);
exception when duplicate_object then null;
end
$rev$;

create or replace function public.revalida_limita_checkout()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_recentes integer;
  v_user_id uuid;
begin
  new.email := lower(btrim(new.email));
  select u.id into v_user_id from auth.users as u where lower(u.email) = new.email;
  new.user_id := v_user_id;
  perform pg_advisory_xact_lock(hashtextextended('checkout:' || new.email, 0));
  select count(*) into v_recentes
    from public.checkouts
   where email = new.email
     and criado_em > now() - interval '1 hour';
  if v_recentes >= 8 then
    raise exception 'muitos pedidos para este e-mail na ultima hora'
      using errcode = '53400';
  end if;
  return new;
end;
$$;

drop trigger if exists checkouts_limita_ritmo on public.checkouts;
create trigger checkouts_limita_ritmo
before insert on public.checkouts
for each row execute function public.revalida_limita_checkout();

-- ---------------------------------------------------------------------------
-- Lista de espera com dupla confirmacao.
-- Nenhum e-mail aparece no painel ou recebe campanha antes de confirmar o link.
-- ---------------------------------------------------------------------------

alter table public.interessados add column if not exists confirmado_em timestamptz;
alter table public.interessados add column if not exists confirmacao_hash text;
alter table public.interessados add column if not exists confirmacao_expira_em timestamptz;
alter table public.interessados add column if not exists cancelado_em timestamptz;

create unique index if not exists interessados_confirmacao_hash_idx
  on public.interessados (confirmacao_hash)
  where confirmacao_hash is not null;

-- O formulario historico exige uma acao afirmativa e explica a finalidade. Ele
-- permanece compativel ate a pagina migrar para a confirmacao por e-mail.
update public.interessados
   set confirmado_em = coalesce(confirmado_em, criado_em)
 where confirmado_em is null
   and confirmacao_hash is null
   and cancelado_em is null;

create or replace function public.criar_interesse_pendente(
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
  v_token text := gen_random_uuid()::text || gen_random_uuid()::text;
  v_hash text;
  v_id uuid;
begin
  if v_email !~ '^[^@[:space:]]{1,120}@[^@[:space:]]{1,120}\.[a-z]{2,24}$' then
    raise exception 'email invalido' using errcode = '22023';
  end if;
  if v_plano is not null and not exists (select 1 from public.planos where id = v_plano) then
    v_plano := null;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('interesse:' || v_email || ':' || coalesce(v_plano, ''), 0));
  v_hash := encode(sha256(convert_to(v_token, 'UTF8')), 'hex');

  insert into public.interessados (
    email, plano_id, origem, confirmado_em, confirmacao_hash,
    confirmacao_expira_em, cancelado_em, criado_em
  ) values (
    v_email, v_plano, left(btrim(coalesce(p_origem, 'pagina_de_vendas')), 60),
    null, v_hash, now() + interval '24 hours', null, now()
  )
  on conflict (email, coalesce(plano_id, '')) do update
    set origem = excluded.origem,
        confirmado_em = null,
        confirmacao_hash = excluded.confirmacao_hash,
        confirmacao_expira_em = excluded.confirmacao_expira_em,
        cancelado_em = null,
        criado_em = now()
  returning id into v_id;

  -- O token cru so sai para a Edge Function que enviara o e-mail. O banco guarda hash.
  return jsonb_build_object('ok', true, 'id', v_id, 'token_confirmacao', v_token);
end;
$$;

create or replace function public.confirmar_interesse(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_n integer;
begin
  if p_token is null or char_length(p_token) not between 60 and 100 then
    return jsonb_build_object('ok', false, 'motivo', 'token_invalido');
  end if;
  v_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  update public.interessados
     set confirmado_em = coalesce(confirmado_em, now()),
         confirmacao_expira_em = null,
         cancelado_em = null
   where confirmacao_hash = v_hash
     and cancelado_em is null
     and (confirmado_em is not null or confirmacao_expira_em > now());
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n > 0,
                            'motivo', case when v_n > 0 then null else 'token_invalido_ou_expirado' end);
end;
$$;

-- RPC legada mantida para rollback operacional, mas sem grant publico. A pagina
-- atual nao coleta lista de espera; uma futura reativacao deve usar a Edge com
-- confirmacao por e-mail.
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
begin
  if v_email !~ '^[^@[:space:]]{1,120}@[^@[:space:]]{1,120}\.[a-z]{2,24}$' then
    raise exception 'email invalido' using errcode = '22023';
  end if;
  if v_plano is not null and not exists (select 1 from public.planos where id = v_plano) then
    v_plano := null;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('interesse:' || v_email || ':' || coalesce(v_plano, ''), 0));
  insert into public.interessados (
    email, plano_id, origem, confirmado_em, confirmacao_hash,
    confirmacao_expira_em, cancelado_em
  ) values (
    v_email, v_plano, left(btrim(coalesce(p_origem, 'pagina_de_vendas')), 60),
    now(), null, null, null
  )
  on conflict (email, coalesce(plano_id, '')) do update
    set origem = excluded.origem,
        confirmado_em = coalesce(public.interessados.confirmado_em, now()),
        cancelado_em = null;
  return jsonb_build_object('ok', true);
end;
$$;

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
     where i.confirmado_em is not null and i.cancelado_em is null
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
    'total', (select count(*) from public.interessados where confirmado_em is not null and cancelado_em is null),
    'pendentes', (select count(*) from public.interessados where confirmado_em is null and cancelado_em is null
                   and confirmacao_expira_em > now()),
    'ultimos_7d', (select count(*) from public.interessados where confirmado_em > now() - interval '7 days'
                    and cancelado_em is null),
    'por_plano', (select coalesce(jsonb_object_agg(coalesce(plano_id, 'sem_plano'), n), '{}'::jsonb)
                    from (select plano_id, count(*) as n from public.interessados
                           where confirmado_em is not null and cancelado_em is null
                           group by plano_id) as t),
    'nao_avisados', (select count(*) from public.interessados
                      where confirmado_em is not null and cancelado_em is null and avisado_em is null)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Exclusao transacional e recibo anonimo.
-- ---------------------------------------------------------------------------

alter table public.checkouts alter column email drop not null;
alter table public.exclusoes add column if not exists pedido_id uuid default gen_random_uuid();
update public.exclusoes set pedido_id = gen_random_uuid() where pedido_id is null;
alter table public.exclusoes alter column pedido_id set not null;
create unique index if not exists exclusoes_pedido_id_idx on public.exclusoes (pedido_id);
alter table public.exclusoes drop column if exists email_hash;

comment on table public.exclusoes is
  'Recibos anonimos de exclusao. Nao guarda e-mail, hash de e-mail nem user_id.';

drop function if exists public.registrar_exclusao(uuid, text);

create or replace function public.excluir_conta_com_privacidade(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_pedido_id uuid;
begin
  if p_user_id is null then
    raise exception 'usuario invalido' using errcode = '22023';
  end if;

  select lower(btrim(coalesce(u.email, '')))
    into strict v_email
    from auth.users as u
   where u.id = p_user_id
   for update;

  perform pg_advisory_xact_lock(hashtextextended('exclusao:' || p_user_id::text, 0));

  -- Marketing nao possui obrigacao de retencao.
  delete from public.interessados
   where user_id = p_user_id or lower(btrim(email)) = v_email;

  -- Metadados financeiros necessarios permanecem, mas sem identificador direto e
  -- sem payload livre que possa conter uma copia escondida do e-mail/token.
  update public.checkouts
     set email = null,
         user_id = null
   where user_id = p_user_id
      or lower(btrim(coalesce(email, ''))) = v_email;

  update public.eventos_pagamento
     set email = null,
         user_id = null,
         carga = public.revalida_sanitizar_json(carga)
   where user_id = p_user_id
      or lower(btrim(coalesce(email, ''))) = v_email;

  update public.auditoria
     set ator_id = case when ator_id = p_user_id then null else ator_id end,
         alvo_user_id = case when alvo_user_id = p_user_id then null else alvo_user_id end,
         detalhes = public.revalida_sanitizar_json(detalhes)
   where ator_id = p_user_id or alvo_user_id = p_user_id;

  insert into public.exclusoes default values returning pedido_id into v_pedido_id;

  -- Perfis, assinaturas e licencas saem pelos FKs ON DELETE CASCADE. Admins e
  -- referencias de auditoria usam as regras declaradas nas tabelas.
  delete from auth.users where id = p_user_id;
  if not found then
    raise exception 'usuario nao encontrado' using errcode = 'P0002';
  end if;

  return v_pedido_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Retencao operacional. Deve ser chamada diariamente por cron do Supabase.
-- ---------------------------------------------------------------------------

create or replace function public.revalida_aplicar_retencao()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_interesses integer := 0;
  v_checkouts integer := 0;
  v_eventos integer := 0;
  v_auditoria integer := 0;
  v_licencas integer := 0;
  v_exclusoes integer := 0;
begin
  delete from public.interessados
   where (confirmado_em is null and criado_em < now() - interval '7 days')
      or (avisado_em is not null and avisado_em < now() - interval '30 days')
      or (confirmado_em is not null and avisado_em is null
          and confirmado_em < now() - interval '180 days')
      or cancelado_em is not null;
  get diagnostics v_interesses = row_count;

  delete from public.checkouts
   where (status in ('criado', 'aguardando_pagamento', 'falha_provedor')
          and criado_em < now() - interval '48 hours')
      or criado_em < now() - interval '5 years';
  get diagnostics v_checkouts = row_count;

  delete from public.eventos_pagamento where recebido_em < now() - interval '5 years';
  get diagnostics v_eventos = row_count;

  delete from public.auditoria where criado_em < now() - interval '2 years';
  get diagnostics v_auditoria = row_count;

  delete from public.licencas
   where coalesce(revogada_em, expira_em) < now() - interval '90 days';
  get diagnostics v_licencas = row_count;

  delete from public.exclusoes where excluido_em < now() - interval '2 years';
  get diagnostics v_exclusoes = row_count;

  return jsonb_build_object(
    'interesses', v_interesses, 'checkouts', v_checkouts,
    'eventos_pagamento', v_eventos, 'auditoria', v_auditoria,
    'licencas', v_licencas, 'recibos_exclusao', v_exclusoes
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: as funcoes com poder de service role nunca herdam EXECUTE de PUBLIC.
-- ---------------------------------------------------------------------------

revoke all on function public.revalida_sanitizar_json(jsonb) from public, anon, authenticated;
revoke all on function public.revalida_sanitiza_auditoria() from public, anon, authenticated;
revoke all on function public.revalida_serializa_evento_pagamento() from public, anon, authenticated;
revoke all on function public.revalida_vincula_historico_usuario() from public, anon, authenticated;
revoke all on function public.revalida_vincula_interesse_email() from public, anon, authenticated;
revoke all on function public.revalida_encadeia_assinatura_paga() from public, anon, authenticated;
revoke all on function public.revalida_limita_checkout() from public, anon, authenticated;
revoke all on function public.criar_interesse_pendente(text, text, text) from public, anon, authenticated;
revoke all on function public.confirmar_interesse(text) from public, anon, authenticated;
revoke all on function public.registrar_interesse(text, text, text) from public, anon, authenticated;
revoke all on function public.excluir_conta_com_privacidade(uuid) from public, anon, authenticated;
revoke all on function public.revalida_aplicar_retencao() from public, anon, authenticated;

grant execute on function public.criar_interesse_pendente(text, text, text) to service_role;
grant execute on function public.confirmar_interesse(text) to service_role;
grant execute on function public.excluir_conta_com_privacidade(uuid) to service_role;
grant execute on function public.revalida_aplicar_retencao() to service_role;

revoke all on function public.licenca_valida(uuid) from public, anon;
grant execute on function public.licenca_valida(uuid) to authenticated;

commit;
