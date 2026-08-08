# Evidentia · Revalida — plan de salida al mercado

> Actualizado el 8 de agosto de 2026. Este documento distingue evidencia ejecutada de tareas
> manuales. Ningún elemento marcado como bloqueo se considera “mejora para después”.
>
> Fuente única de cifras: `scripts/metricas_produto.json`, verificada por
> `scripts/22_validar_metricas_produto.py`.

## 1. Estado verificable del producto

| Dimensión | Estado actual | Evidencia |
|:--|:--|:--|
| Acervo | 600 preguntas, 6 ediciones, 30 figuras | baseline canónico |
| Comentarios | 600 justificaciones | gate de justificativas |
| Referencias | 526 preguntas con referencias; 74 sin referencia catalogada | cálculo desde los JSON |
| Catálogo | 319 fuentes | `dados/referencias.json` |
| Texto oficial | 600/600 preguntas y 3.000 campos comparados | gate fail-closed con SHA-256 de 6 PDFs |
| Excepciones editoriales | 5, declaradas en el reporte; ninguna divergencia oculta | `scripts/10_conferir_textos_oficiais.py` |
| Funcionamiento | estudio offline, simulados, revisión, backup local | suites Playwright |
| Cobro | integración construida; validación comercial real aún manual | runbook de activación |

Lenguaje comercial autorizado:

> “600 preguntas de seis ediciones; justificación en todas; 526 con referencias
> catalogadas y 74 presentadas sin referencia catalogada.”

No usar “fuente citada en cada pregunta”, “todo resuelto”, “único bloqueo” ni prometer
recordatorios por correo mientras no exista un envío probado en producción.

## 2. Decisión de lanzamiento

**No abrir venta pública ni enviar a revisión de tienda hasta completar todos los gates P0.**
Después de esos gates, la primera etapa es un piloto controlado, no una campaña.

### P0 — bloquean venta y envío

- [ ] Dictamen jurídico escrito sobre reutilización comercial del material, atribución, marca y términos.
- [ ] Política de privacidad, etiqueta de tienda, borrado/anonimización y términos alineados con el comportamiento real.
- [ ] Modo de evaluación en `0`; una cuenta nueva sin compra no obtiene el acervo completo.
- [ ] dLocal Go aprobado; sandbox completo y una compra real de menor valor con reembolso real conciliado.
- [ ] Producto premium fuera de distribución pública accidental; decisión explícita sobre licencia y repositorio.
- [ ] Gate oficial verde 600/600, baseline 600/6/526 verde y justificativas sin errores.
- [ ] CI verde, build de producción reproducible y prueba en dispositivo/TestFlight.
- [ ] Cuenta de revisión activa, soporte operativo y enlaces visibles a términos, reembolso y privacidad.

### P1 — antes de adquisición pagada

- [ ] Piloto de 5–20 personas con registro de activación, fricción, incidencias y solicitudes de devolución.
- [ ] Instrumentación agregada y compatible con la política para visitas, inicio de checkout, pago y activación.
- [ ] Flujo de soporte con responsable, plantilla de incidente y tiempo objetivo de primera respuesta.
- [ ] Revisión editorial con revisor, fecha, evidencia y estado por pregunta.
- [ ] Accesibilidad manual con VoiceOver y matriz mínima de dispositivos.

## 3. Secuencia de salida

### Etapa A — validación interna

Ejecutar todos los comandos del checklist de release. Probar con cuentas nuevas, licencia
válida, licencia revocada, expiración, modo avión, eliminación de cuenta y reembolso.
Guardar evidencia fechada; una captura aislada no sustituye el resultado del gate.

### Etapa B — piloto sin campaña

Invitar 5–20 candidatos. Si el acceso es de cortesía, registrarlo como tal; no simular una
venta. Recoger de forma estructurada:

- tiempo hasta activar y empezar el primer simulado;
- errores de login/licencia y dispositivo;
- preguntas reportadas y calidad percibida de las justificaciones;
- intención de compra y motivo de abandono;
- carga y tiempo de respuesta del soporte.

### Etapa C — venta blanda

Abrir el checkout sin anuncios masivos. Confirmar al menos una compra y un reembolso reales.
No publicar testimonios sin permiso ni afirmar aprobación atribuible al producto.

### Etapa D — distribución ampliada

Solo después de que el funnel sea medible y el soporte sea sostenible. Priorizar contenido
educativo demostrable y la edición libre; evitar comparar precios o volumen de competidores
sin una investigación fechada y repetible.

## 4. Métricas y reglas de decisión

No fijar objetivos sobre datos que todavía no se recogen. Antes de usarlas, documentar
definición, fuente y denominador.

| Métrica | Definición mínima | Decisión inicial |
|:--|:--|:--|
| Activación | licencias emitidas / pagos confirmados | si <90%, detener adquisición y reparar onboarding |
| Conversión | pagos confirmados / visitas únicas consentidas a planes | evaluar solo con ≥500 visitas y fuente estable |
| Reembolso | pagos reembolsados / pagos confirmados | si >5%, revisar promesa, calidad y checkout |
| Soporte | tickets por 100 activaciones | identificar causa principal antes de escalar |
| Recompra | compradores con nuevo pase / compradores elegibles | medir después de que exista una cohorte vencida |

No existe renovación automática. Mientras no haya recordatorios transaccionales probados,
la página y el soporte deben indicar que la persona consulta la fecha final en su cuenta.

## 5. Propuesta de valor y precio

La propuesta no es “más preguntas”; es un acervo acotado con trazabilidad, explicación de
distractores, funcionamiento offline y cobertura de referencias declarada con números exactos.

Los precios se leen del servidor. Cualquier cambio requiere comprobar antes:

- precio total y duración visibles antes de pagar;
- ausencia de renovación automática;
- coherencia entre checkout, comprobante y días concedidos;
- coste real de procesador, impuestos, reembolso y soporte.

No usar cifras de competidores ni tasas del examen en la landing sin volver a verificarlas y
registrar fuente y fecha.

## 6. Plan 30/60/90

### Días 0–30

- cerrar P0 legal, privacidad, evaluación, distribución premium y dLocal;
- mantener verdes los gates de 600/600, 600/6/526 y Playwright;
- terminar ficha, términos, soporte y build de tienda;
- ejecutar piloto interno y corregir bloqueos de activación.

### Días 31–60

- piloto externo de 5–20 personas;
- flujo editorial trazable y prioridad para las 74 preguntas sin referencia catalogada;
- instrumentación mínima y soporte operativo;
- medir arranque, memoria, tamaño y accesibilidad en dispositivos reales.

### Días 61–90

- venta blanda si los gates y el piloto siguen verdes;
- decidir precio y canales con datos propios;
- automatizar release firmado y auditoría mensual de fuentes;
- ampliar contenido solo donde el uso y los reportes muestren valor.

## 7. Checklist ejecutable de release

```bash
python3 scripts/22_validar_metricas_produto.py
python3 scripts/12_validar_justificativas.py
python3 scripts/10_conferir_textos_oficiais.py \
  --fontes /tmp/evidentia-fontes --baixar-fontes
python3 scripts/23_validar_claims_comerciais.py
python3 scripts/08_montar_aplicativo.py --edicao teste
npm run teste:funcional
npm run teste:tema
npm run capturas:telas
npm run capturas:figuras
```

Además: pruebas SQL, compra/reembolso real, checklist editorial, checklist de tienda y revisión
manual en dispositivo. La publicación depende de todos los resultados, no de que uno de ellos
termine en verde.
