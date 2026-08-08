-- Provas especificas da migracao de privacidade e do contrato Apple/Google.

\set ON_ERROR_STOP on
\set QUIET on
\pset format unaligned
\pset tuples_only on

create or replace function pg_temp.checa(p_nome text, p_condicao boolean)
returns void language plpgsql as $$
begin
  if p_condicao is not true then raise exception 'FALHOU: %', p_nome; end if;
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
  v_admin uuid;
  v_dona uuid;
  v_intruso uuid;
  v_apagar uuid;
  v_rate uuid;
  v_i integer;
  v_jti uuid;
  v_token text;
  v_interesse jsonb;
  v_compra jsonb;
  v_compra_id uuid;
  v_recibo uuid;
  v_antes integer;
  v_expira timestamptz := now() + interval '10 days';
begin
  insert into auth.users (email) values ('priv-admin@exemplo.com') returning id into v_admin;
  insert into auth.users (email) values ('licenca-dona@exemplo.com') returning id into v_dona;
  insert into auth.users (email) values ('licenca-intruso@exemplo.com') returning id into v_intruso;
  insert into public.admins (user_id, nota) values (v_admin, 'teste privacidade');

  insert into public.assinaturas (user_id, plano_id, origem, status, inicio, fim, dias, nota)
  values (v_dona, 'mensal', 'cortesia', 'ativa', now(), now() + interval '30 days', 30, 'teste');
  v_jti := public.registrar_licenca(v_dona, now() + interval '20 days', 'dado legado de aparelho');

  perform pg_temp.vira(v_dona);
  perform pg_temp.checa('dona consulta a propria licenca', public.licenca_valida(v_jti));
  perform pg_temp.vira(v_intruso);
  perform pg_temp.checa('outra conta nao consulta JTI alheio', not public.licenca_valida(v_jti));
  perform pg_temp.vira(null);
  perform pg_temp.checa('sem sessao nenhum JTI e valido', not public.licenca_valida(v_jti));

  perform pg_temp.vira(v_admin);
  perform public.revalida_audita('teste.sanitizacao', v_dona,
    jsonb_build_object('email', 'segredo@exemplo.com', 'nested',
      jsonb_build_object('refresh_token', 'nao-guardar', 'seguro', 'sim'),
      'user_id', v_dona));
  perform pg_temp.checa('auditoria remove PII e credenciais inclusive aninhadas',
    (select detalhes::text not like '%segredo@%'
            and detalhes::text not like '%nao-guardar%'
            and detalhes #>> '{nested,seguro}' = 'sim'
       from public.auditoria where acao = 'teste.sanitizacao' order by id desc limit 1));

  perform pg_temp.checa('lista legada nao aceita escrita anonima',
    not has_function_privilege('anon', 'public.registrar_interesse(text,text,text)', 'execute'));
  perform pg_temp.checa('token de confirmacao so e criado pelo service role',
    has_function_privilege('service_role', 'public.criar_interesse_pendente(text,text,text)', 'execute')
    and not has_function_privilege('authenticated', 'public.criar_interesse_pendente(text,text,text)', 'execute'));

  v_interesse := public.criar_interesse_pendente('confirmar@exemplo.com', 'mensal', 'teste');
  v_token := v_interesse ->> 'token_confirmacao';
  perform pg_temp.checa('lista guarda hash, nunca token cru',
    exists (select 1 from public.interessados where email = 'confirmar@exemplo.com'
            and confirmacao_hash is not null and confirmacao_hash <> v_token));
  perform pg_temp.checa('link confirma interesse',
    (public.confirmar_interesse(v_token) ->> 'ok') = 'true');
  perform pg_temp.vira(v_admin);
  perform pg_temp.checa('painel lista apenas interesse confirmado',
    exists (select 1 from public.listar_interessados() where email = 'confirmar@exemplo.com'));

  -- Mapeamento e entitlement nativo. Nenhuma RPC de service role fica exposta.
  perform pg_temp.checa('catalogo Google usa subscriptionsv2 para planos pre-pagos',
    (select bool_and(tipo = 'assinatura') from public.produtos_loja where plataforma = 'google'));
  perform public.salvar_produto_loja(
    'apple', 'com.evidentia.revalida.access.30d', 'mensal', 'nao_consumivel', true);
  perform public.salvar_produto_loja(
    'apple', 'com.evidentia.revalida.access.90d', 'trimestral', 'assinatura', true);
  begin
    perform public.salvar_produto_loja('apple', 'com.evidentia.revalida.acesso.30d', 'mensal', 'nao_consumivel', true);
    raise exception 'FALHOU: SKU fora da allowlist foi salvo';
  exception when invalid_parameter_value then
    raise notice 'ok: backend rejeita SKU fora da allowlist compilada';
  end;
  perform pg_temp.checa('cliente nao confirma compra nativa',
    not has_function_privilege('authenticated',
      'public.confirmar_compra_nativa(uuid,text,text,text,timestamptz,jsonb)', 'execute')
    and not has_table_privilege('authenticated', 'public.compras_nativas', 'select'));

  v_compra := public.registrar_solicitacao_compra_nativa(
    v_dona, 'apple', 'com.evidentia.revalida.access.30d', 'tx-pass-1', repeat('a', 64));
  v_compra_id := (v_compra ->> 'id')::uuid;
  perform pg_temp.checa('comprovante nasce pendente', (v_compra ->> 'status') = 'pendente_verificacao');
  v_compra := public.registrar_solicitacao_compra_nativa(
    v_dona, 'apple', 'com.evidentia.revalida.access.30d', 'tx-pass-1', repeat('a', 64));
  perform pg_temp.checa('replay da mesma conta e idempotente',
    (v_compra ->> 'repetido') = 'true' and (v_compra ->> 'id')::uuid = v_compra_id);
  begin
    perform public.registrar_solicitacao_compra_nativa(
      v_intruso, 'apple', 'com.evidentia.revalida.access.30d', 'tx-pass-1', repeat('a', 64));
    raise exception 'FALHOU: outra conta tomou comprovante';
  exception when insufficient_privilege then
    raise notice 'ok: comprovante nao muda de conta';
  end;
  v_compra := public.confirmar_compra_nativa(
    v_compra_id, 'tx-pass-1', 'orig-pass-1', 'sandbox', null, '{"email":"nao@guardar"}'::jsonb);
  perform pg_temp.checa('resposta oficial cria entitlement', (v_compra ->> 'ativo') = 'true');
  perform pg_temp.checa('detalhes nativos tambem sao sanitizados',
    (select detalhes::text not like '%nao@guardar%' from public.compras_nativas where id = v_compra_id));

  select count(*) into v_antes from public.assinaturas where user_id = v_dona and origem = 'pagamento';
  v_compra := public.registrar_solicitacao_compra_nativa(
    v_dona, 'apple', 'com.evidentia.revalida.access.30d', 'tx-pass-1', repeat('e', 64));
  v_compra_id := (v_compra ->> 'id')::uuid;
  v_compra := public.confirmar_compra_nativa(
    v_compra_id, 'tx-pass-1', 'orig-pass-1', 'sandbox', null, '{}'::jsonb);
  perform pg_temp.checa('ID oficial torna idempotente um JWS Apple diferente',
    (v_compra ->> 'ativo') = 'true' and (v_compra ->> 'repetido') = 'true'
    and (select count(*) from public.assinaturas where user_id = v_dona and origem = 'pagamento') = v_antes);
  begin
    v_compra := public.registrar_solicitacao_compra_nativa(
      v_intruso, 'apple', 'com.evidentia.revalida.access.30d', 'tx-pass-1', repeat('f', 64));
    perform public.confirmar_compra_nativa(
      (v_compra ->> 'id')::uuid, 'tx-pass-1', 'orig-pass-1', 'sandbox', null, '{}'::jsonb);
    raise exception 'FALHOU: replay oficial mudou de conta';
  exception when insufficient_privilege then
    raise notice 'ok: replay oficial nao muda de conta';
  end;

  v_compra := public.registrar_solicitacao_compra_nativa(
    v_intruso, 'apple', 'com.evidentia.revalida.access.90d', 'tx-sub-1', repeat('b', 64));
  v_compra_id := (v_compra ->> 'id')::uuid;
  perform public.confirmar_compra_nativa(
    v_compra_id, 'tx-sub-1', 'orig-sub-1', 'sandbox', v_expira, '{}'::jsonb);
  perform pg_temp.checa('validade recorrente da loja nao e empilhada localmente',
    (select janela_autoritativa and fim between v_expira - interval '2 seconds' and v_expira + interval '2 seconds'
       from public.assinaturas where id =
         (select assinatura_id from public.compras_nativas where id = v_compra_id)));

  insert into auth.users (email) values ('rate-native@exemplo.com') returning id into v_rate;
  for v_i in 1..30 loop
    perform public.registrar_solicitacao_compra_nativa(
      v_rate, 'apple', 'com.evidentia.revalida.access.30d', 'tx-rate-' || v_i,
      lpad(to_hex(v_i), 64, '0'));
  end loop;
  begin
    perform public.registrar_solicitacao_compra_nativa(
      v_rate, 'apple', 'com.evidentia.revalida.access.30d', 'tx-rate-31', lpad(to_hex(31), 64, '0'));
    raise exception 'FALHOU: limite nativo nao foi aplicado';
  exception when sqlstate '53400' then
    raise notice 'ok: verificacao nativa limita abuso por conta';
  end;
  v_compra := public.registrar_solicitacao_compra_nativa(
    v_rate, 'apple', 'com.evidentia.revalida.access.30d', 'tx-rate-1', lpad(to_hex(1), 64, '0'));
  perform pg_temp.checa('replay idempotente continua permitido depois do limite',
    (v_compra ->> 'repetido') = 'true');

  -- Exclusao: todos os efeitos pertencem a mesma funcao/transacao.
  insert into auth.users (email) values ('apagar@exemplo.com') returning id into v_apagar;
  insert into public.assinaturas (user_id, plano_id, origem, status, inicio, fim, dias, nota)
  values (v_apagar, 'mensal', 'cortesia', 'ativa', now(), now() + interval '30 days', 30, 'apagar');
  perform public.registrar_licenca(v_apagar, now() + interval '10 days', 'iphone legado');
  insert into public.checkouts (order_id, plano_id, email, dias, preco_centavos, moeda, status)
  values ('ev-apagar-123456789', 'mensal', 'apagar@exemplo.com', 30, 5700, 'BRL', 'pago');
  insert into public.eventos_pagamento (provedor, provedor_evento_id, tipo, email, carga, processado_em)
  values ('teste', 'evt-apagar-1', 'pago', 'apagar@exemplo.com',
          '{"payer":{"email":"apagar@exemplo.com"},"seguro":"sim"}'::jsonb, now());
  insert into public.interessados (email, plano_id, origem, confirmado_em)
  values ('apagar@exemplo.com', 'mensal', 'teste', now());
  insert into public.auditoria (ator_id, acao, alvo_user_id, detalhes)
  values (v_apagar, 'teste.apagar', v_apagar, jsonb_build_object('email', 'apagar@exemplo.com'));
  v_compra := public.registrar_solicitacao_compra_nativa(
    v_apagar, 'apple', 'com.evidentia.revalida.access.30d', 'tx-apagar', repeat('c', 64));

  perform pg_temp.checa('historico financeiro fica vinculado por UUID interno',
    (select user_id = v_apagar from public.checkouts where order_id = 'ev-apagar-123456789')
    and (select user_id = v_apagar from public.eventos_pagamento where provedor_evento_id = 'evt-apagar-1')
    and (select user_id = v_apagar from public.interessados where email = 'apagar@exemplo.com'));
  -- A exclusao deve encontrar tambem os registros do endereco anterior.
  update auth.users set email = 'apagar-novo@exemplo.com' where id = v_apagar;

  v_recibo := public.excluir_conta_com_privacidade(v_apagar);
  perform pg_temp.checa('exclusao remove auth.users', not exists (select 1 from auth.users where id = v_apagar));
  perform pg_temp.checa('cascade remove perfil assinatura e licenca',
    not exists (select 1 from public.perfis where user_id = v_apagar)
    and not exists (select 1 from public.assinaturas where user_id = v_apagar)
    and not exists (select 1 from public.licencas where user_id = v_apagar));
  perform pg_temp.checa('checkout fiscal fica sem email',
    (select email is null and user_id is null
       from public.checkouts where order_id = 'ev-apagar-123456789'));
  perform pg_temp.checa('evento fiscal fica sem email e sem copia no payload',
    (select email is null and user_id is null
            and carga::text not like '%apagar@%' and carga ->> 'seguro' = 'sim'
       from public.eventos_pagamento where provedor_evento_id = 'evt-apagar-1'));
  perform pg_temp.checa('marketing e removido',
    not exists (select 1 from public.interessados where email = 'apagar@exemplo.com'));
  perform pg_temp.checa('compra fiscal fica desvinculada da conta',
    exists (select 1 from public.compras_nativas where credencial_hash = repeat('c', 64) and user_id is null));
  perform pg_temp.checa('recibo anonimo existe',
    exists (select 1 from public.exclusoes where pedido_id = v_recibo));
  perform pg_temp.checa('schema nao conserva hash de email na exclusao',
    not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'exclusoes' and column_name = 'email_hash'));

  select count(*) into v_antes from public.exclusoes;
  begin
    perform public.excluir_conta_com_privacidade(gen_random_uuid());
    raise exception 'FALHOU: exclusao inexistente nao falhou';
  exception when no_data_found then
    raise notice 'ok: exclusao inexistente falha inteira';
  end;
  perform pg_temp.checa('falha nao cria recibo parcial', (select count(*) from public.exclusoes) = v_antes);

  -- Prova minima da rotina de retencao.
  insert into public.interessados (email, origem, criado_em)
  values ('expirado@exemplo.com', 'teste', now() - interval '8 days');
  v_compra := public.registrar_solicitacao_compra_nativa(
    v_dona, 'apple', 'com.evidentia.revalida.access.30d', 'tx-retencao', repeat('d', 64));
  perform public.marcar_compra_nativa((v_compra ->> 'id')::uuid, 'rejeitada', 'teste_retencao');
  update public.compras_nativas set solicitado_em = now() - interval '91 days'
   where id = (v_compra ->> 'id')::uuid;
  perform public.revalida_aplicar_retencao_completa();
  perform pg_temp.checa('retencao apaga interesse pendente vencido',
    not exists (select 1 from public.interessados where email = 'expirado@exemplo.com'));
  perform pg_temp.checa('retencao completa inclui comprovante nativo rejeitado',
    not exists (select 1 from public.compras_nativas where credencial_hash = repeat('d', 64)));

  raise notice 'TODAS AS PROVAS DE PRIVACIDADE E COMPRAS PASSARAM';
end
$prova$;
