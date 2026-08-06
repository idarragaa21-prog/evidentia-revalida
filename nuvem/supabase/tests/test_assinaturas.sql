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
  v_n integer;
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
  v_r := public.registrar_pagamento('dlocalgo', 'evt_antes', 'PAYMENT_PAID',
                                    'novo@exemplo.com', 'semestral', 180, 'DP-antes');
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

  -- 5. A escada de lancamento vive em dados e so o dono a governa.
  perform pg_temp.vira(null);
  perform pg_temp.checa('escada de lancamento: mensal 30 dias por R$57',
    (select dias = 30 and preco_centavos = 5700 and ativo from public.planos where id = 'mensal'));
  perform pg_temp.checa('escada de lancamento: trimestral 90 dias por R$147',
    (select dias = 90 and preco_centavos = 14700 and ativo from public.planos where id = 'trimestral'));
  perform pg_temp.checa('escada de lancamento: semestral 180 dias por R$247',
    (select dias = 180 and preco_centavos = 24700 and ativo from public.planos where id = 'semestral'));
  perform pg_temp.checa('o anual esta fora de venda no lancamento',
    (select not ativo from public.planos where id = 'anual'));
  -- a razao de ser da escada: cada prazo maior custa menos por dia
  perform pg_temp.checa('preco por dia decresce ao subir de plano',
    (select (select preco_centavos::numeric / dias from public.planos where id = 'mensal')
          > (select preco_centavos::numeric / dias from public.planos where id = 'trimestral')
       and (select preco_centavos::numeric / dias from public.planos where id = 'trimestral')
          > (select preco_centavos::numeric / dias from public.planos where id = 'semestral')));

  perform pg_temp.vira(v_ana);
  begin
    perform public.listar_planos_admin();
    raise exception 'FALHOU: pessoa comum listou os planos de administracao';
  exception when insufficient_privilege then
    raise notice 'ok: pessoa comum nao lista planos de administracao';
  end;
  begin
    perform public.salvar_plano('promo', 'Promo', null, 30, 1000);
    raise exception 'FALHOU: pessoa comum salvou um plano';
  exception when insufficient_privilege then
    raise notice 'ok: pessoa comum nao salva plano';
  end;

  perform pg_temp.vira(v_dono);
  v_r := public.salvar_plano('mensal', 'Mensal', 'Acesso completo por 30 dias', 30, 6700, true);
  perform pg_temp.checa('o dono muda o preco do mensal pelo painel',
    (v_r ->> 'preco_centavos') = '6700');
  perform pg_temp.checa('a mudanca de plano fica auditada',
    exists (select 1 from public.auditoria where acao = 'plano.salvo'
             and detalhes ->> 'plano' = 'mensal'));
  perform public.salvar_plano('mensal', 'Mensal', 'Acesso completo por 30 dias', 30, 5700, true);
  begin
    perform public.salvar_plano('Plano Invalido!', 'X', null, 30, 1000);
    raise exception 'FALHOU: identificador invalido foi aceito';
  exception when invalid_parameter_value then
    raise notice 'ok: identificador de plano invalido e recusado';
  end;

  -- 6. Checkout: o pedido congela email, plano e preco; o cliente nao o enxerga.
  perform pg_temp.vira(null);
  v_r := public.registrar_checkout('ev-semestral-abc123def456', 'compradora@exemplo.com', 'semestral');
  perform pg_temp.checa('checkout registrado congela dias e preco',
    (v_r ->> 'dias') = '180' and (v_r ->> 'preco_centavos') = '24700');
  begin
    perform public.registrar_checkout('ev-anual-abc123def456', 'compradora@exemplo.com', 'anual');
    raise exception 'FALHOU: checkout aceitou plano fora de venda';
  exception when no_data_found then
    raise notice 'ok: plano fora de venda nao gera checkout';
  end;
  perform pg_temp.checa('anotar_checkout vincula o pagamento do provedor',
    public.anotar_checkout('ev-semestral-abc123def456', 'DP-777', 'aguardando_pagamento'));
  perform pg_temp.checa('consultar_checkout devolve o pedido inteiro',
    (public.consultar_checkout('ev-semestral-abc123def456') ->> 'payment_id') = 'DP-777');
  perform pg_temp.checa('checkouts sao invisiveis para o cliente',
    not has_table_privilege('authenticated', 'public.checkouts', 'select')
    and not has_table_privilege('anon', 'public.checkouts', 'select'));
  perform pg_temp.checa('cliente nao registra checkout por conta propria',
    not has_function_privilege('authenticated', 'public.registrar_checkout(text, text, text)', 'execute')
    and not has_function_privilege('anon', 'public.registrar_checkout(text, text, text)', 'execute'));
  perform pg_temp.checa('o servidor (service role) registra checkout',
    has_function_privilege('service_role', 'public.registrar_checkout(text, text, text)', 'execute'));

  -- ---------------------------------------------------------------------------
  -- 7. Buracos que a revisao adversarial do fluxo de cobranca encontrou
  -- ---------------------------------------------------------------------------

  -- 7a. [ALTA] Sequestro por e-mail alheio. A pagina de venda aceita qualquer e-mail
  --     (quem compra ainda pode nao ter conta). Se o pagamento novo absorvesse o tempo
  --     ja pago da vitima, bastaria comprar o plano mais barato com o e-mail dela e
  --     pedir reembolso para apagar meses que ela pagou.
  perform pg_temp.vira(null);
  perform public.registrar_pagamento('dlocalgo', 'pay_vitima', 'PAYMENT_PAID',
                                     'vitima@exemplo.com', 'semestral', 180, 'DP-vitima');
  insert into auth.users (email) values ('vitima@exemplo.com') returning id into v_carla;
  perform pg_temp.vira(v_carla);
  v_fim1 := (public.meu_acesso() ->> 'fim')::timestamptz;
  perform pg_temp.checa('a vitima tem seu semestre pago', v_fim1 > now() + interval '179 days');

  perform pg_temp.vira(null);
  perform public.registrar_pagamento('dlocalgo', 'pay_atacante', 'PAYMENT_PAID',
                                     'vitima@exemplo.com', 'mensal', 30, 'DP-atacante');
  perform public.encerrar_pagamento('dlocalgo', 'refund_atacante', 'REFUND_SUCCESS',
                                    '', 'DP-atacante');
  perform pg_temp.vira(v_carla);
  perform pg_temp.checa('o estorno do atacante NAO derruba o acesso da vitima',
    (public.meu_acesso() ->> 'ativo') = 'true');
  v_fim2 := (public.meu_acesso() ->> 'fim')::timestamptz;
  perform pg_temp.checa('e devolve exatamente o semestre que ela pagou',
    v_fim2 between v_fim1 - interval '1 minute' and v_fim1 + interval '1 minute');

  -- 7b. [MEDIA] Passes empilhados: estornar o primeiro de tres tem que tirar os dias
  --     daquele passe — nem zero (acesso quase ilimitado por um passe) nem tudo.
  perform pg_temp.vira(null);
  insert into auth.users (email) values ('empilha@exemplo.com') returning id into v_novo;
  perform public.registrar_pagamento('dlocalgo', 'pay_e1', 'PAYMENT_PAID',
                                     'empilha@exemplo.com', 'semestral', 180, 'DP-e1');
  perform public.registrar_pagamento('dlocalgo', 'pay_e2', 'PAYMENT_PAID',
                                     'empilha@exemplo.com', 'semestral', 180, 'DP-e2');
  perform public.registrar_pagamento('dlocalgo', 'pay_e3', 'PAYMENT_PAID',
                                     'empilha@exemplo.com', 'mensal', 30, 'DP-e3');
  perform pg_temp.vira(v_novo);
  v_fim1 := (public.meu_acesso() ->> 'fim')::timestamptz;
  perform pg_temp.checa('tres passes somam 390 dias',
    v_fim1 > now() + interval '389 days' and v_fim1 < now() + interval '391 days');

  perform pg_temp.vira(null);
  perform public.encerrar_pagamento('dlocalgo', 'refund_e1', 'REFUND_SUCCESS',
                                    '', 'DP-e1');
  perform pg_temp.vira(v_novo);
  v_fim2 := (public.meu_acesso() ->> 'fim')::timestamptz;
  perform pg_temp.checa('estornar o PRIMEIRO passe tira 180 dias, nao zero nem tudo',
    v_fim2 between v_fim1 - interval '181 days' and v_fim1 - interval '179 days');
  perform pg_temp.checa('e o acesso continua vivo com o que sobrou',
    (public.meu_acesso() ->> 'ativo') = 'true');

  -- 7b-bis. O tempo ja consumido nao ressuscita. Duas compras de 180, a primeira
  --     comecada ha 30 dias: estornar a primeira tem que deixar 150 dias
  --     (360 comprados − 180 estornados − 30 ja usados), nao 180.
  perform pg_temp.vira(null);
  insert into auth.users (email) values ('gasto@exemplo.com') returning id into v_novo;
  perform public.registrar_pagamento('dlocalgo', 'pay_g1', 'PAYMENT_PAID',
                                     'gasto@exemplo.com', 'semestral', 180, 'DP-g1');
  perform public.registrar_pagamento('dlocalgo', 'pay_g2', 'PAYMENT_PAID',
                                     'gasto@exemplo.com', 'semestral', 180, 'DP-g2');
  -- envelhece a fila em 30 dias, como se a compra tivesse sido feita naquele dia
  update public.assinaturas set inicio = inicio - interval '30 days',
                                fim = fim - interval '30 days'
   where user_id = v_novo and origem = 'pagamento';
  perform public.encerrar_pagamento('dlocalgo', 'refund_g1', 'REFUND_SUCCESS',
                                    '', 'DP-g1');
  perform pg_temp.vira(v_novo);
  v_fim1 := (public.meu_acesso() ->> 'fim')::timestamptz;
  perform pg_temp.checa('o estorno desconta os dias ja consumidos, nao os devolve',
    v_fim1 between now() + interval '149 days' and now() + interval '151 days');

  -- 7c. Cada pagamento guarda quantos dias aportou: sem isso nao da para desfazer
  --     um estorno com exatidao.
  perform pg_temp.checa('a assinatura registra os dias do pagamento',
    (select dias = 30 from public.assinaturas
      where provedor_assinatura_id = 'DP-e3' and status = 'ativa'));

  -- 7d. [MEDIA] Ritmo do checkout: a porta e publica, entao o banco corta o excesso.
  perform pg_temp.vira(null);
  for v_n in 1..8 loop
    perform public.registrar_checkout('ev-mensal-limite' || lpad(v_n::text, 6, '0'),
                                      'ritmo@exemplo.com', 'mensal');
  end loop;
  begin
    perform public.registrar_checkout('ev-mensal-limite999999', 'ritmo@exemplo.com', 'mensal');
    raise exception 'FALHOU: o limite de pedidos por e-mail nao pegou';
  exception when configuration_limit_exceeded then
    raise notice 'ok: pedidos demais no mesmo e-mail sao recusados';
  end;

  raise notice 'TODAS AS PROVAS PASSARAM';
end
$prova$;
