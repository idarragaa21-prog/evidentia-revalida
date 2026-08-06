# Evidentia · Revalida — plan del producto de suscripción

> Documento maestro. Escrito el 2026-08-05 sobre el código real y sobre investigación
> primaria verificada, no sobre supuestos. Marca cada afirmación con su sello:
> **[Verificado]** lo abrí y lo leí · **[Estimado]** inferencia mía sobre datos reales ·
> **[Hipótesis]** decisión que hay que falsar con clientes.
>
> Sigue la disciplina del plan de negocios de Atlas: precio con ancla explícita, criterio
> de falsación por delante, y honestidad sobre lo que todavía no está resuelto.

---

## 1. Qué se vende y por qué alguien pagaría

El producto es un **banco de las 500 preguntas objetivas del Revalida (INEP) de 2023/1 a
2024/2**, con simulados, corrección detallada y — esto es lo nuevo — **una justificación por
pregunta anclada en literatura verificable**, en una aplicación que funciona sin internet y
se instala de verdad en el computador y en el celular.

### El diferenciador no es el tamaño, es la confianza

**[Verificado]** Los competidores directos venden volumen: MedTask anuncia «+90 mil questões»,
Estratégia MED «+290 mil questões cadastradas», Eu Médico Revalida «+60.000 questões». Evidentia
tiene 400. Competir por volumen es perder.

Lo que Evidentia tiene y ninguno de ellos ofrece:

1. **Texto conferido palabra por palabra contra el cuaderno oficial del INEP.** El script
   `scripts/10_conferir_textos_oficiais.py` compara enunciado y alternativas campo a campo con
   el PDF oficial y hoy termina sin ninguna divergencia. Esa conferencia ya encontró y corrigió
   47 campos perdidos en la primera extracción (unidades que desaparecían, cifras comidas) y
   4 preguntas cuya figura faltaba. **[Verificado]** Ningún competidor documenta nada parecido.
2. **Justificación con fuente identificable.** Hoy las 400 explicaciones son buen razonamiento
   clínico pero tienen **cero DOIs, cero URLs, cero autores, cero años** — solo 11 mencionan
   genéricamente «Ministério da Saúde» o «diretrizes» sin decir cuál. **[Verificado]** Eso es
   exactamente lo que este plan corrige, y es el argumento de venta central.
3. **Funciona sin internet, de verdad.** Archivo único, sin servidor. Un candidato estudiando en
   el interior, en un plantón o en un avión no depende de señal.
4. **26 figuras originales** recortadas del cuaderno oficial, para que las preguntas que dependen
   de imagen se puedan responder enteras.

**La tesis**: el candidato del Revalida ya paga R$ 4.516 solo en tasas oficiales del examen
**[Verificado]**. No le falta contenido; le sobra. Lo que le falta es saber en qué puede confiar.
Evidentia vende *certeza verificable*, no cantidad.

---

## 2. El mercado, con números reales

**[Verificado]** Comparables directos (solo banco de preguntas, sin videoclases):

| Producto | Mensual | Anual | Nota |
|:--|--:|--:|:--|
| Revalida Resolve | R$ 147 | **R$ 497** | El ancla. Mismo concepto: solo preguntas oficiales del INEP comentadas. Cobra por Hotmart. |
| Meedik Learn | R$ 129,99 | R$ 959,88 | Trial de 7 días + garantía de 7 días. Declara 13.000 alumnos. |
| MedTask (Mundo Revalida) | R$ 249 | R$ 1.789 | «+90 mil questões», corrección por IA. |
| MedStudier (app iOS) | R$ 189,90 | R$ 1.909,90 | 4,9/5 con 447 valoraciones — precedente móvil monetizado. |

Cursos completos van de R$ 2.967 a R$ 8.767 (MedCof, Medway, Eu Médico) y hasta ~R$ 23.000
(Estratégia MED). Ese no es el segmento de Evidentia.

**[Sin fuente primaria — no usar en marketing]** La cifra de «17.121 inscritos en 2025.1 con
25,49 % de aprobación» circulaba en este plan sin fuente localizable. Una revisión posterior
encontró 17.776 inscritos confirmados en 2025/1 y no pudo localizar el origen del 25,49 %.
**No cites ninguno de los dos hasta abrir el dato en gov.br/inep**: en un producto cuyo
argumento es el rigor, un número mal citado en la página de venta destruye justo lo que vendes.

**[Verificado 2026-08-06]** Lo que sí está confirmado y manda sobre el calendario: **la primera
etapa del Revalida 2026/2 se aplica el 13 de septiembre de 2026**; las inscripciones fueron del
16 al 23 de junio, con tasa de R$ 410, y la prueba teórica usa las mismas preguntas del ENAMED
2026. Fuente: edital y noticias del INEP en gov.br. Dos ediciones al año.

**[Verificado]** El estándar del mercado es prueba o garantía de **7 días** (Medway da 10).

---

## 3. Precio

**[Decisión de Diego, 2026-08-06]** El **semestral cuesta R$ 247** y es el plan héroe. La
escalera entera se construyó hacia atrás desde ese número: el mensual anterior de R$ 39 la
invertía (39×6 = 234 < 247 — pagar mes a mes salía más barato que comprometerse 6 meses).

| Plan | Precio | Por mes | Descuento | Papel en la escalera |
|:--|--:|--:|--:|:--|
| **Mensal** (pase de 30 días) | **R$ 57** | R$ 57,00 | — | Puerta de entrada; fija el ancla interna |
| **Trimestral** (pase de 90 días) | **R$ 147** | R$ 49,00 | 14 % | Puente: cuesta exactamente lo que Revalida Resolve cobra por UN mes |
| **Semestral** (pase de 180 días) | **R$ 247** | R$ 41,17 | 28 % | **Héroe**: un ciclo completo de preparación hasta la prueba |

Familia terminada en 7, la convención del mercado digital brasileño. **Sin plan anual al
lanzamiento**: el Revalida tiene dos ediciones al año, el ciclo real de preparación es ≤ 6
meses, y un banco de 500 preguntas no sostiene honestamente una promesa de 12 meses.
Reevaluar el anual (R$ 397) cuando el banco pase de ~1.000 preguntas o cuando ≥ 20 % de los
semestrales renueven para un segundo ciclo — esos renovadores SON el mercado del anual.

**Venta como pases de pago único, sin renovación automática** (fase 1): habilita PIX —
dominante en Brasil —, elimina las disputas por renovaciones no deseadas, y el backend ya
corta el acceso al vencer la licencia firmada. La recompra se dispara con recordatorios por
correo (D-7 y D-1 del vencimiento). **La escalera vive en la tabla `planos` y Diego la edita
desde el panel** — cambiar un precio no requiere republicar nada.

Y una **capa gratuita permanente de 40 preguntas** (8 por área), con la justificación
referenciada completa. No es una demo mutilada: es el producto entero sobre un décimo del banco.

**Ancla explícita**: contra Revalida Resolve (R$ 147/mes o R$ 497/año), Meedik (R$ 129,99/mes)
y MedTask (R$ 249/mes). La razón para estar por debajo es honesta y se dice en la primera
pantalla: *Evidentia tiene menos preguntas — solo las 500 oficiales de las últimas cinco
ediciones — pero cada una está conferida contra el cuaderno del INEP y justificada con la
fuente citada.* Tres meses de Evidentia cuestan lo que el comparable directo cobra por un mes.

**Criterio de falsación (primeros 60 días con tráfico real)**: si el semestral es < 30 % de
las unidades vendidas, la escalera no empuja al plazo largo → subir el mensual a R$ 67 y medir
30 días más. Si > 50 % de los mensuales no recompra al mes 2 mientras el reembolso semestral
se mantiene < 5 %, el mensual funciona como prueba barata que fuga → eliminarlo y vender solo
pases de 3 y 6 meses. Si la conversión total es < 1 % con ≥ 500 visitas cualificadas y PIX
operativo, el problema es la propuesta o la página, no el precio.

**Garantía**: 7 días con devolución total, igual que el mercado. Es barato de honrar y elimina la
objeción principal de un producto nuevo sin reputación.

---

## 4. Situación legal — resuelta, con una consulta pendiente

Esta era la duda que bloqueaba todo. La investigación primaria la deja en buen sitio.

**[Verificado] El INEP publica bajo Creative Commons BY-ND 3.0.** El pie de la página oficial de
*Provas e Gabaritos* del Revalida y también el servidor que aloja los PDFs
(`download.inep.gov.br`) declaran: «Todo o conteúdo deste site está publicado sob a licença
Creative Commons Atribuição-SemDerivações 3.0 Não Adaptada». El deed de esa licencia permite
expresamente *«copy and redistribute the material in any medium or format **for any purpose, even
commercially**»*.

**[Verificado] Las preguntas de examen probablemente ni siquiera son obra protegida.** El TJ-SP
(3ª Câmara de Direito Privado, Apelação 1112376-68.2021.8.26.0100, 05/04/2024) decidió que las
preguntas de prueba «não são mais que um método de estudo ou avaliação», carecen de originalidad
y que un acervo de preguntas no constituye base de datos protegida — desestimando la demanda de
dos asociaciones contra un cursinho que reproducía sus preguntas.

**[Verificado] El PDF oficial no tiene ningún aviso de copyright.** Búsqueda exhaustiva del texto
completo del cuaderno 2024/2: no aparece «direitos reservados», «proibida a reprodução» ni
términos de uso. El único veto de reproducción en los editales es sobre las **filmaciones de la
2ª etapa**, no sobre las preguntas objetivas publicadas.

**[Verificado] El INEP no tiene ninguna marca viva** — ni «INEP», ni «Revalida», ni «ENEM», ni
«ENAMED». Y «REVALIDA» como palabra suelta no está registrada por nadie, mientras el INPI viene
denegando sistemáticamente los pedidos de «Revalida + término genérico» en clase 41.

### Las tres reglas de producto que salen de esto

1. **Las preguntas se reproducen verbatim, sin tocar una coma.** Todo el valor añadido
   (justificación, referencias, clasificación, estadísticas) vive en capas *visualmente
   separadas* del enunciado original. Así el producto es «obra oficial sin modificar + obra
   nueva propia», no «obra derivada» — que es lo único que la cláusula SemDerivações prohíbe.
   La arquitectura actual ya cumple esto: el banco es la fuente de la verdad y las justificaciones
   viven en `dados/justificativas/`. **No se fusionan nunca en el mismo campo.**
2. **Atribución visible por ítem, no solo en un pie legal.** Cada pregunta muestra:
   *«Fonte: Inep — Revalida <edición>, Prova Objetiva. Conteúdo sob licença CC BY-ND 3.0.»*
   Esto satisface a la vez la licencia CC, el art. 46 III de la Lei 9.610/1998 y el art. 2º III
   del Decreto 8.777/2016.
3. **Nunca sugerir vínculo oficial.** Sin logotipo del INEP ni del MEC, sin las palabras
   «oficial», «autorizado» o «parceria» aplicadas al producto, y con el aviso de no afiliación
   visible. El riesgo real no es el copyright: es la confusión institucional.

**Línea roja absoluta**: no construir nada sobre las filmaciones de la 2ª etapa. Es la única
prohibición expresa y literal de los editales, y alcanza incluso el uso propio sin ánimo de lucro.

### Lo que falta (barato y con ventana de oportunidad)

- **Consulta escrita a un abogado brasileño de propiedad intelectual**, con cuatro preguntas
  cerradas: (a) ¿la prova objetiva ya publicada encaja en el art. 8º de la Lei 9.610/1998 y en
  qué inciso? (b) ¿el aviso CC BY-ND del pie constituye licencia oponible sobre los PDFs?
  (c) ¿una justificación que acompaña un enunciado íntegro e inalterado es «obra derivada»
  prohibida por el ND, o obra nueva independiente? (d) ¿qué tratamiento tipográfico de la palabra
  «Revalida» minimiza el riesgo frente a las ~40 marcas compuestas vivas en clase 41?
- **[Verificado] Registrar «EVIDENTIA» en la clase NCL 41 del INPI.** La búsqueda muestra la clase
  **libre**: no hay ni un solo proceso con «Evidentia» en servicios educativos. Registrar el
  elemento distintivo solo (nunca el compuesto con «Revalida») es además la estrategia que el
  INPI viene premiando.
- Descargar el edital de la **1ª etapa** directamente del servidor del INEP y confirmar que
  tampoco reivindica propiedad intelectual sobre las preguntas.
- Confirmar el régimen de los ítems reutilizados del **Banco Nacional de Itens**, ahora que el
  Revalida 2026 comparte prueba con el ENAMED.

---

## 5. Licencia y distribución — el conflicto que hay que resolver

**[Verificado] El problema.** Hoy el repositorio es **público con licencia MIT** y la aplicación
está **publicada gratis** en GitHub Pages. La MIT permite a cualquiera *«use, copy, modify, merge,
publish, distribute, sublicense, and/or sell»*. Cobrar por el mismo artefacto que se regala bajo
una licencia que autoriza a terceros a revenderlo no es sostenible.

**La decisión**: separar lo que se regala de lo que se vende.

| Artefacto | Qué es | Licencia | Dónde vive |
|:--|:--|:--|:--|
| Banco de preguntas INEP | Contenido público del INEP | CC BY-ND 3.0 (del INEP) | Se mantiene atribuido |
| Herramientas de extracción y conferencia (`scripts/01`–`11`) | El método, que da credibilidad | MIT, se queda público | Repositorio público |
| Aplicación completa, justificaciones referenciadas, backend, apps empaquetadas | El producto | **Propietaria** | Repositorio privado |
| Edición gratuita (40 preguntas) | El embudo | Propietaria, uso gratuito | Pages público |

Lo ya publicado bajo MIT no se puede retirar retroactivamente — quien lo descargó tiene sus
derechos. Lo que sí se hace es que **las versiones nuevas** salgan bajo licencia propietaria.
El valor comercial no está en el código de 2026; está en las 400 justificaciones referenciadas,
en las apps firmadas, en el backend y en la actualización cuando salga cada edición nueva.

---

## 6. Cómo se cobra

**[Verificado] El obstáculo estructural**: Stripe **no opera en Colombia**. En Latinoamérica solo
Brasil y México. Para usar Stripe habría que constituir entidad legal, obtener identificación
fiscal, dirección física y cuenta bancaria en un país soportado (típicamente una LLC
estadounidense).

**[Verificado 2026-08-06] La comparación real**, tras investigación con fuentes primarias y
verificación adversarial (11 agentes, 16 plataformas). **Hotmart quedó descartado por decisión
de Diego** — esto es una aplicación descargable, no un curso — y todas las plataformas
brasileñas de su estilo (Kiwify, Cakto, Ticto, Eduzz, Monetizze) exigen CPF/CNPJ y banco en
Brasil, así que ni siquiera son elegibles:

| Ruta | Comisión efectiva | PIX | ¿Persona natural colombiana? | Retiro a Colombia |
|:--|:--|:--|:--|:--|
| **dLocal Go** | PIX ~1,17 % · tarjeta ~3,53 % | Sí (pago único) | **Sí, documentado** («Emprendedor Individual», sin exigir RUT al registrarse) | **COP directo al banco, gratis sobre US$ 10** |
| Paddle (plan B) | 5 % + US$ 0,50 | Solo pago único | Sí (Colombia no está excluida) | USD vía Payoneer/SWIFT (mín. US$ 100) |
| FastSpring | a negociar con ventas | Sí, incluso recurrente | Inferido, sin confirmación positiva | — (hold de 45 días a nuevos) |
| Lemon Squeezy | ~6,5-7 % en Brasil | No | Sí | Riesgo: en mantenimiento tras la compra por Stripe; su sucesor no soporta Colombia |
| Stripe (con LLC extranjera) | ~1,9 % | Sí | Requiere constituir entidad | — |

**Decisión: lanzar con dLocal Go.** Es el único circuito donde todo funciona a la vez:
(1) el comprador brasileño paga **en reales, como transacción doméstica** adquirida por dLocal
Brasil — PIX o tarjeta local, sin IOF ni tarjeta habilitada para el exterior; (2) Diego retira
**en COP directo a su banco colombiano**; (3) la documentación acepta explícitamente persona
física colombiana sin sociedad; (4) la comisión es 3-5 puntos menor que las alternativas. El
argumento clásico de Paddle — *merchant of record* — vale poco aquí: Brasil **no** está en su
lista de jurisdicciones fiscales, así que tampoco liquidaría el impuesto brasileño del
comprador, y su checkout es una compra internacional con IOF ~3,5 %.

**Modelo por fases, dictado por dos restricciones verificadas de dLocal Go** (el débito
automático de suscripciones es solo con tarjeta, y no hay webhook push documentado para las
ejecuciones recurrentes):

- **Fase 1 — lanzamiento**: los tres planes como **pases de pago único** (30/90/180 días),
  PIX o tarjeta. El flujo está 100 % cubierto por la notificación documentada
  (`payment_id` → GET payment → PAID) y el backend ya corta el acceso al vencer la licencia.
  Sin renovación automática: recordatorios de recompra por correo en D-7 y D-1.
- **Fase 2 — assinatura mensual con tarjeta**: solo después de confirmar por escrito con
  soporte de dLocal Go cómo se notifican las ejecuciones recurrentes (o de validar el polling
  diario en sandbox). No se publica un modo de cobro cuyo aviso al backend no está confirmado.

**Estado técnico: hecho y desplegado.** `criar-checkout` crea el pedido con el precio leído de
la tabla `planos` (nunca del navegador) y lo congela en `checkouts`; el webhook verifica la
firma HMAC-SHA256 de la notificación, consulta el pago en el API del proveedor — el estado
jamás se cree de la notificación — y activa o revoca. Falta solo el onboarding de Diego
(runbook, paso 3).

**Riesgos abiertos** (del dossier de verificación adversarial): la aprobación del onboarding es
discrecional hasta pasar el KYC; reserva de garantía del 5-10 % sin plazo de liberación escrito;
el extracto del comprador muestra «DL*/DLOCAL» y no la marca (avisado en el checkout y en el
correo de compra para contener contracargos); spread BRL→COP no publicado (medirlo en el primer
retiro real); sin *merchant of record*, los impuestos colombianos (RUT/DIAN, renta) son de
Diego — cita con su contador.

**Migración**: cuando la facturación anual supere ~R$ 100.000, revisar la LLC + Stripe
(~1,9 %). El webhook ya entiende Stripe: solo hay que apuntar el sufijo `/stripe` y poner
`STRIPE_WEBHOOK_SECRET`.

**Tiendas móviles [Verificado]**: Apple y Google obligan a usar su facturación (30 %, o 15 % con
el Small Business Program) para desbloquear contenido dentro de la app. Por eso la app móvil
**no vende dentro de sí misma**: el usuario compra en la web y activa la app con su cuenta. Brasil
es además elegible para el *User Choice Billing* de Google y el acuerdo de CADE con Apple obliga a
permitir informar sobre métodos de pago alternativos.

---

## 7. Arquitectura del control de acceso

El requisito es: **Diego decide quién entra, pagando o gratis**, y la app tiene que seguir
funcionando sin internet.

```
Persona → se registra (correo) → Supabase Auth
                                      │
                    ┌─────────────────┴──────────────────┐
                    │                                    │
            paga en Hotmart                    Diego concede acceso
                    │                            (panel de admin)
                    ▼                                    ▼
            webhook verifica firma            conceder_acesso(email, dias)
                    │                                    │
                    └──────────► assinaturas ◄───────────┘
                                      │
                          app pide licencia al servidor
                                      │
                    licencia firmada (ECDSA P-256), 30 días
                                      │
                    la app la verifica SOLA, sin red, hasta que vence
```

**Por qué así**: la app guarda una licencia firmada con validez de 30 días y la verifica con la
clave pública embebida, sin llamar a nadie. Funciona un mes entero sin señal. Cuando quedan
7 días, avisa y se renueva sola en cuanto haya internet. Si Diego revoca, la persona pierde el
acceso al vencer la licencia vigente — como máximo 30 días después. Es el equilibrio entre
«funciona offline» y «puedo cortar el acceso».

**Estado: construido, probado y DESPLEGADO** (proyecto `evidentia-revalida`, ref
`flnawwzkmttsxuozjwar`, región São Paulo — 2026-08-06).

- `nuvem/supabase/migrations/202608050001_revalida_assinaturas.sql` — esquema base. Ninguna
  escritura directa desde el cliente; toda mutación pasa por RPC `security definer` auditada;
  RLS activa en todas las tablas; el administrador vive en una tabla que solo la migración puebla.
- `nuvem/supabase/migrations/202608060002_planos_venda_e_checkouts.sql` — la escalera real en
  datos (57/147/247), tabla `checkouts` (el pedido congela email, plan y precio), y las RPC de
  administración de planos (`listar_planos_admin`, `salvar_plano`) para que Diego edite precios
  desde el panel.
- `nuvem/supabase/tests/` — **pruebas contra un PostgreSQL real, todas pasando** (~40), incluidas
  las de seguridad (un usuario común no puede conceder acceso, listar cuentas ni tocar planos o
  checkouts) y las de negocio (idempotencia de pagos, renovación que suma al plazo vigente,
  revocación que corta licencias, escalera monótona por día). `nuvem/supabase/tests/rodar_testes.sh`.
- `nuvem/supabase/functions/emitir-licenca/` — emite la licencia firmada. **Desplegada.**
- `nuvem/supabase/functions/webhook-pagamento/` — dLocal Go (HMAC + estado leído del API, nunca
  de la notificación; reembolsos revocan) y Stripe. **Desplegada.**
- `nuvem/supabase/functions/criar-checkout/` — crea el pedido y devuelve la URL de pago; el
  precio sale de la tabla `planos`. **Desplegada** (responde «vendas abrem em breve» hasta que
  existan las credenciales de dLocal Go).
- `app-web/assinar/` — la página de venta, con los planos leídos en vivo de la tabla. El
  service worker fue ajustado para no desviarla al aplicativo.
- `nuvem/painel/` — el panel del dueño ganó la tarjeta «Planos de venda»: crear, editar precio,
  activar/desactivar planes sin tocar código.

---

## 8. Canales de distribución

| Canal | Estado | Qué falta |
|:--|:--|:--|
| **PWA / web** | **Hecho** — publica la edición libre de 40 preguntas | Nada; es el embudo |
| **Computador (macOS)** | **Hecho** — DMG arm64 y x64 construidos y abiertos | Firma Developer ID para evitar la advertencia de Gatekeeper |
| **Computador (Windows, Linux)** | Configurado en electron-builder | Ejecutar `npm run empacotar:win` / `:linux`; Windows además pide certificado de firma |
| **Android** | **Hecho** — APK de 7 MB con la edición completa, versionCode 2 | Llave de firma de producción y cuenta de Google Play (US$ 25) para publicar |
| **iPhone / iPad** | Solo PWA | `cap add ios`; para la App Store hace falta cuenta Apple Developer (US$ 99/año) |

**Toolchain resuelto en el Mac de Diego**: se instalaron `openjdk@17` (fórmula de Homebrew,
sin contraseña de administrador) y `android-commandlinetools` con la plataforma 34. El JDK 24
que ya estaba no sirve: el Gradle del proyecto soporta hasta Java 20. Xcode 26.6 está
instalado; siguen faltando **cero** identidades de firma de código, que son de pago.

---

## 9. Las 400 justificaciones referenciadas — el trabajo central

**[Verificado] Punto de partida**: las 400 explicaciones existen y son buenas — mediana de 859
caracteres, mínimo 410, ninguna vacía, con razonamiento clínico correcto y estructura constante
(identificar el caso → justificar la correcta → refutar las incorrectas). **El problema no es la
longitud, es el anclaje.**

**El método** (documentado en `docs/ESQUEMA_JUSTIFICATIVAS.md`):

1. **Catálogo maestro de fuentes verificadas** (`dados/referencias.json`). Cada fuente se abre y
   se confirma antes de entrar: título exacto, institución, año, URL o DOI. El campo `verificacao`
   registra *cómo* se confirmó — es la prueba de trabajo.
   La economía de escala está aquí: **[Verificado]** 332 de los 365 temas del banco tienen una sola
   pregunta, así que no hay ahorro por tema; pero un PCDT del Ministério da Saúde o una diretriz
   de la SBC cubren decenas de preguntas cada uno.
2. **Justificación estructurada por pregunta** (`dados/justificativas/<edicao>.json`): concepto
   clave, por qué la correcta, por qué falla *cada* distractor, puntos para llevar a la prueba, y
   las referencias con el puntero de *dónde* dentro de la fuente está el respaldo.
3. **Porta de calidad** (`scripts/12_validar_justificativas.py`): falla si una pregunta no tiene
   justificación, si cita una fuente que no existe en el catálogo, si una fuente no tiene URL ni
   DOI, si los distractores no coinciden con las alternativas erradas, o si aparece una citación
   suelta en la prosa (`et al.`, `doi:`, `http`) que no pasó por el catálogo.

**Regla inviolable: cero referencias inventadas.** El patrón de fabricación dominante es *DOI real
+ título inventado*, que no se detecta abriendo el DOI — hay que comparar el título contra el
registro que el identificador resuelve. Una sola referencia falsa destruye la credibilidad del
producto entero, que es justamente lo único que lo diferencia.

---

## 10. Riesgos, sin maquillaje

1. **Solo 500 preguntas.** Es el flanco de comparación más obvio. Mitigación: precio a la mitad
   del ancla y promesa honesta en la primera pantalla. Cada edición nueva del INEP suma 100.
2. **Las justificaciones eran generadas con IA.** En un producto gratuito era un aviso; en uno de
   pago es responsabilidad. Por eso este plan las reconstruye con fuente citada y mantiene el
   aviso de que son material de estudio de Evidentia, no documento oficial del INEP.
3. **[Verificado] El compromiso de retirada.** `AVISO_DE_CONTEUDO.md` promete públicamente retirar
   el material «sem discussão prévia» ante cualquier reclamo de un titular de derechos. En un
   negocio de suscripción eso es un riesgo de continuidad declarado por el propio proyecto. Hay
   que reescribir esa cláusula: mantener el canal de contacto y la disposición a atender reclamos,
   sin comprometer una retirada automática que dejaría a los suscriptores sin producto.
4. **El banco está gratis en GitHub Pages ahora mismo.** Mientras siga así, nadie paga.
5. **Dependencia de una sola persona.** No hay equipo. El producto tiene que poder quedarse quieto
   sin romperse: por eso funciona offline, sin servidor, y el backend hace lo mínimo.
6. **[Verificado] Riesgo de plataforma de pago**: la documentación de PIX de Stripe prohíbe
   «fornecedores de telemedicina ou medicamentos». Un banco de preguntas de educación médica no
   es eso, pero conviene preguntarlo antes de construir encima.

---

## 11. Estado del trabajo

| | |
|:--|:--|
| Mapa del proyecto | **hecho** |
| Esquema de justificaciones + porta de calidad | **hecho** |
| Backend de suscripciones probado contra PostgreSQL | **hecho** — y **desplegado** en el proyecto real |
| Catálogo de fuentes verificadas | **hecho** — 318 fuentes, 183 con DOI conferido |
| Las 500 justificaciones referenciadas | **hecho** — 500/500 estructuradas, 458 con fuente del catálogo, 42 con sello «estudo» honesto |
| Interfaz: bloque de referencias, pantalla de cuenta, atribución por ítem | **hecho** |
| Camino de compra en el app (edición libre y pantalla de activación → /assinar/) | **hecho** |
| Panel de administración, con gestión de planos y precios | **hecho** |
| Apps empaquetadas: macOS y Android | **hecho**; Windows y Linux configurados; iPhone por PWA |
| Edición gratuita de 40 preguntas | **hecho** |
| Suite automatizada | **hecho** — SQL (~40) + interfaz (116+) pasando |
| Runbook de activación | **hecho** — `produto/RUNBOOK_ATIVACAO.md` |
| Edición 2026/1 (100 preguntas nuevas) | **hecho** — integrada con figuras, gabarito y justificaciones |
| Nube desplegada (esquema, secretos, 3 funciones) | **hecho** — 2026-08-06 |
| Página de venta (`app-web/assinar/`) | **hecha** — planos en vivo; se publica al hacer merge a `main` |
| Cobro real | **pendiente de Diego**: onboarding en dLocal Go + credenciales (runbook, paso 3) |

---

## 12. Lo que solo puede hacer Diego

Ninguna de estas se puede automatizar; todas requieren su identidad, su tarjeta o su firma.

- **Onboarding en dLocal Go** como persona física (cédula, comprobante de domicilio < 6 meses,
  certificación bancaria en PDF de cuenta a su nombre) y, aprobada la cuenta, poner las
  credenciales como secretos (`DLOCALGO_API_KEY`, `DLOCALGO_SECRET_KEY`) — runbook, paso 3.
- Confirmar por escrito con soporte de dLocal Go: condiciones reales de la reserva (¿5 o 10 %?,
  ¿cuándo se libera?), si la categoría «aplicación de estudio con licencias» pasa compliance,
  el descriptor del extracto (¿«DL\*EVIDENTIA» es posible?) y — para la fase 2 — cómo se
  notifican las ejecuciones de assinatura.
- ~~Crear el proyecto de **Supabase** de producción~~ — **hecho** (`evidentia-revalida`,
  São Paulo). Falta solo crear su cuenta en el app y auto-nombrarse administrador (runbook, paso 1).
- **Consulta al abogado brasileño** con las cuatro preguntas de la sección 4.
- **Registrar «EVIDENTIA» en el INPI, clase 41** — la clase está libre hoy.
- Cita con su **contador en Colombia**: RUT/DIAN, facturación de exportación de servicios.
- Decidir si el repositorio pasa a privado y cuándo, y publicar la página de venta (merge a `main`).
- Cuenta **Apple Developer** (US$ 99/año) y **Google Play** (US$ 25 único), si quiere las tiendas.
- Certificado **Developer ID** de Apple para firmar la app de escritorio sin advertencias.
- La primera venta real pequeña: verificar que no aparece IOF en el extrato, ejecutar un
  reembolso real, y medir el spread BRL→COP del primer retiro contra la tasa del día.
