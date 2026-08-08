# Runbook de activación — de aquí a la primera venta

> **Documento histórico.** Para la release móvil v1 use como checklist autoritativo
> `produto/RUNBOOK_PUBLICACAO_V1.md`. Este plan conserva contexto de decisiones anteriores, pero
> contiene estados de despliegue y toolchains que no deben asumirse vigentes.

> Para Diego. Cada paso dice qué hacer, dónde, y cómo saber que quedó bien.
> Los pasos marcados **(solo tú)** necesitan tu identidad, tu tarjeta o tu firma:
> no se pueden automatizar.
>
> Orden pensado para que puedas parar en cualquier punto sin dejar nada a medias.

---

## 0. Llave de licencia — **HECHO (2026-08-06)**

La llave de desarrollo (cuya parte privada quedó impresa en un registro de trabajo) fue
**regenerada, cargada como secreto del servidor y embebida en las apps reconstruidas**.
No tienes que hacer nada aquí.

> Si algún día necesitas rotarla de nuevo (p. ej. ante una sospecha de filtración):
> `cd ~/evidentia-revalida && python3 scripts/gerar_chaves_licenca.py --forcar`, luego
> `supabase secrets set REVALIDA_CHAVE_PRIVADA=...` y reconstruir las apps (paso 6).
> Rotarla invalida TODAS las licencias entregadas: los usuarios reactivan al conectarse.

---

## 1. Proyecto de Supabase — **HECHO, salvo nombrarte administrador**

El proyecto **`evidentia-revalida`** existe (ref `flnawwzkmttsxuozjwar`, región São Paulo),
el esquema completo está aplicado (incluidas la escalera de planos 57/147/247 y la tabla
`checkouts`), la configuración del cliente está en `client_config.local.json`, y las apps ya
se reconstruyeron apuntando a él.

**Cómo comprobarlo tú mismo**: en <https://supabase.com/dashboard/project/flnawwzkmttsxuozjwar>,
*Table Editor* muestra `perfis`, `admins`, `planos`, `assinaturas`, `licencas`,
`eventos_pagamento`, `checkouts` y `auditoria`; en `planos`, el mensal está a R$ 57, el
trimestral a R$ 147 y el semestral a R$ 247.

### Convertirte en administrador **(solo tú)**

Crea tu cuenta primero desde la propia aplicación (botón «Criar conta»), confirma el correo,
y luego, en el *SQL Editor* de Supabase:

```sql
insert into public.admins (user_id, nota)
select id, 'dono do produto' from auth.users where email = 'TU-CORREO@ejemplo.com';
```

**Cómo saber que quedó bien**: en el panel (paso 5) entras y ves el resumen. Si te dice
«Essa conta não é administradora», el `insert` no encontró tu correo.

---

## 2. Secretos y funciones del servidor — **HECHO, salvo las credenciales de dLocal Go**

Ya están configurados `REVALIDA_CHAVE_PRIVADA` y `REVALIDA_DIAS_LICENCA=30`, y desplegadas
las **tres** funciones: `emitir-licenca`, `webhook-pagamento` y `criar-checkout`. Mientras
no existan las credenciales de dLocal Go, la página de venta muestra «as vendas abrem em
breve» — nada se rompe.

Cuando termines el paso 3, en esta sección técnica faltará cargar:

```bash
cd ~/evidentia-revalida/nuvem
supabase secrets set DLOCALGO_API_KEY='<de tu panel de dLocal Go>' \
  DLOCALGO_SECRET_KEY='<idem>' --project-ref flnawwzkmttsxuozjwar
```

> Para probar primero en el **sandbox** de dLocal Go añade también
> `DLOCALGO_API_HOST='https://api-sbx.dlocalgo.com'` con las llaves de sandbox, y quítalo
> al pasar a producción.

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` las inyecta Supabase sola:
no las configures a mano.

**Cómo saber que quedó bien**: `supabase functions list --project-ref flnawwzkmttsxuozjwar`
muestra las tres como activas, y el botón «Comprar» de la página de venta te lleva a un
checkout real en vez del aviso.

---

## 3. Cobro con dLocal Go **(solo tú)**

dLocal Go es la elección de lanzamiento (investigación y verificación adversarial del
2026-08-06, en `PLANO_PRODUTO.md` §6): acepta persona física colombiana, tu comprador paga
**en reales como transacción doméstica** — PIX ~1,17 % o tarjeta local ~3,53 %, sin IOF — y
tú retiras **en COP directo a tu banco**, gratis sobre US$ 10. Hotmart quedó descartado por
decisión tuya. Plan B si el onboarding te rechaza: Paddle (el código no cambia; me pides el
adaptador y lo escribo).

1. **Regístrate** en <https://dlocalgo.com> como **Emprendedor Individual (Persona Física)**,
   país Colombia. Para el KYC completo necesitarás: cédula, comprobante de domicilio con
   menos de 6 meses, y certificación bancaria en PDF de una cuenta a tu nombre. Hasta
   completar el KYC hay tope de US$ 3.000 procesados y no puedes retirar.
2. **Antes de publicar precios, pregunta por escrito a su soporte** (respuestas que cambian
   decisiones): (a) condiciones reales de la reserva de garantía — ¿5 o 10 %, y cuándo se
   libera?; (b) si la categoría «aplicación descargable de estudio, con licencias» pasa
   compliance sin objeción; (c) qué descriptor verá el comprador en el extracto y si
   «DL\*EVIDENTIA» es posible; (d) — para la fase 2 — si las ejecuciones de assinatura
   disparan la notificación a `notification_url` o hay que hacer polling.
3. En el panel de dLocal Go, copia el **API Key** y el **Secret Key** y cárgalos como
   secretos (paso 2). No hay nada más que configurar: el checkout lo crea tu servidor
   (`criar-checkout`) con el precio de tu tabla `planos`, y la URL de notificación viaja en
   cada pago que creamos — no hace falta registrarla a mano.
4. **Prueba primero en sandbox** (llaves de sandbox + `DLOCALGO_API_HOST` de sandbox,
   paso 2): compra un pase mensal con el PIX de prueba, mira que en el panel (paso 5)
   apareces como «pagante», pide un reembolso de prueba y confirma que el acceso cae.
   El ciclo entero: pago → notificación → GET payment PAID → licencia emitida; reembolso →
   notificación → licencia revocada.

**Cómo probarlo de verdad en producción**: una primera venta real pequeña — idealmente un
pase mensal pagado por un conocido con tarjeta brasileña. Verifica tres cosas: que NO
aparece IOF ni cargo internacional en su extracto (antes de usar «sem IOF» como argumento
de venta), que el reembolso real corta el acceso, y el spread BRL→COP de tu primer retiro
contra la tasa del día.

> Sin renovación automática, la persona consulta la fecha final en su cuenta. No anuncies
> recordatorios por correo hasta que exista un envío transaccional probado, con reintentos y
> seguimiento de entrega.
>
> Cuando la facturación anual pase de unos R$ 100.000, revisa la ruta Stripe con una LLC
> estadounidense: la comisión baja a ~1,9 %. El webhook ya entiende Stripe; solo hay que
> apuntar el otro sufijo (`/stripe`) y poner `STRIPE_WEBHOOK_SECRET`.

---

## 4. La página de venta — **HECHA; falta publicarla**

Ya existe en `app-web/assinar/` y quedó integrada al embudo: la edición libre muestra
«Conhecer os planos», la pantalla de activación de la edición completa enlaza «Veja os
planos e preços», y la página lee los planos **en vivo** de tu tabla `planos` — cambias un
precio en el panel y la página lo muestra sin republicar nada. El texto usa el baseline vigente:
600 preguntas, seis ediciones, 600 justificaciones, 526 con referencias y 74 sin referencia
catalogada. Se retiraron comparaciones de competidores que caducan y promesas de correo no implementadas.

Para publicarla: haz merge de la rama `produto-assinatura` a `main` — el workflow de Pages
publica `app-web/` entero, incluida `/assinar/`. Publícala **después** de tener las
credenciales de dLocal Go (paso 3); mientras tanto mostraría «as vendas abrem em breve»,
que también es aceptable si quieres capturar interés temprano.

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
- **Editar los planos de venta** (tarjeta «Planos de venda»): crear un plan, cambiar precio,
  días o descripción, y activarlo o esconderlo. La página de venta y el checkout obedecen al
  instante; quien ya pagó conserva el plazo que compró.
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

> **No presupongas que el producto premium está fuera del repositorio.** Antes de cada release,
> audita `git ls-files aplicativo dados app-android/ios`; `.gitignore` no retira artefactos ya
> versionados. El portón
> de licencia corre en el aparato y es una barrera de honestidad, no una caja fuerte —
> quien tiene el archivo tiene las 600 preguntas. Los comandos de arriba los regeneran en
> tu disco cuando los necesites; lo que se versiona es lo que los construye.

### Android

El SDK y el JDK 17 ya quedaron instalados en este Mac. Para recompilar:

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17
export ANDROID_HOME=$HOME/Library/Android/sdk
cd ~/evidentia-revalida/app-android && npx cap sync android && cd android && ./gradlew assembleDebug
```

El APK sale en `android/app/build/outputs/apk/debug/app-debug.apk`.

### Firma **(solo tú)**

Hoy los instaladores salen **sin firmar**: macOS y Windows mostrarán una advertencia al
abrirlos. Para venderlos sin fricción necesitas:

- **macOS**: cuenta Apple Developer (US$ 99/año) → certificado *Developer ID Application* →
  reconstruir con `ATLAS_SIGN_IDENTITY` y notarizar.
- **Windows**: certificado de firma de código (unos US$ 200-400/año).

Puedes vender sin firmar al principio, explicando en la página de descarga cómo abrir la
aplicación la primera vez. Es incómodo, no imposible.

Para Google Play hace falta cuenta de desarrollador (US$ 25, pago único) y una llave de
firma de producción.

### iPhone

Existe un proyecto nativo Capacitor. La preparación, metadatos, cuenta de revisión, privacidad
y build están en `produto/RUNBOOK_APP_STORE.md`; la PWA sigue siendo un canal separado.

> **Importante**: no vendas dentro de la aplicación móvil. Apple y Google exigen su
> facturación (30 %, o 15 % con el programa de pequeñas empresas) para desbloquear contenido
> dentro de la app. El usuario compra en la web y activa la aplicación con su cuenta.

---

## 7. Lo legal, antes de cobrar **(solo tú)**

La investigación formuló las hipótesis — está en `produto/PLANO_PRODUTO.md`, sección 4 —,
pero no sustituye dictamen. La venta queda bloqueada hasta cerrarlo:

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
2. **Repite una búsqueda de anterioridades y evalúa registrar «EVIDENTIA» en el INPI, clase NCL
   41.** No trates una búsqueda fechada como garantía de disponibilidad.
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
- [ ] En el panel, la tarjeta «Planos de venda» muestra 57/147/247 y editar un precio se
      refleja en la página de venta al recargarla.
- [ ] En el **sandbox** de dLocal Go: compro un pase con el PIX de prueba, aparezco como
      «pagante» en el panel, pido reembolso de prueba y pierdo el acceso.
- [ ] En producción: una compra real pequeña con tarjeta brasileña — sin IOF en el extracto,
      reembolso real corta el acceso, y el retiro a COP llega con spread aceptable.
- [ ] La edición libre abre sin pedir cuenta, muestra 40 preguntas con justificación y estado de referencia explícito, y el botón
      «Conhecer os planos» lleva a `/assinar/`.
- [ ] La página de planes enlaza términos, reembolso, privacidad y soporte; no promete correos inexistentes.
- [ ] `python3 scripts/22_validar_metricas_produto.py` termina sin divergencias (600/6/526).
- [ ] `python3 scripts/12_validar_justificativas.py` termina sin errores.
- [ ] `python3 scripts/10_conferir_textos_oficiais.py --fontes /tmp/evidentia-fontes --baixar-fontes`
      termina con cobertura 600/600 y cero divergencias.
- [ ] `python3 scripts/23_validar_claims_comerciais.py` termina sin claims prohibidos.
- [ ] `nuvem/supabase/tests/rodar_testes.sh` termina con «TODAS AS PROVAS PASSARAM».
