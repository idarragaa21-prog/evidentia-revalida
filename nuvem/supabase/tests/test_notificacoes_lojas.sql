-- Provas de idempotencia e de revogacao dos webhooks Apple/Google.

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

do $prova$
declare
  v_user uuid;
  v_outro uuid;
  v_compra jsonb;
  v_compra_id uuid;
  v_compra_outro_id uuid;
  v_assinatura_id uuid;
  v_assinatura_outro_id uuid;
  v_jti uuid;
  v_jti_outro uuid;
  v_hash_conta text;
  v_hash_outro text;
  v_resposta jsonb;
  v_frente uuid;
  v_tras uuid;
  v_hash_frente text;
  v_hash_tras text;
  v_compra_180 uuid;
  v_compra_30 uuid;
  v_inicio timestamptz;
  v_fim timestamptz;
  v_jti_cadeia uuid;
begin
  insert into auth.users (email) values ('notificacao@exemplo.com') returning id into v_user;
  insert into auth.users (email) values ('notificacao-outro@exemplo.com') returning id into v_outro;
  v_hash_conta := encode(sha256(convert_to(lower(v_user::text), 'UTF8')), 'hex');
  v_hash_outro := encode(sha256(convert_to(lower(v_outro::text), 'UTF8')), 'hex');

  v_compra := public.registrar_solicitacao_compra_nativa(
    v_user, 'google', 'com.evidentia.revalida.access.30d', 'GPA.notify.1', repeat('1', 64));
  v_compra_id := (v_compra ->> 'id')::uuid;
  perform public.confirmar_compra_nativa(
    v_compra_id, 'GPA.notify.1', 'GPA.notify.1', 'production',
    now() + interval '30 days', '{}'::jsonb);
  select assinatura_id into v_assinatura_id from public.compras_nativas where id = v_compra_id;
  v_jti := public.registrar_licenca(v_user, now() + interval '10 days', 'teste notificacao');

  v_resposta := public.reservar_notificacao_loja(
    'google', 'message-1', repeat('a', 64), 'subscription_13');
  perform pg_temp.checa('primeira entrega adquire lease',
    (v_resposta ->> 'processar') = 'true' and (v_resposta ->> 'tentativas') = '1');
  v_resposta := public.reservar_notificacao_loja(
    'google', 'message-1', repeat('a', 64), 'subscription_13');
  perform pg_temp.checa('concorrente nao processa a mesma lease',
    (v_resposta ->> 'processar') = 'false' and (v_resposta ->> 'ocupada') = 'true');

  perform public.finalizar_notificacao_loja(
    'google', 'message-1', 'erro_temporario', 'api_temporaria');
  update public.notificacoes_loja set bloqueado_ate = now() - interval '1 second'
   where plataforma = 'google' and evento_id = 'message-1';
  v_resposta := public.reservar_notificacao_loja(
    'google', 'message-1', repeat('a', 64), 'subscription_13');
  perform pg_temp.checa('retry vencido readquire lease e soma tentativa',
    (v_resposta ->> 'processar') = 'true' and (v_resposta ->> 'tentativas') = '2');
  perform public.finalizar_notificacao_loja(
    'google', 'message-1', 'processada', null, 'GPA.notify.1',
    'com.evidentia.revalida.access.30d', v_compra_id,
    '{"purchase_token":"nao-guardar","seguro":"sim"}'::jsonb);
  perform pg_temp.checa('payload livre da notificacao e sanitizado',
    (select detalhes::text not like '%nao-guardar%' and detalhes ->> 'seguro' = 'sim'
       from public.notificacoes_loja where plataforma = 'google' and evento_id = 'message-1'));
  v_resposta := public.reservar_notificacao_loja(
    'google', 'message-1', repeat('a', 64), 'subscription_13');
  perform pg_temp.checa('evento finalizado e idempotente',
    (v_resposta ->> 'processar') = 'false' and (v_resposta ->> 'repetida') = 'true');
  begin
    perform public.reservar_notificacao_loja(
      'google', 'message-1', repeat('b', 64), 'subscription_13');
    raise exception 'FALHOU: messageId aceitou outro payload';
  exception when insufficient_privilege then
    raise notice 'ok: messageId nao aceita payload divergente';
  end;

  perform pg_temp.checa('somente overload endurecido fica para service role',
    not has_function_privilege('service_role',
      'public.encerrar_compra_nativa(text,text,text,text)', 'execute')
    and has_function_privilege('service_role',
      'public.encerrar_compra_nativa(text,text,text,text,text,text)', 'execute')
    and not has_function_privilege('authenticated',
      'public.encerrar_compra_nativa(text,text,text,text,text,text)', 'execute'));

  begin
    perform public.encerrar_compra_nativa(
      'google', 'GPA.notify.1', 'revogada', 'teste',
      'com.evidentia.revalida.access.30d', repeat('f', 64));
    raise exception 'FALHOU: hash de outra conta encerrou compra';
  exception when insufficient_privilege then
    raise notice 'ok: encerramento exige hash da conta original';
  end;
  perform pg_temp.checa('falha de vinculo nao revoga entitlement',
    (select status = 'verificada' from public.compras_nativas where id = v_compra_id)
    and (select status = 'ativa' from public.assinaturas where id = v_assinatura_id)
    and (select revogada_em is null from public.licencas where jti = v_jti));

  v_resposta := public.encerrar_compra_nativa(
    'google', 'GPA.notify.1', 'revogada', 'google_revoked',
    'com.evidentia.revalida.access.30d', v_hash_conta);
  perform pg_temp.checa('evento oficial encerra compra e assinatura vinculada',
    (v_resposta ->> 'ok') = 'true'
    and (select status = 'revogada' from public.compras_nativas where id = v_compra_id)
    and (select status = 'revogada' from public.assinaturas where id = v_assinatura_id));
  perform pg_temp.checa('sem outro entitlement a licenca e revogada',
    (select revogada_em is not null from public.licencas where jti = v_jti));
  v_resposta := public.encerrar_compra_nativa(
    'google', 'GPA.notify.1', 'revogada', 'google_revoked',
    'com.evidentia.revalida.access.30d', v_hash_conta);
  perform pg_temp.checa('encerramento repetido nao duplica efeito',
    (v_resposta ->> 'ok') = 'true' and (v_resposta ->> 'repetido') = 'true');

  -- Um estorno nao derruba uma cortesia ou outra compra ainda ativa.
  v_compra := public.registrar_solicitacao_compra_nativa(
    v_outro, 'google', 'com.evidentia.revalida.access.90d', 'GPA.notify.2', repeat('2', 64));
  v_compra_outro_id := (v_compra ->> 'id')::uuid;
  perform public.confirmar_compra_nativa(
    v_compra_outro_id, 'GPA.notify.2', 'GPA.notify.2', 'production',
    now() + interval '90 days', '{}'::jsonb);
  select assinatura_id into v_assinatura_outro_id
    from public.compras_nativas where id = v_compra_outro_id;
  insert into public.assinaturas (user_id, plano_id, origem, status, inicio, fim, dias, nota)
  values (v_outro, 'mensal', 'cortesia', 'ativa', now(), now() + interval '15 days', 15,
          'entitlement independente');
  v_jti_outro := public.registrar_licenca(v_outro, now() + interval '10 days', 'outro entitlement');
  perform public.encerrar_compra_nativa(
    'google', 'GPA.notify.2', 'reembolsada', 'google_voided_purchase',
    'com.evidentia.revalida.access.90d', v_hash_outro);
  perform pg_temp.checa('estorno fecha apenas assinatura da compra',
    (select status = 'revogada' from public.assinaturas where id = v_assinatura_outro_id)
    and exists (select 1 from public.assinaturas
                 where user_id = v_outro and origem = 'cortesia' and status = 'ativa' and fim > now()));
  perform pg_temp.checa('outro entitlement sobrevive mas licenca antiga e rotacionada',
    exists (select 1 from public.assinaturas
             where user_id = v_outro and status = 'ativa' and fim > now())
    and (select revogada_em is not null from public.licencas where jti = v_jti_outro));

  -- Reembolsos em ambos os extremos de uma fila Apple devem remover exatamente
  -- os dias aportados, nunca conservar o max(fim) anterior na linha sobrevivente.
  insert into auth.users (email) values ('cadeia-frente@exemplo.com') returning id into v_frente;
  v_hash_frente := encode(sha256(convert_to(lower(v_frente::text), 'UTF8')), 'hex');
  v_compra := public.registrar_solicitacao_compra_nativa(
    v_frente, 'apple', 'com.evidentia.revalida.access.180d', 'apple-frente-180', repeat('3', 64));
  v_compra_180 := (v_compra ->> 'id')::uuid;
  perform public.confirmar_compra_nativa(
    v_compra_180, 'apple-frente-180', 'apple-frente-180', 'sandbox', null, '{}'::jsonb);
  v_compra := public.registrar_solicitacao_compra_nativa(
    v_frente, 'apple', 'com.evidentia.revalida.access.30d', 'apple-frente-30', repeat('4', 64));
  v_compra_30 := (v_compra ->> 'id')::uuid;
  perform public.confirmar_compra_nativa(
    v_compra_30, 'apple-frente-30', 'apple-frente-30', 'sandbox', null, '{}'::jsonb);
  select min(inicio), max(fim) into v_inicio, v_fim
    from public.assinaturas where user_id = v_frente and status = 'ativa' and origem = 'pagamento';
  perform pg_temp.checa('fila Apple inicial soma 180 + 30 dias',
    v_fim between v_inicio + interval '210 days' - interval '2 seconds'
              and v_inicio + interval '210 days' + interval '2 seconds');
  v_jti_cadeia := public.registrar_licenca(v_frente, v_fim, 'fila frente');
  perform public.encerrar_compra_nativa(
    'apple', 'apple-frente-180', 'reembolsada', 'apple_refund',
    'com.evidentia.revalida.access.180d', v_hash_frente);
  select max(fim) into v_fim from public.assinaturas
   where user_id = v_frente and status = 'ativa' and origem = 'pagamento';
  perform pg_temp.checa('reembolso do passe da frente deixa somente 30 dias desde o inicio original',
    v_fim between v_inicio + interval '30 days' - interval '2 seconds'
              and v_inicio + interval '30 days' + interval '2 seconds');
  perform pg_temp.checa('reembolso da frente revoga licenca de 210 dias',
    (select revogada_em is not null from public.licencas where jti = v_jti_cadeia));

  insert into auth.users (email) values ('cadeia-tras@exemplo.com') returning id into v_tras;
  v_hash_tras := encode(sha256(convert_to(lower(v_tras::text), 'UTF8')), 'hex');
  v_compra := public.registrar_solicitacao_compra_nativa(
    v_tras, 'apple', 'com.evidentia.revalida.access.180d', 'apple-tras-180', repeat('5', 64));
  v_compra_180 := (v_compra ->> 'id')::uuid;
  perform public.confirmar_compra_nativa(
    v_compra_180, 'apple-tras-180', 'apple-tras-180', 'sandbox', null, '{}'::jsonb);
  v_compra := public.registrar_solicitacao_compra_nativa(
    v_tras, 'apple', 'com.evidentia.revalida.access.30d', 'apple-tras-30', repeat('6', 64));
  v_compra_30 := (v_compra ->> 'id')::uuid;
  perform public.confirmar_compra_nativa(
    v_compra_30, 'apple-tras-30', 'apple-tras-30', 'sandbox', null, '{}'::jsonb);
  select min(inicio), max(fim) into v_inicio, v_fim
    from public.assinaturas where user_id = v_tras and status = 'ativa' and origem = 'pagamento';
  v_jti_cadeia := public.registrar_licenca(v_tras, v_fim, 'fila tras');
  perform public.encerrar_compra_nativa(
    'apple', 'apple-tras-30', 'reembolsada', 'apple_refund',
    'com.evidentia.revalida.access.30d', v_hash_tras);
  select max(fim) into v_fim from public.assinaturas
   where user_id = v_tras and status = 'ativa' and origem = 'pagamento';
  perform pg_temp.checa('reembolso do top-up deixa somente os 180 dias comprados',
    v_fim between v_inicio + interval '180 days' - interval '2 seconds'
              and v_inicio + interval '180 days' + interval '2 seconds');
  perform pg_temp.checa('reembolso do top-up tambem revoga licenca de 210 dias',
    (select revogada_em is not null from public.licencas where jti = v_jti_cadeia));

  insert into public.notificacoes_loja (
    plataforma, evento_id, payload_hash, tipo, status, recebido_em, processado_em
  ) values (
    'apple', 'retencao-velha', repeat('c', 64), 'REFUND', 'ignorada',
    now() - interval '5 years 1 day', now() - interval '5 years'
  );
  perform public.revalida_aplicar_retencao_compras_nativas();
  perform pg_temp.checa('retencao remove metadado de notificacao apos cinco anos',
    not exists (select 1 from public.notificacoes_loja
                 where plataforma = 'apple' and evento_id = 'retencao-velha'));

  raise notice 'TODAS AS PROVAS DE NOTIFICACOES DAS LOJAS PASSARAM';
end
$prova$;
