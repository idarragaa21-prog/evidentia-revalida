# Metadados e ASO — App Store e Google Play

> A cópia publicável vive em `produto/metadados_lojas.json`. Não copiar texto de planos ou
> README para os consoles. Rode `python3 scripts/24_validar_metadados_lojas.py` antes de enviar.

## Limites verificados

- Apple: nome e subtítulo até 30 caracteres; texto promocional até 170; descrição até 4.000;
  palavras-chave até 100 bytes. A URL de suporte precisa levar a contato real.
- Google Play: nome até 30 caracteres; descrição curta até 80; completa até 4.000.

Fontes oficiais consultadas em 8 de agosto de 2026:

- <https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/>
- <https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/>
- <https://support.google.com/googleplay/android-developer/answer/9859152>
- <https://support.google.com/googleplay/android-developer/answer/13393723>
- <https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/>
- <https://support.google.com/googleplay/android-developer/answer/9866151>

Os consoles mostram o contador definitivo; confirmar os limites outra vez no dia do envio.

## Posicionamento

Termos principais: simulados, questões comentadas, estudo para Revalida e funcionamento
offline. O nome já contém “Revalida”, então a lista de keywords da Apple não o repete.

Não usar:

- “aplicativo oficial”, “do INEP” ou elementos visuais que sugiram afiliação;
- “fonte em cada questão”, “100% referenciado” ou “palavra por palavra”;
- “garantia de aprovação”, ranking, depoimento sem permissão ou preço promocional;
- nomes de concorrentes nas keywords ou na descrição;
- datas, preços e números externos que ficam obsoletos.

## Especificação atual das capturas

Verificada em 8 de agosto de 2026:

- **Apple:** de uma a dez imagens JPEG/JPG/PNG, sem transparência. Para iPhone 6,9″ em retrato,
  o App Store Connect aceita 1260 × 2736, 1290 × 2796 ou 1320 × 2868 px. Se a build continuar
  compatível com iPad, preparar também o conjunto obrigatório de 13″ em 2064 × 2752 ou
  2048 × 2732 px. Confirmar no Media Manager antes de exportar.
- **Google Play:** mínimo de duas capturas; para elegibilidade nas superfícies de recomendação,
  usar pelo menos quatro em 1080 × 1920 px (9:16) ou 1920 × 1080 px (16:9). JPEG ou PNG de
  24 bits, sem alpha. A feature graphic obrigatória mede 1024 × 500 px.
- Produzir **seis retratos 9:16** como conjunto mestre. Capturar separadamente na build iOS e
  Android: não reutilizar uma barra de sistema ou fluxo de compra da outra plataforma.

## Roteiro e texto exato

Cada captura mostra a interface real da build enviada, sem moldura enganosa nem informação de
preço. Localizar o texto para pt-BR. A fonte canônica desses textos é
`produto/metadados_lojas.json > capturas_lojas`; não editar diretamente no arquivo gráfico.

| Ordem | Tela real | Título | Subtítulo verificável |
|:--:|:--|:--|:--|
| 1 | início e filtros | **Monte seu simulado** | Filtre por edição ou área e estude no seu ritmo. |
| 2 | questão | **600 questões de seis edições** | Treine com questões de 2023/1 a 2026/1. |
| 3 | modo estudo | **Entenda cada alternativa** | Justificativa estruturada em todas as questões. |
| 4 | revisão com fonte | **Cobertura transparente** | 526 questões têm referências catalogadas; 74 aparecem sem. |
| 5 | resultado | **Acompanhe seu desempenho** | Resultados e histórico ficam salvos no aparelho. |
| 6 | conta/offline | **Continue estudando offline** | Após ativar, use sem conexão por até 30 dias por vez. |

Feature graphic do Google Play: **“Estudo com evidência”** / “Simulados e questões comentadas
para o Revalida”. Não incluir preço, desconto, CTA, ranking, selo de loja ou logotipo do INEP.

Antes de exportar:

- [ ] barra de status sem dados pessoais ou notificações;
- [ ] nenhuma marca do INEP/MEC além de atribuição textual necessária;
- [ ] sobreposição textual ocupa menos de 20% da captura e não cobre controles importantes;
- [ ] contraste, tamanho e ortografia revisados;
- [ ] telas correspondem exatamente à versão e ao aparelho declarados;
- [ ] nenhuma promessa de compra, e-mail ou atualização ausente da build.
- [ ] seis `alt_text` do JSON conferidos, com no máximo 140 caracteres;
- [ ] iOS mostra somente compra Apple; Android mostra somente compra Google Play;
- [ ] arquivo final sem alpha, orientação correta e dimensões aceitas pelo console;

## Campos operacionais

- Categoria primária: **Educação**.
- Política de privacidade: URL versionada no JSON.
- Exclusão de conta no Google Play: usar `google_play.url_exclusao_conta`; a página oferece
  o caminho dentro do app e uma solicitação web para quem perdeu o acesso.
- Suporte: URL com e-mail real e instruções; testar sem sessão iniciada.
- Direitos de conteúdo: responder apenas depois do dictamen jurídico e guardar a evidência.
- Classificação etária e eventual declaração de conteúdo médico: responder o questionário com a
  build aberta; não inferir uma classificação neste documento.
- App Review: conta integral que não expire, contato de revisão e fluxo de compras descrito conforme
  `produto/CONTRATO_COMPRAS_NATIVAS.md`.
- Google Play Data safety e Apple App Privacy: reconciliar com o inventário real de rede e retenção.

## Checklist ASO posterior al lanzamiento

- [ ] Registrar impresión de producto → visita → instalación/activación solo con métricas permitidas.
- [ ] Comparar conversión por localización, sin cambiar múltiples elementos a la vez.
- [ ] Revisar consultas reales antes de añadir keywords; no practicar repetición artificial.
- [ ] Responder reseñas sin pedir datos personales públicamente.
- [ ] Revalidar toda cifra del acervo al actualizar `scripts/metricas_produto.json`.
