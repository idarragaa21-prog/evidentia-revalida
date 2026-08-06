-- Evidentia · Revalida — planos vendáveis, checkouts do dLocal Go e administração de planos.
-- Segue as regras da migração 202608050001: nenhuma escrita direta do cliente,
-- RLS em tudo, mutação só por RPC `security definer` auditada.
--
-- Contexto (2026-08-06): a cobrança de lançamento é dLocal Go com PASSES de pagamento
-- único (30/90/180 dias) — PIX ou cartão, em reais, transação doméstica no Brasil.
-- A escada de preços vive em dados, editável pelo painel do dono: mudar o preço aqui
-- muda o que o cliente novo vê, sem tocar em código nem republicar nada.

begin;

-- ---------------------------------------------------------------------------
-- Planos: a escada real de lançamento (mensal 57 · trimestral 147 · semestral 247)
-- ---------------------------------------------------------------------------
-- O semestral de R$ 247 é decisão do dono e não se toca. O mensal antigo de R$ 39
-- invertia a escada (39×6 = 234 < 247: o semestral saía mais caro que pagar mês a
-- mês). O mensal de R$ 57 restaura o desconto real por prazo: R$ 57 → R$ 49 →
-- R$ 41,17 por mês (14% e 28% de desconto). O trimestral de R$ 147 é exatamente o
-- preço de UM mês do comparável direto (Revalida Resolve): a comparação se defende
-- sozinha na página de venda.

insert into public.planos (id, nome, descricao, dias, preco_centavos, moeda, ativo) values
  ('mensal',     'Mensal',     'Acesso completo por 30 dias',  30,  5700, 'BRL', true),
  ('trimestral', 'Trimestral', 'Acesso completo por 90 dias',  90, 14700, 'BRL', true)
on conflict (id) do update
  set nome = excluded.nome,
      descricao = excluded.descricao,
      dias = excluded.dias,
      preco_centavos = excluded.preco_centavos,
      moeda = excluded.moeda,
      ativo = excluded.ativo;

update public.planos
   set dias = 180,
       preco_centavos = 24700,
       descricao = 'Acesso completo por 180 dias — um ciclo inteiro de preparação'
 where id = 'semestral';

-- O anual sai de cena no lançamento: o Revalida tem duas edições por ano, o ciclo
-- real de preparação é de até 6 meses, e um banco de 500 questões não sustenta
-- honestamente uma promessa de 12 meses. Reavaliar quando o banco passar de
-- ~1.000 questões ou quando ≥20% dos semestrais renovarem para um segundo ciclo.
update public.planos set ativo = false where id = 'anual';

-- ---------------------------------------------------------------------------
-- Checkouts: o elo entre o pedido nosso e o pagamento do provedor
-- ---------------------------------------------------------------------------
-- A notificação do dLocal Go traz só o payment_id; o pagamento traz o order_id.
-- Esta tabela guarda, no momento da criação do pedido, o e-mail, o plano e o
-- preço combinado — a ativação usa o que NÓS registramos, não o que viajou pela
-- rede. Só o service role escreve e lê (nenhuma policy de RLS).

create table if not exists public.checkouts (
  order_id text primary key,
  plano_id text not null references public.planos(id),
  email text not null,
  dias integer not null,
  preco_centavos integer not null,
  moeda text not null default 'BRL',
  payment_id text,
  status text not null default 'criado',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint checkouts_order_tamanho check (char_length(order_id) between 8 and 128),
  constraint checkouts_email_valido check (position('@' in email) > 1),
  constraint checkouts_dias_positivos check (dias between 1 and 3650),
  constraint checkouts_preco_positivo check (preco_centavos > 0),
  constraint checkouts_status_tamanho check (char_length(status) <= 40)
);

create index if not exists checkouts_payment_idx on public.checkouts (payment_id)
  where payment_id is not null;
create index if not exists checkouts_email_idx on public.checkouts (email, criado_em desc);

drop trigger if exists checkouts_atualizado on public.checkouts;
create trigger checkouts_atualizado before update on public.checkouts
  for each row execute function public.revalida_toca_atualizado();

alter table public.checkouts enable row level security;
-- sem policies: o cliente não enxerga checkouts; só o service role.

-- Registra o pedido no momento em que a página de venda pede o link de pagamento.
-- Congela dias e preço: se o dono mudar o preço depois, quem já abriu o checkout
-- paga o que viu.
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

-- Anota o vínculo com o provedor e o estado do pedido (aguardando, pago,
-- reembolsado, expirado…). Idempotente: pode chegar mais de uma vez.
create or replace function public.anotar_checkout(
  p_order_id text,
  p_payment_id text,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update public.checkouts
     set payment_id = coalesce(nullif(btrim(coalesce(p_payment_id, '')), ''), payment_id),
         status = left(btrim(coalesce(p_status, status)), 40)
   where order_id = btrim(coalesce(p_order_id, ''));
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

create or replace function public.consultar_checkout(p_order_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(c) from public.checkouts as c
   where c.order_id = btrim(coalesce(p_order_id, ''));
$$;

-- ---------------------------------------------------------------------------
-- RPC — administração de planos (o dono controla a escada pelo painel)
-- ---------------------------------------------------------------------------

create or replace function public.listar_planos_admin()
returns setof public.planos
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.revalida_e_admin() then
    raise exception 'apenas administradores' using errcode = '42501';
  end if;
  return query select * from public.planos order by dias;
end;
$$;

create or replace function public.salvar_plano(
  p_id text,
  p_nome text,
  p_descricao text default null,
  p_dias integer default null,
  p_preco_centavos integer default null,
  p_ativo boolean default true,
  p_moeda text default 'BRL'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := lower(btrim(coalesce(p_id, '')));
  v_plano public.planos;
begin
  if not public.revalida_e_admin() then
    raise exception 'apenas administradores' using errcode = '42501';
  end if;
  if v_id !~ '^[a-z0-9_-]{2,40}$' then
    raise exception 'identificador invalido (minusculas, numeros, hifen; 2 a 40)' using errcode = '22023';
  end if;
  if p_nome is null or btrim(p_nome) = '' or char_length(btrim(p_nome)) > 80 then
    raise exception 'nome invalido' using errcode = '22023';
  end if;
  if p_dias is null or p_dias < 1 or p_dias > 3650 then
    raise exception 'dias fora do intervalo permitido' using errcode = '22023';
  end if;
  if p_preco_centavos is null or p_preco_centavos < 0 then
    raise exception 'preco invalido' using errcode = '22023';
  end if;
  if upper(coalesce(p_moeda, 'BRL')) !~ '^[A-Z]{3}$' then
    raise exception 'moeda invalida' using errcode = '22023';
  end if;

  insert into public.planos (id, nome, descricao, dias, preco_centavos, moeda, ativo)
  values (v_id, btrim(p_nome), nullif(left(btrim(coalesce(p_descricao, '')), 200), ''),
          p_dias, p_preco_centavos, upper(coalesce(p_moeda, 'BRL')), coalesce(p_ativo, true))
  on conflict (id) do update
    set nome = excluded.nome,
        descricao = excluded.descricao,
        dias = excluded.dias,
        preco_centavos = excluded.preco_centavos,
        moeda = excluded.moeda,
        ativo = excluded.ativo
  returning * into v_plano;

  perform public.revalida_audita(
    'plano.salvo', null,
    jsonb_build_object('plano', v_plano.id, 'dias', v_plano.dias,
                       'preco_centavos', v_plano.preco_centavos, 'ativo', v_plano.ativo)
  );

  return to_jsonb(v_plano);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões — o mesmo desenho da migração original
-- ---------------------------------------------------------------------------

revoke all on public.checkouts from anon, authenticated;

revoke all on function public.registrar_checkout(text, text, text) from public, anon, authenticated;
revoke all on function public.anotar_checkout(text, text, text) from public, anon, authenticated;
revoke all on function public.consultar_checkout(text) from public, anon, authenticated;
grant execute on function public.registrar_checkout(text, text, text) to service_role;
grant execute on function public.anotar_checkout(text, text, text) to service_role;
grant execute on function public.consultar_checkout(text) to service_role;

revoke all on function public.listar_planos_admin() from public, anon;
revoke all on function public.salvar_plano(text, text, text, integer, integer, boolean, text) from public, anon;
grant execute on function public.listar_planos_admin() to authenticated;
grant execute on function public.salvar_plano(text, text, text, integer, integer, boolean, text) to authenticated;

commit;
