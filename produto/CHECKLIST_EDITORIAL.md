# Checklist editorial del acervo

> Ninguna pregunta se considera revisada porque un script terminó en verde. Los scripts validan
> integridad y trazabilidad; una persona calificada valida el contenido clínico.

## Registro mínimo por pregunta

Mantener un registro auditable con estos campos:

| Campo | Regla |
|:--|:--|
| `edicao` + `numero` | clave única que existe en el banco |
| `hash_conteudo` | hash de enunciado, alternativas y gabarito revisados |
| `status` | `pendente`, `em_revisao`, `aprovada`, `bloqueada` o `corrigida` |
| `revisor` | nombre e identificación profesional; no usar “IA” como revisor |
| `revisado_em` | fecha ISO |
| `fontes_revisadas` | IDs del catálogo realmente abiertos |
| `achado` | sin problema, error de contenido, fuente insuficiente, desactualización o duda |
| `acao` | corrección, nueva fuente, aclaración o bloqueo |
| `segundo_revisor` | obligatorio para una corrección que cambie la conducta clínica o el gabarito |

Si cambia el hash después de la aprobación, el estado vuelve automáticamente a `pendente`.

## Revisión de la fuente oficial

- [ ] Los seis PDFs existen y su SHA-256 coincide con el manifest del gate.
- [ ] `scripts/10_conferir_textos_oficiais.py` informa 600/600 y 3.000/3.000 campos.
- [ ] No hay comparación aprobada solo eliminando espacios; cualquier adaptación está en `EXCECOES` con motivo.
- [ ] Gabarito definitivo, anulaciones, edición y número coinciden con la fuente oficial.
- [ ] Toda figura necesaria aparece, es legible y corresponde a la pregunta correcta.
- [ ] Tablas y unidades mantienen significado; una adaptación visual no altera cifras ni encabezados.

## Revisión clínica y pedagógica

- [ ] La explicación responde al caso concreto y a la alternativa correcta.
- [ ] Cada distractor se explica por separado sin introducir una afirmación clínica falsa.
- [ ] Las referencias citadas respaldan la afirmación exacta; no basta que sean del mismo tema.
- [ ] Se abrió el documento, se comprobó título/autor/año y se anotó la sección o página.
- [ ] La recomendación sigue vigente o se explica por qué una fuente histórica continúa aplicando.
- [ ] No se mezclan guía internacional y protocolo brasileño como si fueran equivalentes.
- [ ] Dosis, unidades, umbrales, embarazo, pediatría y urgencias reciben revisión adicional.
- [ ] Una pregunta sin cobertura permanece explícitamente sin referencia; no se fuerza una cita.
- [ ] El texto diferencia material de estudio, regla de examen y conducta clínica real.

## Prioridad de revisión

1. Las 74 preguntas sin referencia catalogada, empezando por las 70 no anuladas.
2. Conductas de urgencia, farmacología, obstetricia, pediatría y dosis.
3. Fuentes más antiguas o enlaces rotos.
4. Preguntas reportadas por usuarios.
5. Muestreo periódico del resto del acervo.

## Gate de publicación editorial

```bash
python3 scripts/22_validar_metricas_produto.py
python3 scripts/12_validar_justificativas.py
python3 scripts/10_conferir_textos_oficiais.py \
  --fontes /tmp/evidentia-fontes --baixar-fontes
```

- [ ] No hay error de los gates automatizados.
- [ ] Toda corrección de contenido tiene diff, fuente, revisor y fecha.
- [ ] No quedan preguntas `bloqueada` incluidas en la build.
- [ ] El responsable editorial firma versión, fecha y hash del acervo.
- [ ] Soporte tiene un canal para reportar pregunta, edición y número.
- [ ] Las correcciones se comunican en las notas de versión sin exponer datos del reportante.

## Ficha de aprobación de release

| Dato | Completar |
|:--|:--|
| Versión/build | |
| Commit | |
| Hash del banco | |
| Cobertura oficial | /600 |
| Aprobadas por revisión humana | /600 |
| Bloqueadas | |
| Responsable editorial | |
| Fecha | |
