-- Evidentia · Revalida — cada pagamento vira uma assinatura INDEPENDENTE.
--
-- Por que esta migracao existe (revisao adversarial de seguranca, 2026-08-06):
--
-- `registrar_pagamento` fundia o tempo que a pessoa ja tinha numa unica linha nova,
-- carimbada com o identificador do NOVO pagamento. Isso abria dois buracos:
--
--   1. [ALTA] Sequestro por e-mail alheio. A pagina de venda aceita qualquer e-mail
--      (o comprador precisa poder pagar antes de ter conta). Um atacante comprava o
--      plano mais barato com o e-mail de uma assinante, os 150 dias dela eram
--      absorvidos na linha do atacante, e ao pedir reembolso ela perdia TUDO — o
--      atacante recuperava o dinheiro e a vitima ficava sem o que havia pago.
--   2. [MEDIA] Passes empilhados. Com tres passes comprados, estornar o primeiro nao
--      revogava nada: a linha viva era a do ultimo pagamento, e o `provedor_assinatura_id`
--      do estorno nao casava com ela.
--
-- A correcao e a mesma para os dois: **nunca fundir**. Cada pagamento entra como uma
-- linha propria, encadeada depois da anterior (inicio = fim da ultima paga), guardando
-- quantos dias aportou. Assim um estorno cancela exatamente o que aquele pagamento deu,
-- e o que a pessoa comprou antes continua de pe.
--
-- Ao cancelar, `revalida_recompactar_pagamentos` reencadeia as linhas restantes a partir
-- do inicio original — preservando o tempo ja consumido — e expira as que nao cabem mais.

begin;

-- Quantos dias este pagamento aportou. Sem isso nao da para devolver exatamente o que
-- um estorno tira. Fica nulo no historico antigo; a recompactacao cai para a janela.
alter table public.assinaturas add column if not exists dias integer;

comment on column public.assinaturas.dias is
  'Dias que este pagamento aportou. Usado para desfazer exatamente um estorno.';

-- O indice unico «uma assinatura ativa por assinatura do provedor» pertencia ao modelo
-- antigo, em que a renovacao substituia a linha anterior. Agora cada pagamento tem a sua,
-- e uma renovacao do Stripe repete o mesmo `sub_...` — o indice recusaria a segunda
-- cobranca legitima. A idempotencia nao se perde: ela vive onde sempre viveu de fato, na
-- restricao unica de `eventos_pagamento (provedor, provedor_evento_id)`, que e o unico
-- caminho de escrita e ja impede aplicar duas vezes o mesmo evento.
drop index if exists public.assinaturas_provedor_unica_idx;
create index if not exists assinaturas_provedor_assinatura_idx
  on public.assinaturas (provedor, provedor_assinatura_id)
  where provedor_assinatura_id is not null;

-- ---------------------------------------------------------------------------
-- Reencadeamento
-- ---------------------------------------------------------------------------

-- Reordena as assinaturas pagas ativas de uma pessoa em fila indiana, a partir do
-- inicio original da fila. O tempo ja consumido nao volta: quem comprou 180 dias ha
-- 30 dias e perde outro passe fica com o saldo certo, nao com 180 de novo.
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
  -- O inicio da fila tem que ser o da fila ORIGINAL, medido antes de cancelar: se
  -- fosse o da primeira linha sobrevivente, cancelar o passe da frente empurraria
  -- todos os outros para tras e devolveria de presente o tempo ja consumido.
  v_cursor := p_inicio_cadeia;
  if v_cursor is null then
    select min(a.inicio) into v_cursor
      from public.assinaturas as a
     where a.user_id = p_user_id and a.status = 'ativa' and a.origem = 'pagamento';
  end if;
  if v_cursor is null then
    return;
  end if;
  -- Uma fila que so comeca no futuro (o passe da frente caiu) volta para hoje: o
  -- que sobra vale a partir de agora, nao a partir da data que o passe morto ocupava.
  v_cursor := least(v_cursor, now());

  for v_linha in
    select * from public.assinaturas
     where user_id = p_user_id and status = 'ativa' and origem = 'pagamento'
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
           -- o que ficou inteiramente no passado deixa de ser acesso vigente
           status = case when v_fim <= now() then 'expirada'::public.revalida_status_assinatura
                         else 'ativa'::public.revalida_status_assinatura end
     where id = v_linha.id;
    v_cursor := v_fim;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ativacao: linha independente, encadeada, com os dias registrados
-- ---------------------------------------------------------------------------

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
  v_dias integer := greatest(1, coalesce(p_dias, 365));
begin
  -- Idempotencia: o mesmo evento do provedor nunca e aplicado duas vezes.
  -- A carga guarda o que o resgate precisa saber caso a conta ainda nao exista.
  insert into public.eventos_pagamento (provedor, provedor_evento_id, tipo, email, carga)
  values (p_provedor, p_evento_id, p_tipo, v_email,
          coalesce(p_carga, '{}'::jsonb) || jsonb_build_object(
            'acao', 'ativar',
            'dias', v_dias,
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

  -- Encadeia depois do que ja foi pago; uma cortesia do dono nao encurta nem alonga
  -- a compra. A assinatura anterior NAO e encerrada: cada pagamento vive na sua
  -- propria linha, para que um estorno so possa desfazer o que aquele pagamento deu.
  select greatest(now(), coalesce(max(a.fim), now())) into v_fim
  from public.assinaturas as a
  where a.user_id = v_alvo and a.status = 'ativa' and a.fim > now()
    and a.origem = 'pagamento';

  insert into public.assinaturas (
    user_id, plano_id, origem, status, inicio, fim, dias,
    provedor, provedor_assinatura_id, provedor_cliente_id
  ) values (
    v_alvo, p_plano_id, 'pagamento', 'ativa', v_fim,
    v_fim + make_interval(days => v_dias), v_dias,
    p_provedor, p_assinatura_provedor, nullif(btrim(coalesce(p_cliente_provedor, '')), '')
  );

  update public.eventos_pagamento
     set processado_em = now()
   where provedor = p_provedor and provedor_evento_id = p_evento_id;

  insert into public.auditoria (ator_id, acao, alvo_user_id, detalhes)
  values (null, 'pagamento.aplicado', v_alvo,
          jsonb_build_object('provedor', p_provedor, 'evento', p_evento_id, 'dias', v_dias));

  return jsonb_build_object('ok', true, 'user_id', v_alvo);
end;
$$;

-- ---------------------------------------------------------------------------
-- Encerramento: cancela SO o pagamento estornado e reencadeia o resto
-- ---------------------------------------------------------------------------

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
  v_assinatura text := nullif(btrim(coalesce(p_assinatura_provedor, '')), '');
  v_cliente text := nullif(btrim(coalesce(p_cliente_provedor, '')), '');
  v_inicio_cadeia timestamptz;
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
  if v_assinatura is not null then
    select a.user_id into v_alvo
    from public.assinaturas as a
    where a.provedor = p_provedor and a.provedor_assinatura_id = v_assinatura
    order by a.criada_em desc limit 1;
  end if;
  if v_alvo is null and v_email <> '' then
    select u.id into v_alvo from auth.users as u where lower(u.email) = v_email;
  end if;
  if v_alvo is null and v_cliente is not null then
    select a.user_id into v_alvo
    from public.assinaturas as a
    where a.provedor = p_provedor and a.provedor_cliente_id = v_cliente
    order by a.criada_em desc limit 1;
  end if;

  if v_alvo is null then
    update public.eventos_pagamento
       set erro = 'cancelamento sem conta nem assinatura correspondente'
     where provedor = p_provedor and provedor_evento_id = p_evento_id;
    return jsonb_build_object('ok', false, 'motivo', 'sem_conta');
  end if;

  -- Onde a fila comecava ANTES de cancelar. Guardado aqui porque a recompactacao
  -- precisa dele para nao devolver o tempo que a pessoa ja usou.
  select min(a.inicio) into v_inicio_cadeia
    from public.assinaturas as a
   where a.user_id = v_alvo and a.status = 'ativa' and a.origem = 'pagamento';

  -- So encerra o que veio de pagamento: uma cortesia dada pelo dono sobrevive a um
  -- estorno, porque quem a concedeu foi ele, nao o provedor. E, dentro do que veio de
  -- pagamento, so a linha DAQUELE pagamento — as outras compras da pessoa continuam.
  update public.assinaturas
     set status = 'cancelada'
   where user_id = v_alvo
     and status = 'ativa'
     and origem = 'pagamento'
     and (
       (v_assinatura is not null and provedor_assinatura_id = v_assinatura)
       or (v_assinatura is null and v_cliente is not null and provedor_cliente_id = v_cliente)
       -- Sem nenhum identificador, o provedor nao disse QUAL compra caiu: encerra a
       -- ultima paga, que e a interpretacao conservadora e nao toca as anteriores.
       or (v_assinatura is null and v_cliente is null and id = (
             select a2.id from public.assinaturas as a2
              where a2.user_id = v_alvo and a2.status = 'ativa' and a2.origem = 'pagamento'
              order by a2.fim desc limit 1))
     );
  get diagnostics v_n = row_count;

  -- O que sobrou volta a formar uma fila continua, a partir do inicio original: o
  -- tempo ja consumido nao ressuscita e o estorno tira exatamente os dias que deu.
  perform public.revalida_recompactar_pagamentos(v_alvo, v_inicio_cadeia);

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

-- ---------------------------------------------------------------------------
-- Resgate de pagamentos anteriores ao cadastro: mesma regra de nao fundir
-- ---------------------------------------------------------------------------

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

    insert into public.assinaturas (
      user_id, plano_id, origem, status, inicio, fim, dias,
      provedor, provedor_assinatura_id
    ) values (
      p_user_id,
      nullif(v_evento.carga ->> 'plano', ''),
      'pagamento', 'ativa', v_fim,
      v_fim + make_interval(days => v_dias), v_dias,
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

-- ---------------------------------------------------------------------------
-- Checkout: limite de ritmo e faxina, porque a porta e publica
-- ---------------------------------------------------------------------------

-- `criar-checkout` responde sem sessao (quem compra ainda pode nao ter conta). Sem
-- limite, um roteiro enche a tabela e dispara criacoes de cobranca no provedor com
-- e-mails de terceiros. O limite por e-mail e generoso para quem erra e tenta de novo,
-- e apertado para automacao.
create or replace function public.registrar_checkout(
  p_order_id text,
  p_email text,
  p_plano_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_plano public.planos;
  v_recentes integer;
begin
  if p_order_id is null or char_length(btrim(p_order_id)) < 8 then
    raise exception 'pedido invalido' using errcode = '22023';
  end if;
  if v_email = '' or position('@' in v_email) <= 1 or char_length(v_email) > 200 then
    raise exception 'email invalido' using errcode = '22023';
  end if;

  select * into v_plano from public.planos
   where id = lower(btrim(coalesce(p_plano_id, ''))) and ativo and preco_centavos > 0;
  if v_plano.id is null then
    raise exception 'plano inexistente ou fora de venda' using errcode = 'P0002';
  end if;

  select count(*) into v_recentes from public.checkouts
   where email = v_email and criado_em > now() - interval '1 hour';
  if v_recentes >= 8 then
    raise exception 'muitos pedidos para este e-mail na ultima hora'
      using errcode = '53400';
  end if;

  -- Faxina barata, na propria escrita: pedido aberto que ninguem pagou em 48 h nao
  -- serve para nada e so faz a tabela crescer.
  delete from public.checkouts
   where status in ('criado', 'aguardando_pagamento', 'falha_provedor')
     and criado_em < now() - interval '48 hours';

  insert into public.checkouts (order_id, plano_id, email, dias, preco_centavos, moeda)
  values (btrim(p_order_id), v_plano.id, v_email, v_plano.dias, v_plano.preco_centavos, v_plano.moeda);

  return jsonb_build_object(
    'ok', true,
    'order_id', btrim(p_order_id),
    'plano_id', v_plano.id,
    'nome', v_plano.nome,
    'dias', v_plano.dias,
    'preco_centavos', v_plano.preco_centavos,
    'moeda', v_plano.moeda
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissoes das funcoes recriadas (o `create or replace` nao as reescreve, mas
-- a nova `revalida_recompactar_pagamentos` precisa das suas)
-- ---------------------------------------------------------------------------

revoke all on function public.revalida_recompactar_pagamentos(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.registrar_pagamento(text, text, text, text, text, integer, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.encerrar_pagamento(text, text, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.revalida_resgatar_pagamentos(uuid, text) from public, anon, authenticated;
revoke all on function public.registrar_checkout(text, text, text) from public, anon, authenticated;
grant execute on function public.registrar_checkout(text, text, text) to service_role;

commit;
