# Plan de mejora de interfaz — Evidentia · Revalida

**Objetivo.** Elevar la aplicación a un estándar profesional e intuitivo, coherente con la marca Evidentia, sin tocar la lógica de puntuación ni el contenido oficial ya verificado (300 questões, gabarito INEP con doble verificación).

---

## 1. Diagnóstico de la versión actual

| # | Problema detectado | Efecto en el usuario |
|---|---|---|
| 1 | Emojis en el selector de modo (🎲 🩺 📄) y símbolos de texto (✓, ▲) | Aspecto informal, incoherente con una marca médica/académica |
| 2 | Selector de modo como control segmentado; el sub‑filtro aparece "escondido" al elegir | Poco claro qué se va a estudiar antes de iniciar |
| 3 | No hay resumen del simulado antes de "Iniciar" | El usuario inicia sin saber cuántas/qué preguntas y tiempo estimado |
| 4 | Al responder no hay avance automático; hay que pulsar "Próxima" siempre | Fricción en simulados largos |
| 5 | Cada respuesta re‑renderiza toda la pantalla (parpadeo) | Sensación poco pulida |
| 6 | Jerarquía tipográfica uniforme (serif en todos los títulos) | Menos legible en etiquetas funcionales |
| 7 | Sin estados de foco de teclado ni favicon | Accesibilidad y terminación incompletas |
| 8 | Selección de especialidades/ediciones sin "seleccionar todas" | Pasos manuales innecesarios |

---

## 2. Principios de rediseño

1. **Cero emojis.** Todo ícono es un trazo SVG consistente (mismo grosor y estilo), acorde al estilo de casa.
2. **Claridad antes de acción.** El usuario siempre ve un *resumen del simulado* (modo, número, filtros, tiempo estimado) antes de iniciar.
3. **Menos fricción.** Auto‑avance opcional, actualización en el sitio (sin parpadeo), atajos de teclado visibles.
4. **Jerarquía tipográfica.** Serif (marca) para el nombre, el hero y los números grandes; sans (Calibri) para títulos funcionales y cuerpo — mayor legibilidad.
5. **Marca Evidentia.** Blanco con bordes y acentos verdes, crema/dorado de apoyo, logo integrado; claro y oscuro calibrados.
6. **Accesibilidad.** Foco visible, contraste suficiente, objetivos táctiles ≥ 44 px, `aria-label` en controles de ícono.

---

## 3. Mejoras concretas por pantalla

### 3.1 Inicio y montador de simulado
- Modo como **tres tarjetas** (ícono + título + descripción), seleccionables, en vez del control segmentado con emojis.
- Selección de **especialidades** y **ediciones** integrada, con "Selecionar todas / Limpar".
- **Barra de resumen en vivo**: "Aleatório · 20 questões · todas as áreas · ~30 min", que se actualiza al cambiar cualquier opción.
- Nueva opción **Auto‑avançar** (avanza sola tras responder, en modo prova).
- Accesos rápidos (histórico, sobre) y "continuar simulado" con íconos coherentes.

### 3.2 Examen (quiz)
- Encabezado con progreso, contador de respondidas, cronómetro y mapa de questões.
- Alternativas con estados claros (seleccionada / correcta / incorrecta) y **actualización en el sitio** (sin re‑render completo).
- **Auto‑avanço** opcional; navegación Anterior/Próxima con íconos; "Finalizar" con confirmación si faltan respuestas.
- Atajos de teclado visibles (A–D, ←/→, F marcar, Enter avançar).

### 3.3 Resultados
- Dona + indicadores (acertos, erros, em branco, tempo, tempo médio por questão).
- Veredicto sin símbolos ASCII (ícono SVG), calibrado al alvo orientativo del 60 %.
- Barras por área con referencia de 60 % y tabla por edición.

### 3.4 Revisión y justificativas
- Filtros (todas / erradas / certas / em branco / marcadas) con conteo.
- Gabarito oficial destacado + comentario de estudio (marcado "IA · não oficial").

### 3.5 Histórico, sobre y respaldo
- Evolución acumulada por área, lista de simulados, limpiar histórico.
- Página de fuentes e integridad (qué es oficial y qué es de apoyo).
- **Exportar / importar respaldo** del progreso (JSON) e **impresión** del caderno de erros.

---

## 4. Contenido

- Se conservan las **300 questões verificadas** (2023/1, 2023/2, 2024/1) con gabarito oficial.
- **Edição 2024/2**: su gabarito ya está verificado al 100 % contra la clave oficial; el texto de los enunciados en el PDF está codificado con una fuente no estándar y requiere reconocimiento óptico de caracteres, que se realiza y revisa aparte para no introducir errores.

---

## 5. Verificación (antes de entregar)

1. Pruebas automáticas de puntuación (todo correcto, todo incorrecto, mitad en blanco, anuladas fuera de puntuación) y del mapeo de alternativas embaralhadas.
2. Capturas en móvil y escritorio, claro y oscuro, de cada pantalla.
3. Revisión estricta de diseño (contraste, foco, ausencia de emojis, coherencia de íconos) y corrección de defectos.
