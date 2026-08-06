-- Evidentia · Revalida — modo de avaliação: conta nova entra e usa, sem intermediário.
--
-- Para que colegas testem o produto de verdade, criar conta tem que bastar. Sem isto,
-- cada avaliador espera que o dono lhe conceda acesso pelo painel — o que serve para
-- vender, mas trava um teste com dez pessoas num sábado à noite.
--
-- É um INTERRUPTOR, não uma mudança de comportamento: `ajustes` guarda quantos dias de
-- cortesia automática recebe cada conta nova. Em zero (o padrão), nada acontece e o
-- produto volta a exigir concessão manual — que é como tem que estar quando começar a
-- vender de verdade.
--
-- O acesso concedido assim nasce com origem 'teste', não 'cortesia': no painel dá para
-- distinguir quem entrou sozinho num teste de quem o dono convidou a dedo.

begin;

create table if not exists public.ajustes (
  chave text primary key,
  valor jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id) on delete set null
);

alter table public.ajustes enable row level security;
-- Sem policy de leitura para o cliente: um ajuste operacional não é da conta de ninguém.

insert into public.ajustes (chave, valor)
values ('avaliacao', jsonb_build_object('dias', 0))
on conflict (chave) do nothing;

create or replace function public.revalida_dias_de_avaliacao()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0, least(3650, coalesce((valor ->> 'dias')::integer, 0)))
    from public.ajustes where chave = 'avaliacao';
$$;

-- O gatilho de conta nova passa a olhar o interruptor.
create or replace function public.revalida_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome text;
  v_dias integer;
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

  -- Modo de avaliação, se estiver ligado. Nunca sobrepõe um acesso que já exista
  -- (um pagamento resgatado acima vale mais que uma cortesia de teste).
  v_dias := public.revalida_dias_de_avaliacao();
  if v_dias > 0 and not exists (
       select 1 from public.assinaturas as a
        where a.user_id = new.id and a.status = 'ativa' and a.fim > now()
     ) then
    insert into public.assinaturas (user_id, origem, status, inicio, fim, dias, nota)
    values (new.id, 'teste', 'ativa', now(), now() + make_interval(days => v_dias), v_dias,
            'acesso automatico do modo de avaliacao');
    insert into public.auditoria (ator_id, acao, alvo_user_id, detalhes)
    values (null, 'avaliacao.concedida', new.id, jsonb_build_object('dias', v_dias));
  end if;

  return new;
end;
$$;

-- Ligar e desligar o modo. Só o dono, e sempre auditado: é uma porta aberta e tem
-- que ficar registrado quem a abriu e quando.
create or replace function public.definir_modo_avaliacao(p_dias integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.revalida_e_admin() then
    raise exception 'apenas administradores' using errcode = '42501';
  end if;
  if p_dias is null or p_dias < 0 or p_dias > 3650 then
    raise exception 'dias fora do intervalo permitido' using errcode = '22023';
  end if;

  update public.ajustes
     set valor = jsonb_build_object('dias', p_dias),
         atualizado_em = now(),
         atualizado_por = auth.uid()
   where chave = 'avaliacao';

  perform public.revalida_audita('avaliacao.modo', null, jsonb_build_object('dias', p_dias));
  return jsonb_build_object('ok', true, 'dias', p_dias,
                            'ligado', p_dias > 0);
end;
$$;

create or replace function public.consultar_modo_avaliacao()
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
  return jsonb_build_object('dias', public.revalida_dias_de_avaliacao());
end;
$$;

revoke all on public.ajustes from anon, authenticated;
revoke all on function public.revalida_dias_de_avaliacao() from public, anon, authenticated;
revoke all on function public.definir_modo_avaliacao(integer) from public, anon;
revoke all on function public.consultar_modo_avaliacao() from public, anon;
grant execute on function public.definir_modo_avaliacao(integer) to authenticated;
grant execute on function public.consultar_modo_avaliacao() to authenticated;

commit;
