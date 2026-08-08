-- Evidentia · Revalida — contrato persistente para compras Apple/Google.
--
-- O cliente nunca concede acesso. Ele entrega um identificador/JWS/token a uma
-- Edge Function autenticada; so esta funcao consulta Apple/Google e chama as RPC
-- abaixo com service_role. JWS e purchaseToken nao sao guardados em claro.

begin;

create table if not exists public.produtos_loja (
  plataforma text not null,
  produto_id text not null,
  plano_id text not null references public.planos(id) on delete restrict,
  tipo text not null default 'nao_consumivel',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (plataforma, produto_id),
  constraint produtos_loja_plataforma check (plataforma in ('apple', 'google')),
  constraint produtos_loja_tipo check (tipo in ('consumivel', 'nao_consumivel', 'assinatura')),
  constraint produtos_loja_id_tamanho check (char_length(produto_id) between 2 and 200),
  constraint produtos_loja_produto_permitido check (produto_id in (
    'com.evidentia.revalida.access.30d',
    'com.evidentia.revalida.access.90d',
    'com.evidentia.revalida.access.180d'
  ))
);

do $rev$
begin
  alter table public.produtos_loja add constraint produtos_loja_produto_permitido
    check (produto_id in (
      'com.evidentia.revalida.access.30d',
      'com.evidentia.revalida.access.90d',
      'com.evidentia.revalida.access.180d'
    ));
exception when duplicate_object then null;
end
$rev$;

-- O mesmo catalogo e usado por StoreKit e Google Play. Os IDs precisam coincidir
-- byte a byte com Info.plist/Billing; a migration nunca reativa um SKU desligado.
insert into public.produtos_loja (plataforma, produto_id, plano_id, tipo, ativo) values
  ('apple',  'com.evidentia.revalida.access.30d',  'mensal',     'nao_consumivel', true),
  ('apple',  'com.evidentia.revalida.access.90d',  'trimestral', 'nao_consumivel', true),
  ('apple',  'com.evidentia.revalida.access.180d', 'semestral',  'nao_consumivel', true),
  -- Google usa assinaturas pre-pagas: não renovam automaticamente, mas a API
  -- subscriptionsv2 fornece expiryTime autoritativo. Apple usa non-renewing IAP
  -- e recebe a duração fixa do plano depois da verificação da transação.
  ('google', 'com.evidentia.revalida.access.30d',  'mensal',     'assinatura', true),
  ('google', 'com.evidentia.revalida.access.90d',  'trimestral', 'assinatura', true),
  ('google', 'com.evidentia.revalida.access.180d', 'semestral',  'assinatura', true)
on conflict (plataforma, produto_id) do update
  set plano_id = excluded.plano_id, tipo = excluded.tipo;

create table if not exists public.compras_nativas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  plataforma text not null,
  produto_id text not null,
  transacao_informada text,
  transacao_externa_id text,
  transacao_original_id text,
  credencial_hash text not null,
  status text not null default 'pendente_verificacao',
  ambiente text,
  assinatura_id uuid references public.assinaturas(id) on delete set null,
  expira_em timestamptz,
  solicitado_em timestamptz not null default now(),
  verificado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  erro_codigo text,
  detalhes jsonb not null default '{}'::jsonb,
  constraint compras_nativas_plataforma check (plataforma in ('apple', 'google')),
  constraint compras_nativas_status check (status in (
    'pendente_verificacao', 'verificada', 'rejeitada', 'reembolsada', 'revogada'
  )),
  constraint compras_nativas_hash check (credencial_hash ~ '^[0-9a-f]{64}$'),
  constraint compras_nativas_produto_tamanho check (char_length(produto_id) between 2 and 200),
  constraint compras_nativas_produto_permitido check (produto_id in (
    'com.evidentia.revalida.access.30d',
    'com.evidentia.revalida.access.90d',
    'com.evidentia.revalida.access.180d'
  )),
  constraint compras_nativas_transacao_tamanho check (
    transacao_externa_id is null or char_length(transacao_externa_id) between 1 and 240
  )
);

do $rev$
begin
  alter table public.compras_nativas add constraint compras_nativas_produto_permitido
    check (produto_id in (
      'com.evidentia.revalida.access.30d',
      'com.evidentia.revalida.access.90d',
      'com.evidentia.revalida.access.180d'
    ));
exception when duplicate_object then null;
end
$rev$;

create unique index if not exists compras_nativas_credencial_idx
  on public.compras_nativas (plataforma, credencial_hash);
create unique index if not exists compras_nativas_transacao_idx
  on public.compras_nativas (plataforma, transacao_externa_id)
  where transacao_externa_id is not null;
create index if not exists compras_nativas_user_idx
  on public.compras_nativas (user_id, solicitado_em desc)
  where user_id is not null;
create index if not exists compras_nativas_pendentes_idx
  on public.compras_nativas (solicitado_em)
  where status = 'pendente_verificacao';

drop trigger if exists produtos_loja_atualizado on public.produtos_loja;
create trigger produtos_loja_atualizado before update on public.produtos_loja
  for each row execute function public.revalida_toca_atualizado();

drop trigger if exists compras_nativas_atualizado on public.compras_nativas;
create trigger compras_nativas_atualizado before update on public.compras_nativas
  for each row execute function public.revalida_toca_atualizado();

create or replace function public.revalida_sanitiza_compra_nativa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.detalhes := public.revalida_sanitizar_json(coalesce(new.detalhes, '{}'::jsonb));
  new.erro_codigo := nullif(left(btrim(coalesce(new.erro_codigo, '')), 120), '');
  return new;
end;
$$;

drop trigger if exists compras_nativas_sanitiza on public.compras_nativas;
create trigger compras_nativas_sanitiza
before insert or update of detalhes, erro_codigo on public.compras_nativas
for each row execute function public.revalida_sanitiza_compra_nativa();

alter table public.produtos_loja enable row level security;
alter table public.compras_nativas enable row level security;
-- Sem policies: nem o aplicativo nem um visitante le comprovantes ou mapeamentos.

-- Configurado pelo dono ou por migracao depois de criar os produtos nas lojas.
create or replace function public.salvar_produto_loja(
  p_plataforma text,
  p_produto_id text,
  p_plano_id text,
  p_tipo text default 'nao_consumivel',
  p_ativo boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plataforma text := lower(btrim(coalesce(p_plataforma, '')));
  v_produto text := btrim(coalesce(p_produto_id, ''));
  v_tipo text := lower(btrim(coalesce(p_tipo, 'nao_consumivel')));
  v_linha public.produtos_loja;
begin
  if not public.revalida_e_admin() then
    raise exception 'apenas administradores' using errcode = '42501';
  end if;
  if v_plataforma not in ('apple', 'google') then
    raise exception 'plataforma invalida' using errcode = '22023';
  end if;
  if v_produto not in (
    'com.evidentia.revalida.access.30d',
    'com.evidentia.revalida.access.90d',
    'com.evidentia.revalida.access.180d'
  ) then
    raise exception 'produto fora da allowlist nativa' using errcode = '22023';
  end if;
  if v_tipo not in ('consumivel', 'nao_consumivel', 'assinatura') then
    raise exception 'tipo invalido' using errcode = '22023';
  end if;
  if not exists (select 1 from public.planos where id = p_plano_id) then
    raise exception 'plano inexistente' using errcode = 'P0002';
  end if;

  insert into public.produtos_loja (plataforma, produto_id, plano_id, tipo, ativo)
  values (v_plataforma, v_produto, p_plano_id, v_tipo, coalesce(p_ativo, true))
  on conflict (plataforma, produto_id) do update
    set plano_id = excluded.plano_id, tipo = excluded.tipo, ativo = excluded.ativo
  returning * into v_linha;

  perform public.revalida_audita('produto_loja.salvo', null,
    jsonb_build_object('plataforma', v_plataforma, 'produto', v_produto,
                       'plano', p_plano_id, 'tipo', v_tipo, 'ativo', v_linha.ativo));
  return to_jsonb(v_linha);
end;
$$;

create or replace function public.listar_produtos_loja()
returns setof public.produtos_loja
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.revalida_e_admin() then
    raise exception 'apenas administradores' using errcode = '42501';
  end if;
  return query select * from public.produtos_loja order by plataforma, produto_id;
end;
$$;

create or replace function public.consultar_produto_loja(
  p_plataforma text,
  p_produto_id text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(p)
    from public.produtos_loja as p
   where p.plataforma = lower(btrim(coalesce(p_plataforma, '')))
     and p.produto_id = btrim(coalesce(p_produto_id, ''))
     and p.ativo;
$$;

-- Registra apenas a tentativa e o hash da credencial. Repetir o mesmo token/JWS
-- pela mesma conta e idempotente; outra conta nunca pode tomar a compra para si.
create or replace function public.registrar_solicitacao_compra_nativa(
  p_user_id uuid,
  p_plataforma text,
  p_produto_id text,
  p_transacao_informada text,
  p_credencial_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plataforma text := lower(btrim(coalesce(p_plataforma, '')));
  v_produto text := btrim(coalesce(p_produto_id, ''));
  v_hash text := lower(btrim(coalesce(p_credencial_hash, '')));
  v_existente public.compras_nativas;
  v_id uuid;
  v_recentes integer;
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'usuario inexistente' using errcode = 'P0002';
  end if;
  if v_plataforma not in ('apple', 'google') then
    raise exception 'plataforma invalida' using errcode = '22023';
  end if;
  if v_produto not in (
    'com.evidentia.revalida.access.30d',
    'com.evidentia.revalida.access.90d',
    'com.evidentia.revalida.access.180d'
  ) or v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'comprovante invalido' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('compra_nativa:' || v_plataforma || ':' || v_hash, 0));
  select * into v_existente
    from public.compras_nativas
   where plataforma = v_plataforma and credencial_hash = v_hash
   for update;

  if v_existente.id is not null then
    if v_existente.user_id is distinct from p_user_id then
      raise exception 'comprovante ja associado a outra conta' using errcode = '42501';
    end if;
    if v_existente.produto_id <> v_produto then
      raise exception 'produto diverge do primeiro envio' using errcode = '22023';
    end if;
    return jsonb_build_object('id', v_existente.id, 'status', v_existente.status,
                              'repetido', true,
                              'ativo', v_existente.status = 'verificada');
  end if;

  -- Diferentes comprovantes da mesma conta tambem sao serializados: sem este
  -- limite uma conta autenticada poderia esgotar a cota das APIs Apple/Google.
  perform pg_advisory_xact_lock(hashtextextended('compra_nativa:user:' || p_user_id::text, 0));
  select count(*) into v_recentes
    from public.compras_nativas
   where user_id = p_user_id and solicitado_em > now() - interval '1 hour';
  if v_recentes >= 30 then
    raise exception 'muitas verificacoes nativas na ultima hora' using errcode = '53400';
  end if;

  insert into public.compras_nativas (
    user_id, plataforma, produto_id, transacao_informada, credencial_hash
  ) values (
    p_user_id, v_plataforma, v_produto,
    nullif(left(btrim(coalesce(p_transacao_informada, '')), 240), ''), v_hash
  ) returning id into v_id;

  return jsonb_build_object('id', v_id, 'status', 'pendente_verificacao',
                            'repetido', false, 'ativo', false);
end;
$$;

create or replace function public.marcar_compra_nativa(
  p_compra_id uuid,
  p_status text,
  p_erro_codigo text default null,
  p_detalhes jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('pendente_verificacao', 'rejeitada', 'reembolsada', 'revogada') then
    raise exception 'status invalido' using errcode = '22023';
  end if;
  update public.compras_nativas
     set status = p_status,
         erro_codigo = p_erro_codigo,
         detalhes = public.revalida_sanitizar_json(coalesce(p_detalhes, '{}'::jsonb)),
         verificado_em = case when p_status <> 'pendente_verificacao' then now() else verificado_em end
   where id = p_compra_id and status in ('pendente_verificacao', 'rejeitada');
end;
$$;

-- Unico ponto que transforma uma resposta verificada do provedor em entitlement.
create or replace function public.confirmar_compra_nativa(
  p_compra_id uuid,
  p_transacao_externa_id text,
  p_transacao_original_id text default null,
  p_ambiente text default null,
  p_expira_em timestamptz default null,
  p_detalhes jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_compra public.compras_nativas;
  v_replay public.compras_nativas;
  v_produto public.produtos_loja;
  v_assinatura_id uuid;
  v_inicio timestamptz;
  v_fim timestamptz;
begin
  if p_transacao_externa_id is null or char_length(btrim(p_transacao_externa_id)) not between 1 and 240 then
    raise exception 'transacao externa invalida' using errcode = '22023';
  end if;

  select * into strict v_compra
    from public.compras_nativas
   where id = p_compra_id
   for update;

  if v_compra.status = 'verificada' then
    return jsonb_build_object('ativo', true, 'repetido', true,
                              'assinatura_id', v_compra.assinatura_id);
  end if;
  if v_compra.user_id is null then
    raise exception 'conta da compra foi excluida' using errcode = 'P0002';
  end if;
  if v_compra.status in ('reembolsada', 'revogada') then
    raise exception 'compra encerrada nao pode ser reativada' using errcode = '22023';
  end if;

  -- O JWS Apple pode ser representado novamente e, portanto, produzir outro
  -- hash. A idempotencia secundaria so usa o ID depois que ele veio da API
  -- oficial. Um transactionId informado pelo cliente nunca reserva a compra.
  perform pg_advisory_xact_lock(hashtextextended(
    'compra_nativa:transacao:' || v_compra.plataforma || ':' || btrim(p_transacao_externa_id), 0));
  select * into v_replay
    from public.compras_nativas
   where plataforma = v_compra.plataforma
     and transacao_externa_id = btrim(p_transacao_externa_id)
     and id <> v_compra.id
   for update;
  if v_replay.id is not null then
    if v_replay.user_id is distinct from v_compra.user_id
       or v_replay.produto_id <> v_compra.produto_id then
      raise exception 'transacao oficial ja pertence a outra conta ou produto' using errcode = '42501';
    end if;
    if v_replay.status <> 'verificada' then
      raise exception 'transacao oficial esta encerrada' using errcode = '22023';
    end if;
    update public.compras_nativas
       set status = 'rejeitada',
           erro_codigo = 'replay_de_transacao_verificada',
           verificado_em = now(),
           detalhes = jsonb_build_object('compra_original_id', v_replay.id)
     where id = v_compra.id;
    return jsonb_build_object('ativo', true, 'repetido', true,
                              'assinatura_id', v_replay.assinatura_id);
  end if;

  select * into strict v_produto
    from public.produtos_loja
   where plataforma = v_compra.plataforma
     and produto_id = v_compra.produto_id
     and ativo;

  perform pg_advisory_xact_lock(hashtextextended('pagamento:user:' || v_compra.user_id::text, 0));

  -- Assinatura recorrente usa a expiracao autoritativa da loja. Passes de prazo
  -- fixo usam os dias do plano e se encadeiam depois de outro pagamento.
  if v_produto.tipo = 'assinatura' then
    if p_expira_em is null or p_expira_em <= now() then
      raise exception 'assinatura nativa sem validade futura' using errcode = '22023';
    end if;
    v_inicio := now();
    v_fim := p_expira_em;
  else
    select greatest(now(), coalesce(max(a.fim), now())) into v_inicio
      from public.assinaturas as a
     where a.user_id = v_compra.user_id and a.status = 'ativa'
       and a.fim > now() and a.origem = 'pagamento';
    select v_inicio + make_interval(days => p.dias)
      into v_fim
      from public.planos as p
     where p.id = v_produto.plano_id;
  end if;

  insert into public.assinaturas (
    user_id, plano_id, origem, status, inicio, fim, dias,
    provedor, provedor_assinatura_id, nota, janela_autoritativa
  )
  select v_compra.user_id, v_produto.plano_id, 'pagamento', 'ativa',
         v_inicio, v_fim,
         case when v_produto.tipo = 'assinatura'
              then greatest(1, ceil(extract(epoch from (v_fim - v_inicio)) / 86400)::integer)
              else p.dias end,
         v_compra.plataforma,
         nullif(left(btrim(coalesce(p_transacao_original_id, p_transacao_externa_id)), 240), ''),
         'compra nativa verificada pelo servidor da loja',
         v_produto.tipo = 'assinatura'
    from public.planos as p
   where p.id = v_produto.plano_id
  returning id into v_assinatura_id;

  update public.compras_nativas
     set transacao_externa_id = btrim(p_transacao_externa_id),
         transacao_original_id = nullif(left(btrim(coalesce(p_transacao_original_id, '')), 240), ''),
         status = 'verificada',
         ambiente = nullif(left(btrim(coalesce(p_ambiente, '')), 40), ''),
         assinatura_id = v_assinatura_id,
         expira_em = v_fim,
         verificado_em = now(),
         erro_codigo = null,
         detalhes = public.revalida_sanitizar_json(coalesce(p_detalhes, '{}'::jsonb))
   where id = v_compra.id;

  insert into public.auditoria (ator_id, acao, alvo_user_id, detalhes)
  values (null, 'compra_nativa.verificada', v_compra.user_id,
          jsonb_build_object('plataforma', v_compra.plataforma,
                             'produto', v_compra.produto_id,
                             'compra_id', v_compra.id,
                             'plano', v_produto.plano_id));

  return jsonb_build_object('ativo', true, 'repetido', false,
                            'assinatura_id', v_assinatura_id, 'fim', v_fim);
exception when unique_violation then
  raise exception 'transacao ja processada' using errcode = '23505';
end;
$$;

-- Gancho para App Store Server Notifications V2 / RTDN. A futura funcao de
-- notificacao chama esta RPC depois de verificar a mensagem no provedor.
create or replace function public.encerrar_compra_nativa(
  p_plataforma text,
  p_transacao_externa_id text,
  p_status text,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_compra public.compras_nativas;
begin
  if p_status not in ('reembolsada', 'revogada') then
    raise exception 'status de encerramento invalido' using errcode = '22023';
  end if;
  select * into v_compra
    from public.compras_nativas
   where plataforma = lower(btrim(p_plataforma))
     and transacao_externa_id = btrim(p_transacao_externa_id)
   for update;
  if v_compra.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada');
  end if;

  update public.compras_nativas
     set status = p_status, erro_codigo = nullif(left(btrim(coalesce(p_motivo, '')), 120), '')
   where id = v_compra.id;
  update public.assinaturas set status = 'cancelada'
   where id = v_compra.assinatura_id and status = 'ativa';
  update public.licencas set revogada_em = now()
   where user_id = v_compra.user_id and revogada_em is null and expira_em > now()
     and not exists (select 1 from public.assinaturas
                      where user_id = v_compra.user_id and status = 'ativa' and fim > now());
  return jsonb_build_object('ok', true, 'user_id', v_compra.user_id);
end;
$$;

create or replace function public.revalida_aplicar_retencao_compras_nativas()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  delete from public.compras_nativas
   where (status in ('pendente_verificacao', 'rejeitada')
          and solicitado_em < now() - interval '90 days')
      or solicitado_em < now() - interval '5 years';
  get diagnostics v_n = row_count;
  return jsonb_build_object('compras_nativas', v_n);
end;
$$;

-- Entrada unica para o cron: evita que a retencao geral rode e os comprovantes
-- nativos sejam esquecidos por dependerem de uma segunda chamada operacional.
create or replace function public.revalida_aplicar_retencao_completa()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_geral jsonb;
  v_nativas jsonb;
begin
  v_geral := public.revalida_aplicar_retencao();
  v_nativas := public.revalida_aplicar_retencao_compras_nativas();
  return coalesce(v_geral, '{}'::jsonb) || coalesce(v_nativas, '{}'::jsonb);
end;
$$;

revoke all on public.produtos_loja, public.compras_nativas from anon, authenticated;

revoke all on function public.revalida_sanitiza_compra_nativa() from public, anon, authenticated;
revoke all on function public.consultar_produto_loja(text, text) from public, anon, authenticated;
revoke all on function public.registrar_solicitacao_compra_nativa(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.marcar_compra_nativa(uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.confirmar_compra_nativa(uuid, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.encerrar_compra_nativa(text, text, text, text) from public, anon, authenticated;
revoke all on function public.revalida_aplicar_retencao_compras_nativas() from public, anon, authenticated;
revoke all on function public.revalida_aplicar_retencao_completa() from public, anon, authenticated;

grant execute on function public.consultar_produto_loja(text, text) to service_role;
grant execute on function public.registrar_solicitacao_compra_nativa(uuid, text, text, text, text) to service_role;
grant execute on function public.marcar_compra_nativa(uuid, text, text, jsonb) to service_role;
grant execute on function public.confirmar_compra_nativa(uuid, text, text, text, timestamptz, jsonb) to service_role;
grant execute on function public.encerrar_compra_nativa(text, text, text, text) to service_role;
grant execute on function public.revalida_aplicar_retencao_compras_nativas() to service_role;
grant execute on function public.revalida_aplicar_retencao_completa() to service_role;

revoke all on function public.salvar_produto_loja(text, text, text, text, boolean) from public, anon;
revoke all on function public.listar_produtos_loja() from public, anon;
grant execute on function public.salvar_produto_loja(text, text, text, text, boolean) to authenticated;
grant execute on function public.listar_produtos_loja() to authenticated;

commit;
