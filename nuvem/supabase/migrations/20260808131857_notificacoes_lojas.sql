-- Evidentia · Revalida — lifecycle oficial Apple/Google.
--
-- Guarda somente metadados minimos e SHA-256 do evento. signedPayload,
-- purchaseToken, OIDC/JWT e respostas completas dos provedores nunca entram no
-- banco. A lease torna o consumo idempotente tambem diante de concorrencia.

begin;

create table if not exists public.notificacoes_loja (
  id uuid primary key default gen_random_uuid(),
  plataforma text not null,
  evento_id text not null,
  payload_hash text not null,
  tipo text not null,
  status text not null default 'processando',
  tentativas integer not null default 1,
  bloqueado_ate timestamptz,
  transacao_externa_id text,
  produto_id text,
  compra_id uuid references public.compras_nativas(id) on delete set null,
  erro_codigo text,
  detalhes jsonb not null default '{}'::jsonb,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  constraint notificacoes_loja_unica unique (plataforma, evento_id),
  constraint notificacoes_loja_plataforma check (plataforma in ('apple', 'google')),
  constraint notificacoes_loja_hash check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint notificacoes_loja_status check (status in (
    'processando', 'processada', 'ignorada', 'erro_temporario', 'erro_permanente'
  )),
  constraint notificacoes_loja_evento_tamanho check (char_length(evento_id) between 1 and 240),
  constraint notificacoes_loja_tipo_tamanho check (char_length(tipo) between 1 and 120),
  constraint notificacoes_loja_tentativas check (tentativas between 1 and 1000000),
  constraint notificacoes_loja_transacao_tamanho check (
    transacao_externa_id is null or char_length(transacao_externa_id) between 1 and 240
  ),
  constraint notificacoes_loja_produto_permitido check (produto_id is null or produto_id in (
    'com.evidentia.revalida.access.30d',
    'com.evidentia.revalida.access.90d',
    'com.evidentia.revalida.access.180d'
  )),
  constraint notificacoes_loja_erro_tamanho check (
    erro_codigo is null or char_length(erro_codigo) between 1 and 120
  )
);

create index if not exists notificacoes_loja_retencao_idx
  on public.notificacoes_loja (recebido_em);
create index if not exists notificacoes_loja_retry_idx
  on public.notificacoes_loja (bloqueado_ate, recebido_em)
  where status in ('processando', 'erro_temporario');

create or replace function public.revalida_sanitiza_notificacao_loja()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.tipo := left(btrim(new.tipo), 120);
  new.erro_codigo := nullif(left(btrim(coalesce(new.erro_codigo, '')), 120), '');
  new.transacao_externa_id := nullif(left(btrim(coalesce(new.transacao_externa_id, '')), 240), '');
  new.produto_id := nullif(left(btrim(coalesce(new.produto_id, '')), 200), '');
  new.detalhes := public.revalida_sanitizar_json(coalesce(new.detalhes, '{}'::jsonb));
  return new;
end;
$$;

drop trigger if exists notificacoes_loja_sanitiza on public.notificacoes_loja;
create trigger notificacoes_loja_sanitiza
before insert or update of tipo, erro_codigo, transacao_externa_id, produto_id, detalhes
on public.notificacoes_loja
for each row execute function public.revalida_sanitiza_notificacao_loja();

drop trigger if exists notificacoes_loja_atualizada on public.notificacoes_loja;
create trigger notificacoes_loja_atualizada
before update on public.notificacoes_loja
for each row execute function public.revalida_toca_atualizado();

alter table public.notificacoes_loja enable row level security;

create or replace function public.reservar_notificacao_loja(
  p_plataforma text,
  p_evento_id text,
  p_payload_hash text,
  p_tipo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plataforma text := lower(btrim(coalesce(p_plataforma, '')));
  v_evento_id text := btrim(coalesce(p_evento_id, ''));
  v_hash text := lower(btrim(coalesce(p_payload_hash, '')));
  v_tipo text := left(btrim(coalesce(p_tipo, '')), 120);
  v_evento public.notificacoes_loja;
begin
  if v_plataforma not in ('apple', 'google')
     or char_length(v_evento_id) not between 1 and 240
     or v_hash !~ '^[0-9a-f]{64}$'
     or char_length(v_tipo) not between 1 and 120 then
    raise exception 'notificacao invalida' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'notificacao_loja:' || v_plataforma || ':' || v_evento_id, 0));
  select * into v_evento
    from public.notificacoes_loja
   where plataforma = v_plataforma and evento_id = v_evento_id
   for update;

  if v_evento.id is null then
    insert into public.notificacoes_loja (
      plataforma, evento_id, payload_hash, tipo, status, tentativas, bloqueado_ate
    ) values (
      v_plataforma, v_evento_id, v_hash, v_tipo, 'processando', 1, now() + interval '2 minutes'
    );
    return jsonb_build_object('processar', true, 'repetida', false, 'tentativas', 1);
  end if;

  if v_evento.payload_hash <> v_hash or v_evento.tipo <> v_tipo then
    raise exception 'evento repetido com conteudo divergente' using errcode = '42501';
  end if;
  if v_evento.status in ('processada', 'ignorada', 'erro_permanente') then
    return jsonb_build_object('processar', false, 'repetida', true,
                              'status', v_evento.status, 'tentativas', v_evento.tentativas);
  end if;
  if v_evento.bloqueado_ate is not null and v_evento.bloqueado_ate > now() then
    return jsonb_build_object('processar', false, 'repetida', false, 'ocupada', true,
                              'tentativas', v_evento.tentativas);
  end if;

  update public.notificacoes_loja
     set status = 'processando',
         tentativas = tentativas + 1,
         bloqueado_ate = now() + interval '2 minutes',
         processado_em = null,
         erro_codigo = null,
         detalhes = '{}'::jsonb
   where id = v_evento.id;
  return jsonb_build_object('processar', true, 'repetida', true,
                            'tentativas', v_evento.tentativas + 1);
end;
$$;

create or replace function public.finalizar_notificacao_loja(
  p_plataforma text,
  p_evento_id text,
  p_status text,
  p_erro_codigo text default null,
  p_transacao_externa_id text default null,
  p_produto_id text default null,
  p_compra_id uuid default null,
  p_detalhes jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plataforma text := lower(btrim(coalesce(p_plataforma, '')));
  v_evento_id text := btrim(coalesce(p_evento_id, ''));
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_evento public.notificacoes_loja;
begin
  if v_plataforma not in ('apple', 'google')
     or char_length(v_evento_id) not between 1 and 240
     or v_status not in ('processada', 'ignorada', 'erro_temporario', 'erro_permanente') then
    raise exception 'finalizacao de notificacao invalida' using errcode = '22023';
  end if;
  select * into v_evento
    from public.notificacoes_loja
   where plataforma = v_plataforma and evento_id = v_evento_id
   for update;
  if v_evento.id is null then
    raise exception 'notificacao nao reservada' using errcode = 'P0002';
  end if;
  if v_evento.status in ('processada', 'ignorada', 'erro_permanente') then
    return jsonb_build_object('ok', true, 'repetido', true, 'status', v_evento.status);
  end if;
  if p_compra_id is not null and not exists (
    select 1 from public.compras_nativas as c
     where c.id = p_compra_id
       and c.plataforma = v_plataforma
       and (p_produto_id is null or c.produto_id = btrim(p_produto_id))
       and (p_transacao_externa_id is null
            or c.transacao_externa_id = btrim(p_transacao_externa_id)
            or c.transacao_original_id = btrim(p_transacao_externa_id))
  ) then
    raise exception 'compra nao pertence a notificacao' using errcode = '42501';
  end if;

  update public.notificacoes_loja
     set status = v_status,
         bloqueado_ate = case when v_status = 'erro_temporario'
                              then now() + interval '5 seconds' else null end,
         processado_em = case when v_status = 'erro_temporario' then null else now() end,
         erro_codigo = p_erro_codigo,
         transacao_externa_id = p_transacao_externa_id,
         produto_id = p_produto_id,
         compra_id = p_compra_id,
         detalhes = public.revalida_sanitizar_json(coalesce(p_detalhes, '{}'::jsonb))
   where id = v_evento.id;
  return jsonb_build_object('ok', true, 'repetido', false, 'status', v_status);
end;
$$;

-- A sobrecarga antiga nao tinha produto nem vinculo de conta. Ela permanece
-- apenas para falhar de forma explicita caso um deploy antigo tente usa-la.
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
begin
  raise exception 'use encerramento com produto e hash de conta' using errcode = '42501';
end;
$$;

-- A implementacao historica recompactava tambem janelas autoritativas da Play
-- API. Isso alterava expiryTime localmente. Apenas passes de dias fixos podem
-- ser reencadeados; janelas autoritativas ficam exatamente como o provedor as
-- devolveu. O inicio fornecido e medido antes do estorno para que dias ja usados
-- nao reaparecam como saldo gratis.
create or replace function public.revalida_recompactar_pagamentos(
  p_user_id uuid,
  p_inicio_cadeia timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_linha record;
  v_cursor timestamptz;
  v_dias integer;
  v_fim timestamptz;
begin
  v_cursor := p_inicio_cadeia;
  if v_cursor is null then
    select min(a.inicio) into v_cursor
      from public.assinaturas as a
     where a.user_id = p_user_id and a.status = 'ativa'
       and a.origem = 'pagamento' and not a.janela_autoritativa;
  end if;
  if v_cursor is null then return; end if;
  v_cursor := least(v_cursor, now());

  for v_linha in
    select * from public.assinaturas
     where user_id = p_user_id and status = 'ativa' and origem = 'pagamento'
       and not janela_autoritativa
     order by criada_em, id
  loop
    v_dias := coalesce(
      v_linha.dias,
      greatest(1, ceil(extract(epoch from (v_linha.fim - v_linha.inicio)) / 86400)::integer)
    );
    v_fim := v_cursor + make_interval(days => v_dias);
    update public.assinaturas
       set inicio = v_cursor,
           fim = v_fim,
           status = case when v_fim <= now() then 'expirada'::public.revalida_status_assinatura
                         else 'ativa'::public.revalida_status_assinatura end
     where id = v_linha.id;
    v_cursor := v_fim;
  end loop;
end;
$$;

create or replace function public.encerrar_compra_nativa(
  p_plataforma text,
  p_transacao_externa_id text,
  p_status text,
  p_motivo text,
  p_produto_id text,
  p_conta_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plataforma text := lower(btrim(coalesce(p_plataforma, '')));
  v_transacao text := btrim(coalesce(p_transacao_externa_id, ''));
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_produto text := btrim(coalesce(p_produto_id, ''));
  v_conta_hash text := lower(btrim(coalesce(p_conta_hash, '')));
  v_compra public.compras_nativas;
  v_status_final text;
  v_inicio_cadeia timestamptz;
begin
  if v_plataforma not in ('apple', 'google')
     or char_length(v_transacao) not between 1 and 240
     or v_status not in ('reembolsada', 'revogada')
     or v_produto not in (
       'com.evidentia.revalida.access.30d',
       'com.evidentia.revalida.access.90d',
       'com.evidentia.revalida.access.180d'
     )
     or v_conta_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'encerramento nativo invalido' using errcode = '22023';
  end if;

  select * into v_compra
    from public.compras_nativas
   where plataforma = v_plataforma
     and (transacao_externa_id = v_transacao or transacao_original_id = v_transacao)
   order by (transacao_externa_id = v_transacao) desc, solicitado_em desc
   limit 1
   for update;
  if v_compra.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada');
  end if;
  if v_compra.produto_id <> v_produto then
    raise exception 'produto diverge da compra verificada' using errcode = '42501';
  end if;
  if v_compra.user_id is not null and
     encode(sha256(convert_to(lower(v_compra.user_id::text), 'UTF8')), 'hex') <> v_conta_hash then
    raise exception 'conta diverge da compra verificada' using errcode = '42501';
  end if;
  if v_compra.status not in ('verificada', 'reembolsada', 'revogada') then
    return jsonb_build_object('ok', false, 'motivo', 'compra_nao_verificada');
  end if;

  if v_compra.status = 'revogada' or v_compra.status = v_status then
    return jsonb_build_object('ok', true, 'repetido', true, 'compra_id', v_compra.id);
  end if;
  v_status_final := case when v_compra.status = 'revogada' or v_status = 'revogada'
                         then 'revogada' else 'reembolsada' end;
  if v_compra.user_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('pagamento:user:' || v_compra.user_id::text, 0));
    select min(a.inicio) into v_inicio_cadeia
      from public.assinaturas as a
     where a.user_id = v_compra.user_id and a.origem = 'pagamento'
       and (a.status = 'ativa' or a.id = v_compra.assinatura_id);
  end if;

  update public.compras_nativas
     set status = v_status_final,
         erro_codigo = nullif(left(btrim(coalesce(p_motivo, '')), 120), '')
   where id = v_compra.id;
  update public.assinaturas
     set status = 'revogada'
   where id = v_compra.assinatura_id and status <> 'revogada';
  if v_compra.user_id is not null then
    perform public.revalida_recompactar_pagamentos(v_compra.user_id, v_inicio_cadeia);
    -- Qualquer reducao do horizonte invalida licencas ja emitidas. Mesmo havendo
    -- outra compra/cortesia, o aparelho precisa buscar uma nova licenca limitada
    -- ao novo max(fim); conservar o JWT antigo poderia regalar os dias removidos.
    update public.licencas
       set revogada_em = now()
     where user_id = v_compra.user_id
       and revogada_em is null and expira_em > now();
  end if;

  insert into public.auditoria (ator_id, acao, alvo_user_id, detalhes)
  values (null, 'compra_nativa.' || v_status_final, v_compra.user_id,
          jsonb_build_object('plataforma', v_plataforma, 'produto', v_produto,
                             'compra_id', v_compra.id));
  return jsonb_build_object('ok', true, 'repetido', false,
                            'compra_id', v_compra.id, 'status', v_status_final);
end;
$$;

create or replace function public.revalida_aplicar_retencao_compras_nativas()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_compras integer := 0;
  v_notificacoes integer := 0;
begin
  delete from public.compras_nativas
   where (status in ('pendente_verificacao', 'rejeitada')
          and solicitado_em < now() - interval '90 days')
      or solicitado_em < now() - interval '5 years';
  get diagnostics v_compras = row_count;

  delete from public.notificacoes_loja
   where (status in ('processando', 'erro_temporario')
          and recebido_em < now() - interval '90 days')
      or recebido_em < now() - interval '5 years';
  get diagnostics v_notificacoes = row_count;
  return jsonb_build_object('compras_nativas', v_compras,
                            'notificacoes_loja', v_notificacoes);
end;
$$;

revoke all on public.notificacoes_loja from public, anon, authenticated;
revoke all on function public.revalida_sanitiza_notificacao_loja() from public, anon, authenticated;
revoke all on function public.revalida_recompactar_pagamentos(uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.reservar_notificacao_loja(text, text, text, text) from public, anon, authenticated;
revoke all on function public.finalizar_notificacao_loja(text, text, text, text, text, text, uuid, jsonb)
  from public, anon, authenticated;
revoke all on function public.encerrar_compra_nativa(text, text, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.encerrar_compra_nativa(text, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.revalida_aplicar_retencao_compras_nativas()
  from public, anon, authenticated;

grant execute on function public.reservar_notificacao_loja(text, text, text, text) to service_role;
grant execute on function public.finalizar_notificacao_loja(text, text, text, text, text, text, uuid, jsonb)
  to service_role;
grant execute on function public.encerrar_compra_nativa(text, text, text, text, text, text)
  to service_role;
grant execute on function public.revalida_aplicar_retencao_compras_nativas() to service_role;

commit;
