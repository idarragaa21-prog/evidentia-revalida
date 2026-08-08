#!/usr/bin/env bash
# Aplica as migracoes e roda as provas num PostgreSQL descartavel, sem Docker e sem nuvem.
# Uso: nuvem/supabase/tests/rodar_testes.sh
set -euo pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NUVEM="$(dirname "$AQUI")"
PORTA="${PGPORTA_TESTE:-55432}"

# O socket unix do PostgreSQL tem limite de 103 bytes no caminho; por isso um diretorio curto.
SOCK=/tmp/pgrev-$$
DADOS="$(mktemp -d /tmp/pgdata-rev.XXXXXX)"

for base in /opt/homebrew/opt/postgresql@16/bin /opt/homebrew/opt/postgresql@17/bin /usr/local/opt/postgresql@16/bin; do
  [ -x "$base/initdb" ] && export PATH="$base:$PATH" && break
done
command -v initdb >/dev/null || { echo "initdb nao encontrado: brew install postgresql@16"; exit 2; }

export LANG=C LC_ALL=C
limpar() {
  pg_ctl -D "$DADOS" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$DADOS" "$SOCK"
}
trap limpar EXIT

mkdir -p "$SOCK"
initdb -D "$DADOS" -U postgres --auth=trust --locale=C >/dev/null
pg_ctl -D "$DADOS" -o "-p $PORTA -k $SOCK" -l "$DADOS/pg.log" start >/dev/null
sleep 1
createdb -h 127.0.0.1 -p "$PORTA" -U postgres revalida

psql() { command psql -h 127.0.0.1 -p "$PORTA" -U postgres -d revalida -v ON_ERROR_STOP=1 -q "$@"; }

# Stub do que o Supabase oferece de fabrica: schema auth, tabela de usuarios, auth.uid() e os papeis.
psql <<'SQL' >/dev/null
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
SQL

for m in "$NUVEM"/migrations/*.sql; do
  echo "migracao: $(basename "$m")"
  psql -f "$m" >/dev/null
done

# As migracoes novas declaram-se idempotentes: reaplica-las no mesmo banco prova
# que retry de deploy nao cria trigger, constraint ou grant duplicado.
for m in "$NUVEM"/migrations/20260808*.sql; do
  echo "idempotencia: $(basename "$m")"
  psql -f "$m" >/dev/null
done

echo "--- provas ---"
psql -f "$AQUI/test_assinaturas.sql" 2>&1 | sed 's/^NOTICE:  //'
psql -f "$AQUI/test_privacidade_compras.sql" 2>&1 | sed 's/^NOTICE:  //'
echo "--- fim ---"
