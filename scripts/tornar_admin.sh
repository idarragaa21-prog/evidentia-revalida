#!/usr/bin/env bash
# Nombra administrador a una cuenta YA CREADA en el aplicativo.
#
# Uso: scripts/tornar_admin.sh tu-correo@ejemplo.com
#
# Requisitos: haber creado la cuenta desde el aplicativo («Criar conta») y haber
# confirmado el correo. Este script solo marca esa cuenta como administradora;
# no crea cuentas ni toca contraseñas.
set -euo pipefail

EMAIL="${1:-}"
if [ -z "$EMAIL" ]; then
  echo "uso: $0 correo-de-la-cuenta"
  exit 2
fi

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SENHA="$(cat "$RAIZ/nuvem/chaves/supabase_db_password.txt")"
REF="flnawwzkmttsxuozjwar"

# El pooler de sesion de Supabase (puerto 5432) acepta conexiones directas con la
# contraseña de la base. La region es sa-east-1 (São Paulo).
export PGPASSWORD="$SENHA"
psql "host=aws-0-sa-east-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.$REF sslmode=require" \
  -v ON_ERROR_STOP=1 -q <<SQL
insert into public.admins (user_id, nota)
select id, 'dono do produto'
  from auth.users
 where lower(email) = lower('$EMAIL')
on conflict (user_id) do nothing;

select case
  when exists (select 1 from public.admins a join auth.users u on u.id = a.user_id
                where lower(u.email) = lower('$EMAIL'))
  then 'OK: $EMAIL es administrador. Abre nuvem/painel/index.html y entra.'
  else 'NO ENCONTRADO: no existe cuenta con ese correo. Crea la cuenta en el aplicativo primero (Criar conta) y confirma el correo.'
end;
SQL
