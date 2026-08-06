-- Evidentia · Revalida — contas, assinaturas e licencas.
-- Aplicar uma unica vez pelo fluxo de migracoes do Supabase. Mudancas posteriores
-- entram em migracoes novas; este arquivo nao se edita depois de chegar a um ambiente.
--
-- Desenho:
--   * Nenhuma escrita direta. Toda mutacao passa por RPC `security definer` auditada.
--   * RLS liga em tudo; as policies so permitem SELECT das proprias linhas.
--   * O administrador da plataforma (o dono do produto) vive em `admins`, populada
--     apenas por migracao ou service role — nunca pela aplicacao.
--   * O acesso efetivo de uma pessoa e a resposta de `revalida_acesso_de(user_id)`,
--     que nao distingue se veio de pagamento ou de cortesia: quem decide e o dono.

begin;

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------

do $rev$
begin
  create type public.revalida_origem_acesso as enum ('pagamento', 'cortesia', 'teste');
exception when duplicate_object then null;
end
$rev$;

do $rev$
begin
  create type public.revalida_status_assinatura as enum ('ativa', 'cancelada', 'expirada', 'revogada');
exception when duplicate_object then null;
end
$rev$;

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.perfis (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint perfis_nome_tamanho check (char_length(btrim(nome)) between 1 and 120)
);

-- Administradores da plataforma. Sem policy de escrita: so migracao ou service role.
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nota text,
  criado_em timestamptz not null default now()
);

create table if not exists public.planos (
  id text primary key,
  nome text not null,
  descricao text,
  dias integer not null,
  preco_centavos integer not null default 0,
  moeda text not null default 'BRL',
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint planos_dias_positivo check (dias between 1 and 3650),
  constraint planos_preco_nao_negativo check (preco_centavos >= 0),
  constraint planos_moeda_iso check (moeda ~ '^[A-Z]{3}$')
);

create table if not exists public.assinaturas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plano_id text references public.planos(id) on delete set null,
  origem public.revalida_origem_acesso not null,
  status public.revalida_status_assinatura not null default 'ativa',
  inicio timestamptz not null default now(),
  fim timestamptz not null,
  provedor text,
  provedor_assinatura_id text,
  -- Identificador do cliente no provedor. Existe porque o evento de estorno do Stripe
  -- traz a cobranca (ch_...), que nunca casa com o id da assinatura; o cliente (cus_...)
  -- e o unico elo que aparece nos dois lados.
  provedor_cliente_id text,
  nota text,
  concedida_por uuid references auth.users(id) on delete set null,
  criada_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint assinaturas_janela_valida check (fim > inicio),
  constraint assinaturas_nota_tamanho check (nota is null or char_length(nota) <= 500),
  constraint assinaturas_pagamento_tem_provedor
    check (origem <> 'pagamento' or provedor is not null)
);

create index if not exists assinaturas_user_ativas_idx
  on public.assinaturas (user_id, fim desc) where status = 'ativa';
-- Uma unica assinatura ATIVA por assinatura do provedor; o historico fica livre
-- para guardar as renovacoes da mesma subscription (idempotencia de eventos ja
-- esta garantida por eventos_pagamento).
create index if not exists assinaturas_cliente_provedor_idx
  on public.assinaturas (provedor, provedor_cliente_id)
  where provedor_cliente_id is not null;
create unique index if not exists assinaturas_provedor_unica_idx
  on public.assinaturas (provedor, provedor_assinatura_id)
  where provedor_assinatura_id is not null and status = 'ativa';

-- Idempotencia do webhook: um evento do provedor entra uma unica vez.
create table if not exists public.eventos_pagamento (
  id uuid primary key default gen_random_uuid(),
  provedor text not null,
  provedor_evento_id text not null,
  tipo text not null,
  email text,
  carga jsonb not null default '{}'::jsonb,
  processado_em timestamptz,
  erro text,
  recebido_em timestamptz not null default now(),
  constraint eventos_pagamento_unico unique (provedor, provedor_evento_id)
);

-- Licencas assinadas entregues aos aparelhos. Serve para revogar e para auditar.
create table if not exists public.licencas (
  jti uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  emitida_em timestamptz not null default now(),
  expira_em timestamptz not null,
  aparelho text,
  revogada_em timestamptz,
  constraint licencas_janela_valida check (expira_em > emitida_em),
  constraint licencas_aparelho_tamanho check (aparelho is null or char_length(aparelho) <= 200)
);

create index if not exists licencas_user_idx on public.licencas (user_id, emitida_em desc);

create table if not exists public.auditoria (
  id bigserial primary key,
  ator_id uuid references auth.users(id) on delete set null,
  acao text not null,
  alvo_user_id uuid references auth.users(id) on delete set null,
  detalhes jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

create index if not exists auditoria_criado_idx on public.auditoria (criado_em desc);

-- ---------------------------------------------------------------------------
-- Gatilhos
-- ---------------------------------------------------------------------------

create or replace function public.revalida_toca_atualizado()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists perfis_atualizado on public.perfis;
create trigger perfis_atualizado before update on public.perfis
  for each row execute function public.revalida_toca_atualizado();

drop trigger if exists assinaturas_atualizada on public.assinaturas;
create trigger assinaturas_atualizada before update on public.assinaturas
  for each row execute function public.revalida_toca_atualizado();

-- Aplica os pagamentos que chegaram antes de a conta existir. O evento fica em
-- eventos_pagamento com `processado_em` nulo; aqui vira assinatura, na ordem em que
-- chegou, somando os prazos. Idempotente: so olha o que ainda nao foi processado.
create or replace function public.revalida_resgatar_pagamentos(
  p_user_id uuid,
  p_email text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_evento record;
  v_fim timestamptz;
  v_dias integer;
  v_n integer := 0;
begin
  if p_email is null or p_email = '' then
    return 0;
  end if;

  for v_evento in
    select * from public.eventos_pagamento
    where email = p_email
      and processado_em is null
      and erro is not null
    order by recebido_em
  loop
    -- So resgata ativacao. Um estorno orfao nao tem assinatura para encerrar.
    if coalesce(v_evento.carga ->> 'acao', 'ativar') <> 'ativar' then
      continue;
    end if;

    v_dias := greatest(1, coalesce((v_evento.carga ->> 'dias')::integer, 365));

    select greatest(now(), coalesce(max(a.fim), now())) into v_fim
    from public.assinaturas as a
    where a.user_id = p_user_id and a.status = 'ativa' and a.fim > now()
      and a.origem = 'pagamento';

    update public.assinaturas
       set status = 'expirada'
     where user_id = p_user_id and status = 'ativa' and origem = 'pagamento';

    insert into public.assinaturas (
      user_id, plano_id, origem, status, inicio, fim, provedor, provedor_assinatura_id
    ) values (
      p_user_id,
      nullif(v_evento.carga ->> 'plano', ''),
      'pagamento', 'ativa', now(),
      v_fim + make_interval(days => v_dias),
      v_evento.provedor,
      nullif(v_evento.carga ->> 'assinatura', '')
    );

    update public.eventos_pagamento
       set processado_em = now(), erro = null
     where id = v_evento.id;

    insert into public.auditoria (ator_id, acao, alvo_user_id, detalhes)
    values (null, 'pagamento.resgatado', p_user_id,
            jsonb_build_object('provedor', v_evento.provedor,
                               'evento', v_evento.provedor_evento_id, 'dias', v_dias));
    v_n := v_n + 1;
  end loop;

  return v_n;
end;
$$;

-- Cada conta nova ganha seu perfil. O nome sai do metadado ou do local-part do email.
create or replace function public.revalida_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome text;
begin
  v_nome := left(
    btrim(coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'nome'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(coalesce(new.email, 'pessoa'), '@', 1)
    )),
    120
  );
  if v_nome = '' then
    v_nome := 'pessoa';
  end if;

  insert into public.perfis (user_id, nome)
  values (new.id, v_nome)
  on conflict (user_id) do nothing;

  -- Quem paga antes de criar a conta nao pode ficar sem o que comprou. O webhook
  -- guarda esses eventos com `processado_em` nulo e um motivo; aqui eles sao
  -- resgatados assim que a conta com aquele e-mail passa a existir.
  perform public.revalida_resgatar_pagamentos(new.id, lower(btrim(coalesce(new.email, ''))));

  return new;
end;
$$;

drop trigger if exists revalida_ao_criar_usuario on auth.users;
create trigger revalida_ao_criar_usuario
  after insert on auth.users
  for each row execute function public.revalida_novo_usuario();

-- ---------------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------------

create or replace function public.revalida_e_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins as a where a.user_id = auth.uid());
$$;

-- Estado de acesso de uma pessoa: a assinatura ativa que termina mais tarde.
create or replace function public.revalida_acesso_de(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'ativo', true,
        'origem', a.origem,
        'plano', a.plano_id,
        'fim', a.fim,
        'assinatura_id', a.id
      )
      from public.assinaturas as a
      where a.user_id = p_user_id
        and a.status = 'ativa'
        and a.fim > now()
      order by a.fim desc
      limit 1
    ),
    jsonb_build_object('ativo', false, 'origem', null, 'plano', null, 'fim', null)
  );
$$;

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
  values (auth.uid(), p_acao, p_alvo, coalesce(p_detalhes, '{}'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC — pessoa comum
-- ---------------------------------------------------------------------------

create or replace function public.meu_acesso()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'sessao ausente' using errcode = '28000';
  end if;
  return public.revalida_acesso_de(v_uid)
    || jsonb_build_object('admin', public.revalida_e_admin());
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC — administracao (o dono decide quem entra, pagando ou nao)
-- ---------------------------------------------------------------------------

create or replace function public.conceder_acesso(
  p_email text,
  p_dias integer default 365,
  p_origem public.revalida_origem_acesso default 'cortesia',
  p_plano_id text default null,
  p_nota text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_alvo uuid;
  v_assinatura public.assinaturas;
begin
  if not public.revalida_e_admin() then
    raise exception 'apenas administradores' using errcode = '42501';
  end if;
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'email invalido' using errcode = '22023';
  end if;
  if p_dias is null or p_dias < 1 or p_dias > 3650 then
    raise exception 'dias fora do intervalo permitido' using errcode = '22023';
  end if;
  if p_origem = 'pagamento' then
    raise exception 'acesso por pagamento entra pelo webhook, nao por concessao'
      using errcode = '22023';
  end if;

  select u.id into v_alvo from auth.users as u where lower(u.email) = v_email;
  if v_alvo is null then
    raise exception 'nao existe conta com esse email' using errcode = 'P0002';
  end if;

  -- Concessao nova encerra a anterior de cortesia para nao empilhar janelas.
  update public.assinaturas
     set status = 'expirada'
   where user_id = v_alvo and status = 'ativa' and origem <> 'pagamento';

  insert into public.assinaturas (
    user_id, plano_id, origem, status, inicio, fim, nota, concedida_por
  ) values (
    v_alvo, p_plano_id, p_origem, 'ativa', now(), now() + make_interval(days => p_dias),
    left(btrim(coalesce(p_nota, '')), 500), auth.uid()
  ) returning * into v_assinatura;

  perform public.revalida_audita(
    'acesso.concedido', v_alvo,
    jsonb_build_object('dias', p_dias, 'origem', p_origem, 'email', v_email)
  );

  return jsonb_build_object(
    'ok', true, 'user_id', v_alvo, 'fim', v_assinatura.fim, 'origem', v_assinatura.origem
  );
end;
$$;

create or replace function public.revogar_acesso(p_email text, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_alvo uuid;
  v_n integer;
begin
  if not public.revalida_e_admin() then
    raise exception 'apenas administradores' using errcode = '42501';
  end if;

  select u.id into v_alvo from auth.users as u where lower(u.email) = v_email;
  if v_alvo is null then
    raise exception 'nao existe conta com esse email' using errcode = 'P0002';
  end if;

  update public.assinaturas
     set status = 'revogada', nota = left(btrim(coalesce(p_nota, nota, '')), 500)
   where user_id = v_alvo and status = 'ativa';
  get diagnostics v_n = row_count;

  -- Corta tambem as licencas ja entregues aos aparelhos.
  update public.licencas
     set revogada_em = now()
   where user_id = v_alvo and revogada_em is null and expira_em > now();

  perform public.revalida_audita(
    'acesso.revogado', v_alvo, jsonb_build_object('assinaturas', v_n, 'email', v_email)
  );

  return jsonb_build_object('ok', true, 'user_id', v_alvo, 'assinaturas_encerradas', v_n);
end;
$$;

-- Painel do dono: quem sao as pessoas, em que estado, com que validade.
create or replace function public.listar_pessoas(
  p_busca text default null,
  p_limite integer default 100
)
returns table (
  user_id uuid,
  email text,
  nome text,
  criado_em timestamptz,
  acesso jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_busca text := nullif(btrim(lower(coalesce(p_busca, ''))), '');
begin
  if not public.revalida_e_admin() then
    raise exception 'apenas administradores' using errcode = '42501';
  end if;

  return query
  select u.id,
         u.email::text,
         coalesce(p.nome, split_part(u.email, '@', 1)),
         u.created_at,
         public.revalida_acesso_de(u.id)
  from auth.users as u
  left join public.perfis as p on p.user_id = u.id
  where v_busca is null
     or lower(u.email) like '%' || v_busca || '%'
     or lower(coalesce(p.nome, '')) like '%' || v_busca || '%'
  order by u.created_at desc
  limit greatest(1, least(coalesce(p_limite, 100), 500));
end;
$$;

create or replace function public.resumo_assinaturas()
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
    'contas', (select count(*) from auth.users),
    'ativas', (select count(*) from public.assinaturas where status = 'ativa' and fim > now()),
    'pagantes', (select count(*) from public.assinaturas
                  where status = 'ativa' and fim > now() and origem = 'pagamento'),
    'cortesias', (select count(*) from public.assinaturas
                   where status = 'ativa' and fim > now() and origem <> 'pagamento'),
    'vencem_30d', (select count(*) from public.assinaturas
                    where status = 'ativa' and fim between now() and now() + interval '30 days')
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC — pagamentos (so service role, chamada pela edge function do webhook)
-- ---------------------------------------------------------------------------

-- `create or replace` nao substitui uma funcao de assinatura diferente: cria outra e
-- deixa a antiga de pe, ainda chamavel. Estes drops garantem que so exista a versao
-- corrente, com os REVOKE corretos.
drop function if exists public.registrar_pagamento(text, text, text, text, text, integer, text, jsonb);
drop function if exists public.encerrar_pagamento(text, text, text, text, text, jsonb);

create or replace function public.registrar_pagamento(
  p_provedor text,
  p_evento_id text,
  p_tipo text,
  p_email text,
  p_plano_id text,
  p_dias integer,
  p_assinatura_provedor text default null,
  p_carga jsonb default '{}'::jsonb,
  p_cliente_provedor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_alvo uuid;
  v_novo boolean;
  v_fim timestamptz;
begin
  -- Idempotencia: o mesmo evento do provedor nunca e aplicado duas vezes.
  -- A carga guarda o que o resgate precisa saber caso a conta ainda nao exista.
  insert into public.eventos_pagamento (provedor, provedor_evento_id, tipo, email, carga)
  values (p_provedor, p_evento_id, p_tipo, v_email,
          coalesce(p_carga, '{}'::jsonb) || jsonb_build_object(
            'acao', 'ativar',
            'dias', greatest(1, coalesce(p_dias, 365)),
            'plano', p_plano_id,
            'assinatura', p_assinatura_provedor))
  on conflict (provedor, provedor_evento_id) do nothing;
  get diagnostics v_novo = row_count;

  if not v_novo then
    return jsonb_build_object('ok', true, 'repetido', true);
  end if;

  select u.id into v_alvo from auth.users as u where lower(u.email) = v_email;
  if v_alvo is null then
    -- Nao se perde: fica com `erro` preenchido e `processado_em` nulo, e
    -- revalida_resgatar_pagamentos o aplica assim que a conta for criada.
    update public.eventos_pagamento
       set erro = 'pagamento sem conta correspondente; aguardando cadastro'
     where provedor = p_provedor and provedor_evento_id = p_evento_id;
    return jsonb_build_object('ok', false, 'motivo', 'sem_conta', 'email', v_email);
  end if;

  -- Renovacao estende a partir do fim do que ja foi pago; compra nova comeca agora.
  -- So conta assinatura paga: uma cortesia do dono nao encurta nem alonga a compra.
  select greatest(now(), coalesce(max(a.fim), now())) into v_fim
  from public.assinaturas as a
  where a.user_id = v_alvo and a.status = 'ativa' and a.fim > now()
    and a.origem = 'pagamento';

  -- Encerra apenas a assinatura paga anterior. A cortesia concedida pelo dono sobrevive:
  -- sem esta clausula, bastaria pagar com o e-mail de alguem e pedir reembolso para
  -- apagar a cortesia dessa pessoa, e quem a concedeu foi o dono, nao o provedor.
  update public.assinaturas
     set status = 'expirada'
   where user_id = v_alvo and status = 'ativa' and origem = 'pagamento';

  insert into public.assinaturas (
    user_id, plano_id, origem, status, inicio, fim,
    provedor, provedor_assinatura_id, provedor_cliente_id
  ) values (
    v_alvo, p_plano_id, 'pagamento', 'ativa', now(),
    v_fim + make_interval(days => greatest(1, coalesce(p_dias, 365))),
    p_provedor, p_assinatura_provedor, nullif(btrim(coalesce(p_cliente_provedor, '')), '')
  );

  update public.eventos_pagamento
     set processado_em = now()
   where provedor = p_provedor and provedor_evento_id = p_evento_id;

  insert into public.auditoria (ator_id, acao, alvo_user_id, detalhes)
  values (null, 'pagamento.aplicado', v_alvo,
          jsonb_build_object('provedor', p_provedor, 'evento', p_evento_id, 'dias', p_dias));

  return jsonb_build_object('ok', true, 'user_id', v_alvo);
end;
$$;

-- Reembolso, chargeback ou cancelamento: encerra o acesso pago e corta as licencas.
-- Tambem e idempotente pelo mesmo mecanismo de eventos_pagamento.
create or replace function public.encerrar_pagamento(
  p_provedor text,
  p_evento_id text,
  p_tipo text,
  p_email text,
  p_assinatura_provedor text default null,
  p_carga jsonb default '{}'::jsonb,
  p_cliente_provedor text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_alvo uuid;
  v_novo boolean;
  v_n integer;
begin
  insert into public.eventos_pagamento (provedor, provedor_evento_id, tipo, email, carga)
  values (p_provedor, p_evento_id, p_tipo, v_email, coalesce(p_carga, '{}'::jsonb))
  on conflict (provedor, provedor_evento_id) do nothing;
  get diagnostics v_novo = row_count;
  if not v_novo then
    return jsonb_build_object('ok', true, 'repetido', true);
  end if;

  -- Um reembolso do Stripe nao carrega e-mail: o objeto do evento e a cobranca, nao a
  -- pessoa. Por isso o dono da assinatura tambem se resolve pelo identificador que o
  -- provedor deu a ela. Sem este segundo caminho, todo estorno seria descartado em
  -- silencio e o acesso continuaria de pe depois do dinheiro voltar.
  if v_email <> '' then
    select u.id into v_alvo from auth.users as u where lower(u.email) = v_email;
  end if;
  if v_alvo is null and coalesce(btrim(p_assinatura_provedor), '') <> '' then
    select a.user_id into v_alvo
    from public.assinaturas as a
    where a.provedor = p_provedor
      and a.provedor_assinatura_id = p_assinatura_provedor
    order by a.criada_em desc
    limit 1;
  end if;
  if v_alvo is null and coalesce(btrim(p_cliente_provedor), '') <> '' then
    select a.user_id into v_alvo
    from public.assinaturas as a
    where a.provedor = p_provedor
      and a.provedor_cliente_id = p_cliente_provedor
    order by a.criada_em desc
    limit 1;
  end if;

  if v_alvo is null then
    update public.eventos_pagamento
       set erro = 'cancelamento sem conta nem assinatura correspondente'
     where provedor = p_provedor and provedor_evento_id = p_evento_id;
    return jsonb_build_object('ok', false, 'motivo', 'sem_conta');
  end if;

  -- So encerra o que veio de pagamento: uma cortesia dada pelo dono sobrevive
  -- a um reembolso, porque quem a concedeu foi ele, nao o provedor.
  update public.assinaturas
     set status = 'cancelada'
   where user_id = v_alvo
     and status = 'ativa'
     and origem = 'pagamento'
     and (
       coalesce(btrim(p_assinatura_provedor), '') = ''
       or provedor_assinatura_id = p_assinatura_provedor
       or (coalesce(btrim(p_cliente_provedor), '') <> ''
           and provedor_cliente_id = p_cliente_provedor)
     );
  get diagnostics v_n = row_count;

  update public.licencas
     set revogada_em = now()
   where user_id = v_alvo and revogada_em is null and expira_em > now()
     and not exists (
       select 1 from public.assinaturas as a
       where a.user_id = v_alvo and a.status = 'ativa' and a.fim > now()
     );

  update public.eventos_pagamento set processado_em = now()
   where provedor = p_provedor and provedor_evento_id = p_evento_id;

  insert into public.auditoria (ator_id, acao, alvo_user_id, detalhes)
  values (null, 'pagamento.encerrado', v_alvo,
          jsonb_build_object('provedor', p_provedor, 'evento', p_evento_id, 'tipo', p_tipo));

  return jsonb_build_object('ok', true, 'user_id', v_alvo, 'assinaturas_encerradas', v_n);
end;
$$;

-- Registra a licenca entregue a um aparelho. Chamada pela edge function emissora.
create or replace function public.registrar_licenca(
  p_user_id uuid,
  p_expira_em timestamptz,
  p_aparelho text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jti uuid;
begin
  insert into public.licencas (user_id, expira_em, aparelho)
  values (p_user_id, p_expira_em, left(btrim(coalesce(p_aparelho, '')), 200))
  returning jti into v_jti;
  return v_jti;
end;
$$;

-- Uma licenca revogada tem que morrer tambem no aparelho. O aplicativo pergunta por
-- ela sempre que tem rede; se a resposta for `false`, apaga a licenca local na hora,
-- sem esperar o vencimento. Sem esta consulta, `licencas.revogada_em` seria uma coluna
-- que se escreve e nunca se le, e revogar nao teria efeito nenhum antes do prazo.
create or replace function public.licenca_valida(p_jti uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.licencas as l
    where l.jti = p_jti
      and l.revogada_em is null
      and l.expira_em > now()
      and exists (
        select 1 from public.assinaturas as a
        where a.user_id = l.user_id and a.status = 'ativa' and a.fim > now()
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS — leitura apenas das proprias linhas; escrita so pelas RPC acima
-- ---------------------------------------------------------------------------

alter table public.perfis enable row level security;
alter table public.admins enable row level security;
alter table public.planos enable row level security;
alter table public.assinaturas enable row level security;
alter table public.eventos_pagamento enable row level security;
alter table public.licencas enable row level security;
alter table public.auditoria enable row level security;

drop policy if exists perfis_le_o_proprio on public.perfis;
create policy perfis_le_o_proprio on public.perfis for select
  to authenticated using (user_id = auth.uid() or public.revalida_e_admin());

drop policy if exists admins_le_o_proprio on public.admins;
create policy admins_le_o_proprio on public.admins for select
  to authenticated using (user_id = auth.uid());

drop policy if exists planos_publicos on public.planos;
create policy planos_publicos on public.planos for select
  to anon, authenticated using (ativo);

drop policy if exists assinaturas_le_as_proprias on public.assinaturas;
create policy assinaturas_le_as_proprias on public.assinaturas for select
  to authenticated using (user_id = auth.uid() or public.revalida_e_admin());

drop policy if exists licencas_le_as_proprias on public.licencas;
create policy licencas_le_as_proprias on public.licencas for select
  to authenticated using (user_id = auth.uid() or public.revalida_e_admin());

drop policy if exists auditoria_so_admin on public.auditoria;
create policy auditoria_so_admin on public.auditoria for select
  to authenticated using (public.revalida_e_admin());

-- eventos_pagamento nao tem policy: so o service role enxerga.

-- ---------------------------------------------------------------------------
-- Permissoes: nenhuma escrita direta a partir do cliente
-- ---------------------------------------------------------------------------

revoke all on public.perfis, public.admins, public.planos, public.assinaturas,
              public.eventos_pagamento, public.licencas, public.auditoria
  from anon, authenticated;

grant select on public.planos to anon, authenticated;
grant select on public.perfis, public.assinaturas, public.licencas, public.auditoria
  to authenticated;

-- ATENCAO: o PostgreSQL concede EXECUTE a PUBLIC em toda funcao nova. Revogar de
-- `anon, authenticated` NAO tira esse grant herdado: os dois papeis continuam podendo
-- executar via PUBLIC, e o PostgREST expoe tudo o que estiver em `public` como /rpc/.
-- Sem o REVOKE de PUBLIC abaixo, qualquer conta autenticada chamaria registrar_pagamento
-- e forjaria a propria assinatura paga. O REVOKE tem que ser de PUBLIC.
revoke all on function public.registrar_pagamento(text, text, text, text, text, integer, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.encerrar_pagamento(text, text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.registrar_licenca(uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.revalida_acesso_de(uuid) from public, anon, authenticated;
revoke all on function public.revalida_audita(text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.revalida_e_admin() from public, anon;
revoke all on function public.meu_acesso() from public, anon;
revoke all on function public.conceder_acesso(text, integer, public.revalida_origem_acesso, text, text) from public, anon;
revoke all on function public.revogar_acesso(text, text) from public, anon;
revoke all on function public.listar_pessoas(text, integer) from public, anon;
revoke all on function public.resumo_assinaturas() from public, anon;
revoke all on function public.revalida_toca_atualizado() from public, anon, authenticated;
revoke all on function public.revalida_novo_usuario() from public, anon, authenticated;
revoke all on function public.revalida_resgatar_pagamentos(uuid, text) from public, anon, authenticated;
revoke all on function public.licenca_valida(uuid) from public, anon;
grant execute on function public.licenca_valida(uuid) to authenticated;

grant execute on function public.meu_acesso() to authenticated;
grant execute on function public.revalida_e_admin() to authenticated;
grant execute on function public.conceder_acesso(text, integer, public.revalida_origem_acesso, text, text) to authenticated;
grant execute on function public.revogar_acesso(text, text) to authenticated;
grant execute on function public.listar_pessoas(text, integer) to authenticated;
grant execute on function public.resumo_assinaturas() to authenticated;

-- ---------------------------------------------------------------------------
-- Planos iniciais
-- ---------------------------------------------------------------------------

insert into public.planos (id, nome, descricao, dias, preco_centavos, moeda, ativo)
values
  ('anual',    'Anual',    'Acesso completo por 12 meses',  365, 0, 'BRL', true),
  ('semestral','Semestral','Acesso completo por 6 meses',   182, 0, 'BRL', true),
  ('cortesia', 'Cortesia', 'Acesso concedido pela Evidentia', 365, 0, 'BRL', false)
on conflict (id) do nothing;

commit;
