# Runbook: publicar en la App Store

> Para Diego. Checklist operativo actualizado el 8 de agosto de 2026. Ningún ítem se da por
> resuelto solo porque exista código: privacidad, compras, borrado y metadatos se vuelven a
> probar en la build exacta que se envía.

---

## Preflight técnico — volver a comprobar en cada build

| Guideline | Qué habría pasado | Cómo quedó |
|:--|:--|:--|
| **3.1.1** Pagos externos | Rechazo seguro: la app llevaba a comprar en la web, y hasta *decir dónde se compra* está prohibido | Edición iOS propia (`--edicao ios`) sin botones **y sin las frases**, borradas del archivo. Verificado: cero coincidencias de «compra», «planos» o la URL en el binario |
| **5.1.1(v)** Borrar cuenta | Se podía crear cuenta pero no borrarla | Existe **Conta → Excluir minha conta**; antes de enviar, probar también anonimización/retención de checkouts y eventos, no solo que falle el login |
| **5.1.1** Privacidad | La ficha puede no coincidir con red, compra y dispositivo | Generar un inventario de datos de la build y reconciliarlo con política y etiqueta de App Store |
| **Envío** Política de privacidad | No se puede ni enviar sin la URL | `app-web/privacidade/`, alineada con la LGPD |
| **Missing Compliance** | Cada subida se quedaba bloqueada | `ITSAppUsesNonExemptEncryption = false` en el Info.plist |
| **5.2.1** Nombre institucional | La app se llamaba «Revalida» a secas: se lee como app oficial del INEP | Ahora «Evidentia Revalida», en el plist y en Capacitor |
| **2.1** iPad sin probar | Obligaba a capturas de iPad y a que funcionara bien ahí | `TARGETED_DEVICE_FAMILY = 1` (solo iPhone) en las dos configuraciones |
| Idioma de la ficha | La ficha tomaba el inglés como idioma base | `CFBundleDevelopmentRegion = pt-BR` |

---

## Lo que tienes que hacer tú

### 1. Pagar el Apple Developer Program

<https://developer.apple.com/programs/enroll> — **99 USD/año, como individuo**. No necesitas
empresa ni número D-U-N-S. Dos cosas que retrasan la aprobación si se hacen mal: **paga con una
tarjeta a tu propio nombre** y usa **tu nombre legal** en la cuenta de Apple, no «Evidentia».

En la App Store aparecerás como *Diego Alejandro Idárraga López*. Es correcto y hasta bueno: un
médico real que responde por el contenido.

**Apenas te aprueben, inscríbete a mano en el Small Business Program.** No es automático. Es la
diferencia entre pagar 15 % o 26 % de comisión.

### 2. Crear la cuenta de revisión

Apple no puede evaluar la app sin entrar. Necesita una cuenta **con suscripción activa** que no
caduque durante la revisión ni en las actualizaciones futuras:

1. Crea la cuenta desde la app con un correo que controles (p. ej. `revisao@…`).
2. Concédele acceso desde el panel: **3650 días**, nota «revisão Apple».
3. En App Store Connect → *Informação para o revisor*, marca **«Requer início de sessão»** y pon
   ese correo y contraseña.

En las notas para el revisor, escribe algo así:

> O aplicativo funciona sem conexão depois de ativado. O acervo reúne 600 questões de seis
> edições das provas objetivas do Revalida, com fonte atribuída ao Inep e cinco adaptações
> editoriais documentadas para apresentação. A Evidentia não tem vínculo com o Inep nem com o
> MEC. As credenciais abaixo dão acesso integral para a revisão.

### 3. Rellenar la etiqueta de privacidad

No pongas «Data Not Collected». La declaración final sale del inventario de datos y de la
política vigente. Como mínimo, revisar y clasificar:

- correo y credenciales de cuenta;
- estado y eventos de compra vinculados al correo;
- plataforma o información técnica enviada al activar/diagnosticar;
- cualquier dato retenido después de eliminar la cuenta.

No declarar salud, ubicación, publicidad o seguimiento si la build realmente no los recoge.
Guardar una captura fechada de la etiqueta enviada y repetir la reconciliación en cada release.

Y pon la URL de la política: `https://idarragaa21-prog.github.io/evidentia-revalida/privacidade/`

### 4. Metadatos de la ficha

Usa la copia, keywords, capturas y campos del checklist versionado en
`produto/METADADOS_LOJAS.md`. La ficha nunca usa «aplicativo oficial», promesa de aprobación,
cobertura total de fuentes ni comparaciones de competidores sin verificación fechada.

---

## Cómo compilar la versión que se envía

```bash
cd ~/evidentia-revalida
python3 scripts/08_montar_aplicativo.py --edicao ios
cp aplicativo/Revalida_Evidentia_ios.html app-android/ios/App/App/public/index.html
cd app-android/ios/App && open App.xcworkspace
```

En Xcode: elige tu equipo de firma, *Product → Archive*, y sube desde el Organizer.

> **Nunca subas la edición `completo` a la App Store.** Esa lleva los botones de compra y es
> rechazo por 3.1.1. La bandera que las separa es `VENDE_AQUI`, y el script aborta si una de las
> frases prohibidas cambia en el modelo sin actualizar la lista — así no se publica por descuido.

Antes de cada envío, comprueba que la build está limpia:

```bash
for f in "assinar/" "compra é feita" "Veja os planos" "Conhecer os planos"; do
  echo "$f: $(grep -c -- "$f" aplicativo/Revalida_Evidentia_ios.html)"
done   # los cuatro deben dar 0
```

---

## Antes de abrir la venta de verdad

**Apaga el modo de evaluación.** Hoy está encendido a 30 días para que tus colegas prueben, así
que **cada cuenta nueva se lleva el producto completo gratis**. No caduca solo:

```sql
select public.definir_modo_avaliacao(0);
```

---

## Decisiones que deben revalidarse antes del envío

- **Compras y activación.** Seguir `produto/CONTRATO_COMPRAS_NATIVAS.md` y comprobar la build
  contra la política vigente de la tienda. No asumir que una comparación con otra empresa prueba
  elegibilidad para una excepción.
- **Manifest y etiqueta de privacidad.** La app ya incluye `App/PrivacyInfo.xcprivacy` con
  correo, identificador de cuenta, historial de compra e información técnica mínima,
  vinculados a la cuenta para funcionalidad y sin tracking. Los pods de Capacitor conservan
  sus manifests propios. La declaración de App Store Connect debe coincidir exactamente con
  este inventario y con la política publicada; una cosa no sustituye la otra.
- **No prometer fecha de publicación antes del 13 de septiembre.** La aprobación de la cuenta no
  tiene plazo publicado por Apple. Ficha publicada realista: octubre.
