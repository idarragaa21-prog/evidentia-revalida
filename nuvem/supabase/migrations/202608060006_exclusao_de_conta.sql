-- Evidentia · Revalida — registro de exclusao de conta.
--
-- A App Store exige (diretriz 5.1.1(v)) que quem cria conta possa apaga-la de
-- dentro do aplicativo. A exclusao em si e feita pela edge function
-- excluir-conta, com a service role; aqui fica so o rastro.
--
-- O rastro nao guarda o e-mail inteiro: guarda o seu resumo. Serve para
-- responder «esta conta foi apagada em tal data» sem manter o dado pessoal de
-- quem justamente pediu para sumir — que e o ponto da LGPD.

begin;

create table if not exists public.exclusoes (
  id bigserial primary key,
  email_hash text not null,
  excluido_em timestamptz not null default now()
);

comment on table public.exclusoes is
  'Rastro de contas apagadas a pedido do titular. So o resumo do e-mail, nunca o e-mail.';

alter table public.exclusoes enable row level security;
-- Sem policy: so o service role e o dono (pelas RPC de admin) enxergam.

create or replace function public.registrar_exclusao(p_user_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- sha256() nativo do PostgreSQL, e nao digest() do pgcrypto: com
  -- `search_path = ''` uma funcao de extensao nao seria encontrada e a exclusao
  -- falharia justamente na hora de registrar que aconteceu.
  insert into public.exclusoes (email_hash)
  values (encode(sha256(convert_to(lower(btrim(coalesce(p_email, ''))), 'UTF8')), 'hex'));

  insert into public.auditoria (ator_id, acao, alvo_user_id, detalhes)
  values (null, 'conta.excluida', null,
          jsonb_build_object('user_id', p_user_id, 'origem', 'pedido do titular'));
exception when others then
  -- A auditoria nunca pode impedir alguem de sair da sua propria conta.
  null;
end;
$$;

revoke all on public.exclusoes from anon, authenticated;
revoke all on function public.registrar_exclusao(uuid, text) from public, anon, authenticated;
grant execute on function public.registrar_exclusao(uuid, text) to service_role;

commit;
