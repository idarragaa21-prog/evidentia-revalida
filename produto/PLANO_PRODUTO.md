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

El producto es un **banco de las 400 preguntas objetivas del Revalida (INEP) de 2023/1 a
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

**[Verificado]** Tamaño: 17.121 inscritos en Revalida 2025.1, con 25,49 % de aprobación — unos
12.700 candidatos por edición que no aprueban y vuelven el año siguiente. Dos ediciones al año.

**[Verificado]** El estándar del mercado es prueba o garantía de **7 días** (Medway da 10).

---

## 3. Precio

**[Hipótesis]** SKU único, dos periodicidades:

- **R$ 39/mês**
- **R$ 247/ano** (equivale a R$ 20,58/mês — 47 % menos que el mensual)

Y una **capa gratuita permanente de 40 preguntas** (8 por área, mezcladas entre las 4 ediciones),
con la justificación referenciada completa. No es una demo mutilada: es el producto entero sobre
un décimo del banco.

**Ancla explícita**: R$ 247/año es **la mitad** de Revalida Resolve (R$ 497), que es el producto
más parecido y el que el candidato encontrará al comparar. La razón para estar por debajo es
honesta y hay que decirla en la primera pantalla: *Evidentia tiene menos preguntas — solo las 400
oficiales de las últimas cuatro ediciones — pero cada una está conferida contra el cuaderno del
INEP y justificada con la fuente citada.*

**Criterio de falsación**: si en los primeros 60 días con tráfico real la conversión de la capa
gratuita a pago es menor al 2 %, el problema es el precio o la promesa, no el volumen — y se
prueba R$ 197/año antes de tocar el producto. Si la conversión supera el 6 %, el precio está bajo
y se sube a R$ 297 en la cohorte siguiente, respetando el precio a quien ya renovó.

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

**[Verificado] La comparación real**:

| Ruta | Comisión | PIX recurrente | Boleto / parcelado | ¿Vendedor colombiano? |
|:--|:--|:--|:--|:--|
| **Hotmart** | 9,9 % + R$ 1,00 | Sí (Pix Automático) | Sí, ambos | **Sí, verificado** |
| Stripe (con LLC extranjera) | ~1,9 % (PIX 1,19 % + Billing 0,7 %) | Sí | No | Requiere constituir entidad |
| Kiwify | 8,99 % + R$ 2,49 | Sí | Sí | No documentado |
| Paddle | 5 % + US$ 0,50 | **Solo pago único** | No | Sí |

**Decisión: lanzar con Hotmart.** **[Estimado]** La diferencia de comisión (9,9 % frente a ~1,9 %)
son unos R$ 24 por suscripción anual de R$ 247. Constituir una LLC estadounidense cuesta más que
eso durante los primeros cientos de clientes, y añade contabilidad internacional. Además la ruta
Stripe carga **3,5 % de IOF** al comprador brasileño **[Verificado]** y en su extracto aparece
«Ebanx», no la marca — un costo de conversión y de confianza que probablemente supera el ahorro.

Hotmart, además: acepta productores colombianos con retiro en COP o USD **[Verificado]**, es la
plataforma que el propio competidor ancla (Revalida Resolve) usa, ofrece PIX, boleto, parcelado en
12x y Pix Automático, y actúa como *merchant of record* resolviendo los impuestos.

**Advertencia [Verificado]**: al registrar la cuenta fuera de Brasil, «suas novas vendas e
comissões passarão a ser geradas em Dólares (USD) ou Euros (EUR)». Queda por confirmar
directamente con Hotmart si eso significa perder el precio en reales y el catálogo brasileño de
medios de pago, o si solo cambia la moneda de liquidación. **Es la pregunta número uno antes de
publicar precios.**

**Migración**: cuando el volumen anual supere ~R$ 100.000, la LLC + Stripe se amortiza. El código
del webhook está escrito para admitir varios proveedores desde el día uno.

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

**Estado: construido y probado.**

- `nuvem/supabase/migrations/202608050001_revalida_assinaturas.sql` — esquema completo. Ninguna
  escritura directa desde el cliente; toda mutación pasa por RPC `security definer` auditada;
  RLS activa en todas las tablas; el administrador vive en una tabla que solo la migración puebla.
- `nuvem/supabase/tests/` — **26 pruebas contra un PostgreSQL real, todas pasando**, incluidas las
  de seguridad (un usuario común no puede conceder acceso ni listar cuentas) y las de negocio
  (idempotencia de pagos, renovación que suma al plazo vigente, revocación que corta las licencias
  ya entregidas). Se corren con `nuvem/supabase/tests/rodar_testes.sh`, sin Docker y sin nube.
- `nuvem/supabase/functions/emitir-licenca/` — emite la licencia firmada.
- `nuvem/supabase/functions/webhook-pagamento/` — recibe los eventos de pago con verificación de
  firma y tolerancia de tiempo contra ataques de repetición.

---

## 8. Canales de distribución

| Canal | Estado | Qué falta |
|:--|:--|:--|
| **PWA / web** | Funcionando y publicada | Pasa a ser la edición gratuita de 40 preguntas |
| **Computador (Windows, macOS, Linux)** | Por construir | Electron + electron-builder |
| **Android** | Proyecto Capacitor listo, APK desactualizado | **[Verificado]** Falta el SDK de Android y un JDK 17 o 21 (el JDK 24 instalado no funciona con Gradle 8.2.1) |
| **iPhone / iPad** | Solo PWA | `cap add ios`; para publicar en la App Store hace falta cuenta Apple Developer (US$ 99/año) |

**[Verificado] Estado del Mac de Diego**: Xcode 26.6 con SDK iOS 26.5 instalado y funcionando;
Node 24; Java 24 (incompatible con el Gradle del proyecto); **sin** Android SDK; **cero**
identidades de firma de código.

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

1. **Solo 400 preguntas.** Es el flanco de comparación más obvio. Mitigación: precio a la mitad
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

## 11. Orden de trabajo

1. ~~Mapear el proyecto~~ **hecho**
2. ~~Esquema de justificaciones + porta de calidad~~ **hecho**
3. ~~Backend de suscripciones con pruebas~~ **hecho**
4. Catálogo de fuentes verificadas
5. Las 400 justificaciones referenciadas
6. Rediseño de la interfaz + pantalla de cuenta y activación
7. Apps empaquetadas: computador, Android, iPhone
8. Edición gratuita de 40 preguntas + página de venta
9. QA integral y revisión adversarial
10. Runbook de activación: qué cuentas abre Diego, qué claves pega, qué comandos corre

---

## 12. Lo que solo puede hacer Diego

Ninguna de estas se puede automatizar; todas requieren su identidad, su tarjeta o su firma.

- Abrir cuenta de **Hotmart** como productor y confirmar con su soporte el punto de la moneda.
- Crear el proyecto de **Supabase** de producción (uno nuevo, no el de Atlas).
- **Consulta al abogado brasileño** con las cuatro preguntas de la sección 4.
- **Registrar «EVIDENTIA» en el INPI, clase 41** — la clase está libre hoy.
- Decidir si el repositorio pasa a privado y cuándo.
- Cuenta **Apple Developer** (US$ 99/año) y **Google Play** (US$ 25 único), si quiere las tiendas.
- Certificado **Developer ID** de Apple para firmar la app de escritorio sin advertencias.
