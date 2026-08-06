# Evidentia · Revalida — plan de salida al mercado

> Escrito el 2026-08-06 sobre el estado real del código, no sobre supuestos.
> Sellos: **[Hecho]** verificado ejecutándolo · **[Diego]** solo tú puedes hacerlo ·
> **[Pendiente]** trabajo de producto que falta.
>
> Documentos hermanos: `PLANO_PRODUTO.md` (el porqué de cada decisión, con la
> investigación) y `RUNBOOK_ATIVACAO.md` (los pasos operativos, uno por uno).

---

## 1. La ruta crítica, en una frase

**Todo el producto está construido y desplegado; lo único que separa a Evidentia de su
primera venta es tu onboarding en dLocal Go.** El resto de esta lista es mejora, no
bloqueo.

```
[Diego] Onboarding dLocal Go ──► secretos ──► prueba en sandbox ──► merge a main
                                                                        │
                                                          la página de venta entra al aire
                                                                        │
                                                              primera venta real
```

Todo lo demás de este documento se puede hacer **después** de la primera venta, y algunas
cosas conviene que así sea: vender antes de pulir es cómo se descubre qué vale la pena pulir.

---

## 2. Qué está listo **[Hecho]**

| Pieza | Estado verificado |
|:--|:--|
| Banco de preguntas | 500 preguntas oficiales, 5 ediciones (2023/1 a 2026/1), conferidas palabra por palabra contra el cuaderno del INEP |
| Justificaciones | 500/500 estructuradas; 458 con fuente del catálogo; 42 con el sello «estudo» honesto |
| Catálogo de fuentes | 319 fuentes verificadas, cada una con su prueba de trabajo en `verificacao` |
| Nube | Proyecto real desplegado: esquema con RLS, 3 edge functions, secretos cargados |
| Cobro | dLocal Go integrado de punta a punta: checkout con precio del servidor, webhook con HMAC, reembolso que revoca |
| Página de venta | `app-web/assinar/`, con los planes leídos en vivo de la tabla |
| Control total tuyo | Panel: conceder acceso gratis, revocar, y **editar precios y planes sin tocar código** |
| Apps | macOS (DMG), Android (APK), PWA para iPhone; Windows y Linux configurados |
| Pruebas | 82 SQL contra PostgreSQL real + 3 suites de interfaz, todas en verde |
| Seguridad | Revisión adversarial de 17 agentes; los 9 hallazgos confirmados, corregidos y fijados con pruebas |

---

## 3. Lo que tienes que hacer tú **[Diego]** — en este orden

**Orden pensado para que puedas parar en cualquier punto sin dejar nada a medias.**

1. **Onboarding en dLocal Go** como persona física (cédula, comprobante de domicilio
   < 6 meses, certificación bancaria en PDF). *Bloquea todo lo demás.*
2. **Las cuatro preguntas por escrito a su soporte** (están literales en el runbook §3):
   reserva de garantía, compliance de la categoría, descriptor del extracto, y aviso de
   ejecuciones recurrentes. Guarda las respuestas: cambian decisiones.
3. **Cargar los secretos** y probar el ciclo completo en sandbox.
4. **Crear tu cuenta en la app y auto-nombrarte administrador** (runbook §1).
5. **Merge a `main`** — publica la página de venta y la edición libre actualizada.
6. **Primera venta real pequeña**: verifica que no hay IOF en el extracto, ejecuta un
   reembolso real, y mide el spread BRL→COP de tu primer retiro.
7. En paralelo, sin bloquear: **consulta al abogado brasileño** (4 preguntas cerradas en
   `PLANO_PRODUTO.md` §4), **registro de «EVIDENTIA» en el INPI clase 41** (la clase está
   libre hoy), y **cita con tu contador** en Colombia.

---

## 4. El pipeline de algoritmos y figuras **[Hecho la infraestructura, Pendiente el contenido]**

Pediste imágenes y algoritmos anclados en literatura, sin nada fabricado. La
infraestructura ya existe y la primera pieza real también.

### Las dos reglas que lo gobiernan

**Nada se dibuja de memoria.** Cada algoritmo apunta a una fuente del catálogo, ya
verificada, y dice *dónde* dentro de ella está cada rama. La puerta de calidad
(`scripts/12_validar_justificativas.py`) falla si un algoritmo no tiene fuente, si la
fuente no existe, si una rama apunta a un nodo inexistente, si hay un nodo inalcanzable —
señal de estructura mal transcrita — o si una decisión tiene menos de dos ramas.
*Probado rompiéndolo a propósito: los tres fallos se detectan.*

**Nada se copia.** Lo que se reproduce es la **lógica de decisión publicada** — que es
hecho clínico, no obra — redibujada por nosotros desde los criterios de la fuente. La
ilustración original de la directriz no se copia ni se redistribuye. Es la misma
disciplina jurídica del resto del producto: contenido oficial sin modificar de un lado
(las preguntas del INEP), obra propia del otro.

### Lo que ya funciona

- `docs/ESQUEMA_ALGORITMOS.md` — el contrato de datos.
- `dados/algoritmos.json` — con el primer algoritmo real: **estadiamento y conducta en
  dengue (grupos A a D)**, transcrito rama a rama del *Fluxograma do manejo clínico da
  dengue* del Ministério da Saúde, leído íntegro desde el PDF oficial de gov.br.
- `scripts/18_montar_algoritmos.py` — dibuja SVG de carriles indentados: 13 kB, nítido en
  cualquier pantalla, funciona offline y sigue el tema claro/oscuro solo.

> **Por qué carriles y no cajas con flechas**: un diagrama de flujo real se abre en
> columnas, y cinco columnas de 280 px son 1.400 px de ancho. En un celular de 360 px eso
> encoge el texto a tres píxeles — ilegible justo para quien más usa la app.

### Lo que falta **[Pendiente]**

- **Conectar la capa a la interfaz**: el montador debe embeber solo los algoritmos que
  usa cada edición (como ya hace con figuras y fuentes), y la app mostrarlos *después* de
  la justificación en prosa, nunca en su lugar, con la línea de origen visible.
- **Escalar el contenido**: unos 25 a 40 algoritmos cubren la mayoría de las conductas que
  el Revalida repite. Prioriza por frecuencia real en el banco: dengue, sepsis, síndrome
  coronario agudo, asma, ACV, tuberculosis, sífilis y transmisión vertical, reanimación
  neonatal, preeclampsia, cetoacidosis. Uno por sesión, verificado contra su fuente.
- **Cerrar los 42 huecos**: preguntas con justificación buena pero sin fuente en el
  catálogo. Ojo — el sello «estudo» es honesto y preferible a una cita forzada; cierra
  solo las que una fuente real cubra de verdad.
- **Aprovechar las 23 fuentes verificadas nunca citadas**: ya están conferidas; hay valor
  esperando en ellas.

---

## 5. Marketing y lanzamiento

### El argumento, y por qué funciona

No compitas por volumen: lo pierdes. MedTask anuncia «+90 mil questões»; tú tienes 500.
Compite por **lo único que ninguno ofrece: certeza verificable**.

> *«Por que 500 questões, e não 20 mil? Porque cada uma daqui foi verificada, uma a uma,
> contra a prova oficial.»*

Es honesto, es verificable, y convierte tu debilidad aparente en la razón de compra. El
candidato ya paga R$ 4.516 solo en tasas del examen: no le falta contenido, le sobra. Lo
que le falta es saber en qué confiar.

### Secuencia de lanzamiento

**Semana 0 — silencioso.** La edición libre de 40 preguntas ya está pública. Publica la
página de venta y consigue **5 usuarios reales** (colegas, grupos de Revalida). No pidas
dinero todavía: pide que la usen y te digan qué falta. Concédeles acceso completo desde el
panel — para eso lo construimos.

**Semana 1-2 — venta blanda.** Abre las ventas sin anuncio. La conversión de esos primeros
visitantes es tu línea base honesta. Objetivo: **la primera venta real**, con reembolso
probado.

**Semana 3+ — canales.** En orden de costo-beneficio para un producto de nicho:

1. **Grupos de Revalida en WhatsApp/Telegram y r/Revalida.** Donde está tu público,
   gratis. Entra aportando (comparte una justificación referenciada útil), no vendiendo.
2. **Contenido que demuestra el método.** Una publicación por semana: *«esta pregunta del
   Revalida 2024/2 tenía la unidad equivocada en tres bancos que revisé; así se confiere
   contra el cuaderno oficial»*. Es tu diferenciador, mostrado en vez de afirmado.
3. **La edición libre como embudo.** Ya lleva a `/assinar/`. Mide la conversión.
4. **Boca a boca de aprobados.** El testimonio que vale es «pasé y esto me sirvió».
   Llegará solo si el producto es bueno; no lo fuerces antes de tiempo.

**No hagas**: anuncios pagados antes de tener conversión orgánica medida (quemas dinero
optimizando una página que quizá no convierte), ni promesas de aprobación (es lo que hace
la competencia y es exactamente lo que erosiona la confianza que vendes).

### Qué medir, y qué decisión gatilla cada número

| Métrica | Umbral | Decisión |
|:--|:--|:--|
| Semestral / total de unidades | < 30 % | Subir el mensual a R$ 67; medir 30 días más |
| Recompra del mensual al mes 2 | < 50 % | Eliminar el mensual; vender solo pases de 3 y 6 meses |
| Conversión de la página | < 1 % con ≥ 500 visitas | El problema es la propuesta o el checkout, **no** el precio |
| Reembolsos del semestral | > 5 % | Revisar la promesa: algo se está prometiendo de más |

---

## 6. Después de la primera venta — por orden de valor

1. **Recordatorios de recompra** (D-7 y D-1 del vencimiento). Sin renovación automática,
   esto *es* tu retención. El backend sabe la fecha exacta de cada licencia.
2. **Los 25-40 algoritmos** de la sección 4. Es el diferenciador que más se nota al usar.
3. **Firma de las apps**: Developer ID de Apple (US$ 99/año) elimina la advertencia de
   Gatekeeper. Se puede vender sin firmar explicando cómo abrir la primera vez —
   incómodo, no imposible.
4. **Fase 2 del cobro**: assinatura mensual con tarjeta, solo tras confirmar con dLocal Go
   cómo se notifican las ejecuciones recurrentes.
5. **Repositorio privado** y licencia propietaria para las versiones nuevas
   (`PLANO_PRODUTO.md` §5).
6. **Edición 2026/2** cuando el INEP la publique: +100 preguntas, gratis para quien tenga
   acceso activo. Es la razón para renovar.
7. **Tiendas móviles**, si el volumen las justifica. Recuerda: la app móvil no vende
   dentro de sí misma — el usuario compra en la web y activa con su cuenta.

---

## 7. Los riesgos que no hay que maquillar

1. **La aprobación de dLocal Go es discrecional.** La documentación respalda a la persona
   natural colombiana, pero solo una solicitud real lo prueba. Plan B listo: Paddle.
2. **Reserva de garantía del 5-10 %** sin plazo de liberación escrito en sus términos.
3. **Sin renovación automática**, la recompra depende de tus recordatorios. Riesgo
   comercial, no técnico — pero real.
4. **500 preguntas es el flanco de comparación obvio.** Mitigado con precio y honestidad,
   no resuelto. Cada edición nueva suma 100.
5. **Dependencia de una sola persona.** Por eso el producto funciona offline, sin
   servidor, y el backend hace lo mínimo: puede quedarse quieto sin romperse.
6. **La cláusula de retirada** de `AVISO_DE_CONTEUDO.md` todavía promete retirar el
   material «sem discussão prévia». En un producto de suscripción eso deja a tus clientes
   sin producto de un día para otro. **Reescríbela antes de cobrar.**

---

## 8. Comprobación final antes de la primera venta

La lista operativa completa está en `RUNBOOK_ATIVACAO.md`. En resumen:

- [ ] Creo cuenta nueva y **no** tengo acceso; me lo concedo desde el panel y se desbloquea.
- [ ] Apago el wifi y la aplicación sigue funcionando.
- [ ] Sandbox: pago con PIX de prueba → aparezco como pagante → reembolso → pierdo acceso.
- [ ] Editar un precio en el panel se refleja en la página de venta.
- [ ] `python3 scripts/12_validar_justificativas.py` termina sin errores.
- [ ] `nuvem/supabase/tests/rodar_testes.sh` termina con «TODAS AS PROVAS PASSARAM».
