# Runbook: publicar en la App Store

> Para Diego. Los ocho motivos por los que Apple habría rechazado la app están
> **resueltos en el código**. Lo que queda aquí es lo que exige tu identidad o tu tarjeta.
> Escrito el 2026-08-06, tras auditar el proyecto contra las App Store Review Guidelines.

---

## Lo que ya está resuelto (no tienes que hacer nada)

| Guideline | Qué habría pasado | Cómo quedó |
|:--|:--|:--|
| **3.1.1** Pagos externos | Rechazo seguro: la app llevaba a comprar en la web, y hasta *decir dónde se compra* está prohibido | Edición iOS propia (`--edicao ios`) sin botones **y sin las frases**, borradas del archivo. Verificado: cero coincidencias de «compra», «planos» o la URL en el binario |
| **5.1.1(v)** Borrar cuenta | Rechazo automático: se podía crear cuenta pero no borrarla | **Conta → Excluir minha conta**, con doble confirmación. Probado de punta a punta: la cuenta desaparece y el login deja de funcionar |
| **5.1.1** Privacidad | Rechazo por declaración inexacta: la app decía «Nada é enviado para servidores» y la edición de pago envía correo y contraseña | El texto ahora dice la verdad y depende de la edición. Enlaza la política |
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

> O aplicativo funciona sem conexão depois de ativado. As questões são da prova objetiva do
> Revalida (Inep), conteúdo público sob licença CC BY-ND 3.0, reproduzidas sem alteração e com
> atribuição. A Evidentia não tem vínculo com o Inep. A assinatura é vendida fora do aplicativo
> e este binário não a oferece nem a menciona.

### 3. Rellenar la etiqueta de privacidad

En App Store Connect, declara exactamente esto — **no pongas «Data Not Collected»**, porque el
binario contiene llamadas de registro y se detecta:

- **Contact Info → Email Address**: recogido, **vinculado a la identidad**, finalidad *App
  Functionality*. No usado para seguimiento.
- Nada más. Ni identificadores de publicidad, ni ubicación, ni datos de salud.

Y pon la URL de la política: `https://idarragaa21-prog.github.io/evidentia-revalida/privacidade/`

### 4. Metadatos de la ficha

- **Nombre**: Evidentia Revalida
- **Subtítulo**: *Questões oficiais comentadas* — **nunca** «oficial» ni «do Inep»
- **Descripción**: repite en las primeras líneas que no hay vínculo con el INEP ni con el MEC
- **Capturas**: sin logotipo ni colores institucionales del INEP
- **Categoría**: Educação

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

## Lo que decidimos NO hacer, y por qué

- **No implementar pagos de Apple (StoreKit).** Son semanas de trabajo más 15-30 % de comisión
  sobre cada venta. La ruta elegida —app sin mención a la compra, venta en la web— es la misma
  que usan Netflix y Spotify, y es legítima (excepción 3.1.3(b), *Multiplatform Services*).
- **No añadir `PrivacyInfo.xcprivacy`.** Los pods de Capacitor ya traen el suyo y tú no tienes
  código nativo propio que declarar. Lo obligatorio es la etiqueta en App Store Connect.
- **No prometer fecha de publicación antes del 13 de septiembre.** La aprobación de la cuenta no
  tiene plazo publicado por Apple. Ficha publicada realista: octubre.
