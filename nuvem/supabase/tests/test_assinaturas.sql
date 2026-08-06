-- Prova das regras de acesso do Revalida contra um PostgreSQL de verdade.
-- Roda com nuvem/supabase/tests/rodar_testes.sh, que cria o stub de auth e aplica a migracao.
-- Qualquer expectativa quebrada aborta a transacao e derruba o script.

\set ON_ERROR_STOP on
\set QUIET on
\pset format unaligned
\pset tuples_only on

create or replace function pg_temp.checa(p_nome text, p_condicao boolean)
returns void language plpgsql as $$
begin
  if p_condicao is not true then
    raise exception 'FALHOU: %', p_nome;
  end if;
  raise notice 'ok: %', p_nome;
end;
$$;

create or replace function pg_temp.vira(p_user_id uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user_id::text, ''), true);
end;
$$;

do $prova$
declare
  v_dono uuid;
  v_ana uuid;
  v_bruno uuid;
  v_r jsonb;
  v_erro text;
  v_fim1 timestamptz;
  v_fim2 timestamptz;
  v_carla uuid;
  v_novo uuid;
  v_jti uuid;
begin
  -- pessoas
  insert into auth.users (email) values ('dono@evidentia.co') returning id into v_dono;
  insert into auth.users (email) values ('ana@exemplo.com') returning id into v_ana;
  insert into auth.users (email) values ('bruno@exemplo.com') returning id into v_bruno;
  insert into public.admins (user_id, nota) values (v_dono, 'dono do produto');

  -- o gatilho de conta nova cria o perfil
  perform pg_temp.checa('conta nova ganha perfil',
    (select count(*) = 3 from public.perfis));

  -- ninguem tem acesso ao nascer
  perform pg_temp.vira(v_ana);
  perform pg_temp.checa('conta nova nao tem acesso',
    (public.meu_acesso() ->> 'ativo') = 'false');
  perform pg_temp.checa('conta nova nao e admin',
    (public.meu_acesso() ->> 'admin') = 'false');

  -- pessoa comum nao concede acesso a ninguem, nem a si mesma
  begin
    perform public.conceder_acesso('ana@exemplo.com', 365);
    raise exception 'FALHOU: pessoa comum conseguiu conceder acesso';
  exception when insufficient_privilege then
    raise notice 'ok: pessoa comum nao concede acesso';
  end;

  begin
    perform public.listar_pessoas();
    raise exception 'FALHOU: pessoa comum conseguiu listar contas';
  exception when insufficient_privilege then
    raise notice 'ok: pessoa comum nao lista contas';
  end;

  -- o dono concede
  perform pg_temp.vira(v_dono);
  perform pg_temp.checa('dono e admin', (public.meu_acesso() ->> 'admin') = 'true');
  v_r := public.conceder_acesso('ana@exemplo.com', 30, 'cortesia', null, 'piloto');
  perform pg_temp.checa('concessao devolve ok', (v_r ->> 'ok') = 'true');

  perform pg_temp.vira(v_ana);
  v_r := public.meu_acesso();
  perform pg_temp.checa('ana passa a ter acesso', (v_r ->> 'ativo') = 'true');
  perform pg_temp.checa('acesso de ana e cortesia', (v_r ->> 'origem') = 'cortesia');
  perform pg_temp.checa('acesso de ana vence em ~30 dias',
    (v_r ->> 'fim')::timestamptz between now() + interval '29 days' and now() + interval '31 days');

  -- conceder de novo nao empilha janelas: encerra a anterior
  perform pg_temp.vira(v_dono);
  perform public.conceder_acesso('ana@exemplo.com', 60, 'cortesia');
  perform pg_temp.checa('so uma assinatura ativa por pessoa',
    (select count(*) = 1 from public.assinaturas
      where user_id = v_ana and status = 'ativa'));

  -- email inexistente falha com mensagem propria
  begin
    perform public.conceder_acesso('ninguem@exemplo.com', 30);
    raise exception 'FALHOU: concedeu acesso a email inexistente';
  exception when no_data_found then
    raise notice 'ok: recusa email sem conta';
  end;

  -- concessao nunca finge ser pagamento
  begin
    perform public.conceder_acesso('bruno@exemplo.com', 30, 'pagamento');
    raise exception 'FALHOU: concessao aceitou origem pagamento';
  exception when invalid_parameter_value then
    raise notice 'ok: concessao nao aceita origem pagamento';
  end;

  -- revogacao encerra assinatura e corta as licencas entregues
  perform public.registrar_licenca(v_ana, now() + interval '30 days', 'mac de teste');
  perform public.revogar_acesso('ana@exemplo.com', 'reembolso');
  perform pg_temp.checa('revogacao encerra a assinatura',
    (select count(*) = 0 from public.assinaturas
      where user_id = v_ana and status = 'ativa'));
  perform pg_temp.checa('revogacao corta a licenca do aparelho',
    (select count(*) = 1 from public.licencas
      where user_id = v_ana and revogada_em is not null));

  perform pg_temp.vira(v_ana);
  perform pg_temp.checa('ana perde o acesso apos revogacao',
    (public.meu_acesso() ->> 'ativo') = 'false');

  -- pagamento: aplica uma vez, ignora repeticao do mesmo evento
  perform pg_temp.vira(null);
  v_r := public.registrar_pagamento('stripe', 'evt_1', 'checkout.completed',
                                    'bruno@exemplo.com', 'anual', 365, 'sub_1');
  perform pg_temp.checa('pagamento aplicado', (v_r ->> 'ok') = 'true');
  v_r := public.registrar_pagamento('stripe', 'evt_1', 'checkout.completed',
                                    'bruno@exemplo.com', 'anual', 365, 'sub_1');
  perform pg_temp.checa('evento repetido nao aplica de novo', (v_r ->> 'repetido') = 'true');
  perform pg_temp.checa('bruno tem exatamente uma assinatura',
    (select count(*) = 1 from public.assinaturas where user_id = v_bruno));

  perform pg_temp.vira(v_bruno);
  v_r := public.meu_acesso();
  perform pg_temp.checa('bruno tem acesso por pagamento', (v_r ->> 'origem') = 'pagamento');
  v_fim1 := (v_r ->> 'fim')::timestamptz;

  -- renovacao estende a partir do fim vigente, nao de hoje
  perform pg_temp.vira(null);
  perform public.registrar_pagamento('stripe', 'evt_2', 'invoice.paid',
                                     'bruno@exemplo.com', 'anual', 365, 'sub_1');
  perform pg_temp.vira(v_bruno);
  v_fim2 := (public.meu_acesso() ->> 'fim')::timestamptz;
  perform pg_temp.checa('renovacao soma ao prazo que ja existia',
    v_fim2 > v_fim1 + interval '360 days');

  -- pagamento de quem ainda nao tem conta fica registrado, nao se perde
  perform pg_temp.vira(null);
  v_r := public.registrar_pagamento('stripe', 'evt_3', 'checkout.completed',
                                    'futuro@exemplo.com', 'anual', 365, 'sub_9');
  perform pg_temp.checa('pagamento sem conta nao explode', (v_r ->> 'motivo') = 'sem_conta');
  perform pg_temp.checa('pagamento sem conta fica anotado com o motivo',
    (select erro is not null from public.eventos_pagamento
      where provedor_evento_id = 'evt_3'));

  -- reembolso encerra o acesso pago e corta a licenca
  perform pg_temp.vira(null);
  perform public.registrar_licenca(v_bruno, now() + interval '30 days', 'iphone de teste');
  v_r := public.encerrar_pagamento('stripe', 'evt_4', 'charge.refunded',
                                   'bruno@exemplo.com', 'sub_1');
  perform pg_temp.checa('reembolso aplicado', (v_r ->> 'ok') = 'true');
  perform pg_temp.vira(v_bruno);
  perform pg_temp.checa('bruno perde o acesso apos reembolso',
    (public.meu_acesso() ->> 'ativo') = 'false');
  perform pg_temp.checa('reembolso corta a licenca do aparelho',
    (select count(*) = 1 from public.licencas
      where user_id = v_bruno and revogada_em is not null));

  -- reembolso repetido nao faz nada de novo
  perform pg_temp.vira(null);
  v_r := public.encerrar_pagamento('stripe', 'evt_4', 'charge.refunded',
                                   'bruno@exemplo.com', 'sub_1');
  perform pg_temp.checa('reembolso repetido e ignorado', (v_r ->> 'repetido') = 'true');

  -- uma cortesia do dono sobrevive a um reembolso do provedor
  perform pg_temp.vira(v_dono);
  perform public.conceder_acesso('bruno@exemplo.com', 90, 'cortesia', null, 'apoio');
  perform pg_temp.vira(null);
  perform public.encerrar_pagamento('stripe', 'evt_5', 'charge.refunded',
                                    'bruno@exemplo.com', null);
  perform pg_temp.vira(v_bruno);
  v_r := public.meu_acesso();
  perform pg_temp.checa('cortesia sobrevive ao reembolso', (v_r ->> 'ativo') = 'true');
  perform pg_temp.checa('e continua sendo cortesia', (v_r ->> 'origem') = 'cortesia');

  -- resumo do painel
  perform pg_temp.vira(v_dono);
  v_r := public.resumo_assinaturas();
  perform pg_temp.checa('resumo conta 3 pessoas', (v_r ->> 'contas') = '3');
  -- neste ponto o unico pagamento ja foi reembolsado; o que resta e a cortesia do bruno
  perform pg_temp.checa('resumo nao ve pagantes apos o reembolso', (v_r ->> 'pagantes') = '0');
  perform pg_temp.checa('resumo ve 1 cortesia ativa', (v_r ->> 'cortesias') = '1');
  perform pg_temp.checa('resumo ve 1 assinatura ativa no total', (v_r ->> 'ativas') = '1');
  perform pg_temp.checa('busca por email encontra',
    (select count(*) = 1 from public.listar_pessoas('bruno')));

  -- ---------------------------------------------------------------------------
  -- O que o cliente alcanca. O PostgREST publica como /rpc/ tudo o que estiver em
  -- `public` e for executavel pelo papel do token. O PostgreSQL concede EXECUTE a
  -- PUBLIC em toda funcao nova, e revogar so de `authenticated` nao tira esse grant
  -- herdado: sem revogar de PUBLIC, uma conta comum forjaria a propria assinatura.
  -- ---------------------------------------------------------------------------
  perform pg_temp.checa('registrar_pagamento fora do alcance do cliente',
    not has_function_privilege('authenticated',
      'public.registrar_pagamento(text, text, text, text, text, integer, text, jsonb, text)', 'execute'));
  perform pg_temp.checa('encerrar_pagamento fora do alcance do cliente',
    not has_function_privilege('authenticated',
      'public.encerrar_pagamento(text, text, text, text, text, jsonb, text)', 'execute'));
  perform pg_temp.checa('registrar_licenca fora do alcance do cliente',
    not has_function_privilege('authenticated',
      'public.registrar_licenca(uuid, timestamptz, text)', 'execute'));
  perform pg_temp.checa('revalida_acesso_de fora do alcance do cliente',
    not has_function_privilege('authenticated', 'public.revalida_acesso_de(uuid)', 'execute'));
  perform pg_temp.checa('revalida_audita fora do alcance do cliente',
    not has_function_privilege('authenticated', 'public.revalida_audita(text, uuid, jsonb)', 'execute'));
  perform pg_temp.checa('visitante anonimo nao alcanca conceder_acesso',
    not has_function_privilege('anon',
      'public.conceder_acesso(text, integer, public.revalida_origem_acesso, text, text)', 'execute'));
  perform pg_temp.checa('visitante anonimo nao alcanca meu_acesso',
    not has_function_privilege('anon', 'public.meu_acesso()', 'execute'));

  -- e o que ele precisa alcancar continua acessivel
  perform pg_temp.checa('conta autenticada consulta o proprio acesso',
    has_function_privilege('authenticated', 'public.meu_acesso()', 'execute'));
  perform pg_temp.checa('conta autenticada pode tentar conceder (a funcao e quem barra)',
    has_function_privilege('authenticated',
      'public.conceder_acesso(text, integer, public.revalida_origem_acesso, text, text)', 'execute'));
  perform pg_temp.checa('planos continuam legiveis sem sessao',
    has_table_privilege('anon', 'public.planos', 'select'));
  perform pg_temp.checa('eventos_pagamento invisivel ao cliente',
    not has_table_privilege('authenticated', 'public.eventos_pagamento', 'select'));

  -- ---------------------------------------------------------------------------
  -- Buracos que a revisao adversarial encontrou
  -- ---------------------------------------------------------------------------

  -- 1. Pagar com o e-mail de outra pessoa nao apaga a cortesia dela.
  --    (a Carla ganha cortesia; um estranho paga com o e-mail dela e pede reembolso)
  insert into auth.users (email) values ('carla@exemplo.com') returning id into v_carla;
  perform pg_temp.vira(v_dono);
  perform public.conceder_acesso('carla@exemplo.com', 120, 'cortesia', null, 'bolsa');
  perform pg_temp.vira(null);
  perform public.registrar_pagamento('stripe', 'evt_ataque', 'checkout.completed',
                                     'carla@exemplo.com', 'anual', 365, 'sub_ataque');
  perform public.encerrar_pagamento('stripe', 'evt_ataque_est', 'charge.refunded',
                                    'carla@exemplo.com', 'sub_ataque');
  perform pg_temp.vira(v_carla);
  v_r := public.meu_acesso();
  perform pg_temp.checa('cortesia sobrevive a pagamento alheio seguido de estorno',
    (v_r ->> 'ativo') = 'true');
  perform pg_temp.checa('e o que sobra e a cortesia, nao o pagamento',
    (v_r ->> 'origem') = 'cortesia');

  -- 2. Estorno sem e-mail (o caso do Stripe) encontra o dono pelo id da assinatura.
  perform pg_temp.vira(null);
  perform public.registrar_pagamento('stripe', 'evt_semmail', 'invoice.paid',
                                     'ana@exemplo.com', 'anual', 365, 'sub_ana');
  perform pg_temp.vira(v_ana);
  perform pg_temp.checa('ana volta a ter acesso pago',
    (public.meu_acesso() ->> 'origem') = 'pagamento');
  perform pg_temp.vira(null);
  v_r := public.encerrar_pagamento('stripe', 'evt_semmail_est', 'charge.refunded',
                                   '', 'sub_ana');
  perform pg_temp.checa('estorno sem e-mail resolve pelo id da assinatura',
    (v_r ->> 'ok') = 'true');
  perform pg_temp.vira(v_ana);
  perform pg_temp.checa('e o acesso pago realmente cai',
    (public.meu_acesso() ->> 'ativo') = 'false');

  -- 3. Pagamento anterior ao cadastro nao se perde: e resgatado ao criar a conta.
  perform pg_temp.vira(null);
  v_r := public.registrar_pagamento('hotmart', 'evt_antes', 'PURCHASE_APPROVED',
                                    'novo@exemplo.com', 'anual', 365, 'sub_novo');
  perform pg_temp.checa('pagamento sem conta fica pendente', (v_r ->> 'motivo') = 'sem_conta');
  insert into auth.users (email) values ('novo@exemplo.com') returning id into v_novo;
  perform pg_temp.vira(v_novo);
  v_r := public.meu_acesso();
  perform pg_temp.checa('ao criar a conta o pagamento e resgatado', (v_r ->> 'ativo') = 'true');
  perform pg_temp.checa('e vem como pagamento', (v_r ->> 'origem') = 'pagamento');
  perform pg_temp.checa('o evento deixa de estar pendente',
    (select processado_em is not null and erro is null from public.eventos_pagamento
      where provedor_evento_id = 'evt_antes'));

  -- 4. A revogacao tem efeito no aparelho: licenca_valida passa a dizer nao.
  perform pg_temp.vira(null);
  v_jti := public.registrar_licenca(v_novo, now() + interval '30 days', 'mac do novo');
  perform pg_temp.vira(v_novo);
  perform pg_temp.checa('licenca recem-emitida e valida', public.licenca_valida(v_jti));
  perform pg_temp.vira(v_dono);
  perform public.revogar_acesso('novo@exemplo.com', 'teste de revogacao');
  perform pg_temp.vira(v_novo);
  perform pg_temp.checa('licenca deixa de valer assim que o acesso e revogado',
    not public.licenca_valida(v_jti));

  raise notice 'TODAS AS PROVAS PASSARAM';
end
$prova$;
