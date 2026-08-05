# Runbook de activación — de aquí a la primera venta

> Para Diego. Cada paso dice qué hacer, dónde, y cómo saber que quedó bien.
> Los pasos marcados **(solo tú)** necesitan tu identidad, tu tarjeta o tu firma:
> no se pueden automatizar.
>
> Orden pensado para que puedas parar en cualquier punto sin dejar nada a medias.

---

## 0. Antes de nada: regenera la llave de licencia

La llave que hay en `nuvem/chaves/` se generó durante el desarrollo y **su parte privada
quedó impresa en un registro de trabajo**. Sirve para probar, no para vender.

```bash
cd ~/evidentia-revalida && python3 scripts/gerar_chaves_licenca.py --forcar
```

El script imprime dos cosas: el comando `supabase secrets set …` (paso 2) y la llave pública.
Pega la llave pública en `nuvem/chaves/licenca_publica.txt` — el script ya lo hace — y
reconstruye la aplicación al final (paso 6).

**Cómo saber que quedó bien**: `ls -la nuvem/chaves/` muestra `licenca_privada.pem` con
permisos `-rw-------`, y `git status` no la lista (está en `.gitignore`).

---

## 1. Proyecto de Supabase **(solo tú)**

1. Entra a <https://supabase.com/dashboard> y crea un proyecto **nuevo**.
   No reutilices el de Atlas: son productos distintos y mezclarlos rompe tu propio runbook.
   Región sugerida: `South America (São Paulo)` — tus usuarios están en Brasil.
2. Guarda la contraseña de la base de datos donde guardas las demás.
3. En *Project Settings → API* copia:
   - **Project URL** → `https://xxxx.supabase.co`
   - **anon / publishable key** → `sb_publishable_…`
4. Escribe esos dos valores en `nuvem/supabase/client_config.local.json`
   (cópialo de `client_config.example.json`). Ese archivo **no se versiona**.

> La `service_role key` no se copia a ningún archivo del repositorio ni de la aplicación.
> Solo vive como secreto del servidor, en el paso 2.

### Aplicar el esquema

```bash
cd ~/evidentia-revalida/nuvem/supabase
supabase link --project-ref <la-referencia-de-tu-proyecto>
supabase db push
```

**Cómo saber que quedó bien**: en el panel de Supabase, *Table Editor* muestra las tablas
`perfis`, `admins`, `planos`, `assinaturas`, `licencas`, `eventos_pagamento` y `auditoria`.
En `planos` ya hay tres filas.

### Convertirte en administrador

Crea tu cuenta primero desde la propia aplicación (botón «Criar conta»), confirma el correo,
y luego, en el *SQL Editor* de Supabase:

```sql
insert into public.admins (user_id, nota)
select id, 'dono do produto' from auth.users where email = 'TU-CORREO@ejemplo.com';
```

**Cómo saber que quedó bien**: en el panel (paso 5) entras y ves el resumen. Si te dice
«Essa conta não é administradora», el `insert` no encontró tu correo.

---

## 2. Secretos y funciones del servidor

```bash
cd ~/evidentia-revalida/nuvem/supabase
supabase secrets set REVALIDA_CHAVE_PRIVADA='<lo que imprimió el paso 0>'
supabase secrets set REVALIDA_DIAS_LICENCA=30
supabase secrets set HOTMART_HOTTOK='<paso 3>'
supabase functions deploy emitir-licenca
supabase functions deploy webhook-pagamento
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` las inyecta Supabase sola:
no las configures a mano.

**Cómo saber que quedó bien**: `supabase functions list` muestra las dos como `ACTIVE`.

---

## 3. Cobro con Hotmart **(solo tú)**

Hotmart es la elección de lanzamiento porque acepta productores colombianos, ofrece PIX,
boleto y cuotas, y actúa como *merchant of record* — resuelve los impuestos por ti. La
comisión es 9,9 % + R$ 1,00 por venta.

1. Crea tu cuenta de productor en <https://app.hotmart.com>.
2. **Pregunta primero, antes de publicar precios**: escribe al soporte de Hotmart y
   confirma si, con la cuenta registrada en Colombia, puedes vender un producto con precio
   **en reales** y recibir PIX de compradores brasileños. La documentación dice que al
   registrar la cuenta fuera de Brasil «suas novas vendas e comissões passarão a ser geradas
   em Dólares (USD) ou Euros (EUR)», y no queda claro si eso solo cambia la moneda en que te
   liquidan o si también pierdes el precio en reales. **Esta respuesta cambia el precio de
   tu producto**, así que va antes que todo lo demás.
3. Crea el producto (tipo: suscripción) con dos planes:
   - **Mensal** — R$ 39,00
   - **Anual** — R$ 247,00
   Garantía: 7 días (es el estándar del mercado y elimina la objeción principal).
4. En *Ferramentas → Webhook (Postback)*:
   - URL: `https://<tu-proyecto>.supabase.co/functions/v1/webhook-pagamento/hotmart`
   - Versión: la más reciente
   - Eventos: `PURCHASE_APPROVED`, `PURCHASE_COMPLETE`, `PURCHASE_REFUNDED`,
     `PURCHASE_CHARGEBACK`, `PURCHASE_PROTEST`, `SUBSCRIPTION_CANCELLATION`,
     `SUBSCRIPTION_REACTIVATION`
   - Copia el **hottok** que te da Hotmart y ponlo en `HOTMART_HOTTOK` (paso 2).

**Cómo probarlo de verdad**: compra tu propio producto con un cupón del 100 %, o pide a un
conocido que compre y luego pide reembolso dentro de los 7 días. Después mira en el panel
(paso 5) que la persona aparece como «pagante», y tras el reembolso, sin acceso.

> Cuando la facturación anual pase de unos R$ 100.000, revisa la ruta Stripe con una LLC
> estadounidense: la comisión baja de 9,9 % a ~1,9 %. El webhook ya entiende Stripe; solo
> hay que apuntar el otro sufijo (`/stripe`) y poner `STRIPE_WEBHOOK_SECRET`.

---

## 4. La página de venta

La aplicación gratuita ya vive en GitHub Pages. Conviértela en el embudo:

1. La edición libre (`aplicativo/Revalida_Evidentia_livre.html`) es lo que se publica.
   Tiene 40 preguntas con las mismas justificaciones referenciadas: no es una demo mutilada.
2. Desde ella, el botón de compra lleva a tu página de Hotmart.
3. En la página de venta, di el número real: **400 preguntas oficiales**, no «miles». Tu
   argumento es que cada una está conferida contra el cuaderno del INEP y justificada con la
   fuente citada. Es lo único que ningún competidor ofrece.

---

## 5. Panel de administración

Abre `nuvem/painel/index.html` en tu navegador (doble clic basta; no necesita servidor).
La primera vez pega la URL y la llave publicable de tu proyecto: quedan guardadas en ese
navegador.

Desde ahí puedes:

- **Conceder acceso gratis** a quien quieras, por los días que quieras. La persona tiene que
  haber creado su cuenta antes en la aplicación (es gratis).
- **Revocar** un acceso. Ojo: la persona lo pierde cuando venza la licencia que ya tiene en
  su aparato, como máximo 30 días después. Es el precio de que la aplicación funcione sin
  internet.
- Ver cuántas cuentas hay, cuántas pagan, cuántas son cortesía y cuántas vencen en 30 días.

Una cortesía tuya **sobrevive** a un reembolso del proveedor: si tú se lo diste, solo tú se
lo quitas.

---

## 6. Construir y distribuir las aplicaciones

```bash
cd ~/evidentia-revalida
python3 scripts/08_montar_aplicativo.py     # genera completo y livre
python3 scripts/09_montar_pwa.py            # actualiza app-web/ (edición libre)
cd app-desktop && npm install && npm run empacotar:mac
```

Los instaladores quedan en `app-desktop/dist/`.

### Firma **(solo tú)**

Hoy los instaladores salen **sin firmar**: macOS y Windows mostrarán una advertencia al
abrirlos. Para venderlos sin fricción necesitas:

- **macOS**: cuenta Apple Developer (US$ 99/año) → certificado *Developer ID Application* →
  reconstruir con `ATLAS_SIGN_IDENTITY` y notarizar.
- **Windows**: certificado de firma de código (unos US$ 200-400/año).

Puedes vender sin firmar al principio, explicando en la página de descarga cómo abrir la
aplicación la primera vez. Es incómodo, no imposible.

### Android

Falta el SDK. En este Mac:

```bash
brew install --cask android-commandlinetools temurin@17
sdkmanager "platforms;android-34" "build-tools;34.0.0" "platform-tools"
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
cd ~/evidentia-revalida/app-android && npm install && npx cap sync android
./gradlew assembleDebug
```

Ojo con Java: el JDK 24 que tienes instalado **no funciona** con el Gradle de este proyecto
(soporta hasta Java 20). Por eso el `temurin@17`.

Para Google Play hace falta cuenta de desarrollador (US$ 25, pago único) y una llave de
firma de producción.

### iPhone

Hoy el canal es la PWA: se instala desde Safari con *Compartir → Añadir a pantalla de inicio*
y funciona sin conexión. Una aplicación nativa exigiría `npx cap add ios` y cuenta Apple
Developer.

> **Importante**: no vendas dentro de la aplicación móvil. Apple y Google exigen su
> facturación (30 %, o 15 % con el programa de pequeñas empresas) para desbloquear contenido
> dentro de la app. El usuario compra en la web y activa la aplicación con su cuenta.

---

## 7. Lo legal, antes de cobrar **(solo tú)**

La investigación ya hizo el trabajo pesado y el resultado es favorable — está en
`produto/PLANO_PRODUTO.md`, sección 4. Falta cerrarlo:

1. **Consulta a un abogado brasileño de propiedad intelectual.** Llévale estas cuatro
   preguntas cerradas y el dossier de fuentes primarias del plan:
   - ¿La prova objetiva de una autarquía federal ya publicada encaja en el art. 8º de la
     Lei 9.610/1998, y en qué inciso?
   - ¿El aviso CC BY-ND 3.0 del pie de `gov.br/inep` y de `download.inep.gov.br` constituye
     licencia oponible sobre los PDF de las pruebas?
   - ¿Una justificación que acompaña un enunciado íntegro e inalterado es «obra derivada»
     prohibida por la cláusula SemDerivações, u obra nueva independiente?
   - ¿Qué tratamiento tipográfico de la palabra «Revalida» minimiza el riesgo frente a las
     ~40 marcas compuestas vivas en la clase 41?
2. **Registra «EVIDENTIA» en el INPI, clase NCL 41.** La búsqueda muestra la clase libre hoy:
   no hay ni un solo proceso con «Evidentia» en servicios educativos. Registra el elemento
   distintivo solo, nunca el compuesto con «Revalida».
3. **Reescribe la cláusula de retirada** de `AVISO_DE_CONTEUDO.md`. Hoy promete retirar el
   material «sem discussão prévia» ante cualquier reclamo. En un producto de suscripción eso
   deja a tus clientes sin producto de un día para otro. Mantén el canal de contacto y la
   disposición a atender reclamos, sin comprometer una retirada automática.
4. Descarga el **edital de la 1ª etapa** directamente del servidor del INEP y confirma que
   tampoco reivindica propiedad intelectual sobre las preguntas.

---

## 8. Licencia y repositorio **(solo tú)**

Hoy el repositorio es público con licencia MIT, que permite a cualquiera revender tu
producto. Antes de cobrar, decide:

- **Opción recomendada**: el repositorio pasa a privado; las herramientas de extracción y
  conferencia (`scripts/01`–`11`) se publican aparte con MIT — son tu credencial de método —
  y la aplicación, las justificaciones, el backend y las apps quedan bajo licencia
  propietaria.
- Lo ya publicado bajo MIT no se puede retirar retroactivamente. No importa: el valor está
  en las justificaciones referenciadas y en las actualizaciones de cada edición nueva.

```bash
gh repo edit idarragaa21-prog/evidentia-revalida --visibility private
```

No lo he ejecutado: es una decisión tuya y visible hacia afuera.

---

## Comprobación final antes de la primera venta

- [ ] Creo una cuenta nueva desde la aplicación y **no** tengo acceso.
- [ ] Me concedo acceso desde el panel y la aplicación se desbloquea.
- [ ] Apago el wifi y la aplicación sigue funcionando.
- [ ] Me revoco desde el panel y, tras vencer la licencia, pierdo el acceso.
- [ ] Compro con un cupón del 100 % y aparezco como «pagante» en el panel.
- [ ] Pido reembolso y pierdo el acceso.
- [ ] La edición libre abre sin pedir cuenta y muestra 40 preguntas con referencias.
- [ ] `python3 scripts/12_validar_justificativas.py` termina sin errores.
- [ ] `nuvem/supabase/tests/rodar_testes.sh` termina con «TODAS AS PROVAS PASSARAM».
