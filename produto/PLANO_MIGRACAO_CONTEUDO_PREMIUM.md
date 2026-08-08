# Plano de migração do conteúdo premium

Estado auditado: `HEAD 5a90f9f`. Este documento registra a exposição encontrada
e o procedimento prospectivo. Nenhuma visibilidade remota foi alterada, nenhum
serviço foi implantado e o histórico Git não foi reescrito.

## Evidência no HEAD auditado

O `HEAD` rastreava 29 arquivos proibidos, somando 12.223.396 bytes:

| Grupo | Evidência exata no HEAD | Exposição |
|---|---|---|
| Bundle premium | `aplicativo/Revalida_Evidentia_ios.html` (5.700.561 bytes) | `META.total=600`, `edicao_app=ios`, 600 objetos em `QUESTOES` |
| Corpus consolidado | `dados/banco_400_questoes.json` (1.157.115 bytes) | 600 questões completas; o nome histórico “400” não corresponde ao conteúdo |
| Bancos de prova | `dados/banco_2024_2.json`, `dados/bruto_2025_1.json`, `dados/bruto_2026_1.json` | três bancos de 100 itens |
| Justificativas | `dados/justificativas/2023-1.json` até `2026-1.json` | seis arquivos de 100 justificativas |
| Classificação e gabaritos | `dados/classificacao_2025_1.json`, `dados/classificacao_2026_1.json`, `dados/gabarito_2025_1.json`, `dados/gabarito_2026_1.json` | classificação editorial e respostas estruturadas |
| Figuras e referências | `dados/figuras.json`, `dados/figuras_2026_1.json`, `dados/referencias.json`, `dados/fontes_por_tema.json` | 30 + 4 figuras, 319 referências e 331 mapeamentos temáticos |
| Artefatos editoriais auxiliares | `dados/algoritmos.json`, `dados/algoritmos_svg.json`, `dados/cifras_fontes_2024_2.json`, `dados/glifos_ambiguos_2024_2.json` | algoritmo didático, SVG e dados de reconstrução |
| Fontes que incorporam conteúdo | `scripts/justificativas_2024_2/*.py` e `scripts/tabelas_2024_2.py` | quatro blocos de justificativas e tabelas transcritas do caderno |
| Gabaritos embutidos | `scripts/verificar_gabaritos.py` (2.269 bytes) | 400 respostas oficiais de 2023/1 a 2024/2 codificadas em quatro sequências |

Há ainda duas amostras públicas de 40 questões, deliberadamente mantidas:
`aplicativo/Revalida_Evidentia_livre.html` (619.819 bytes no HEAD) e
`app-web/index.html` (616.675 bytes no HEAD).

No mesmo `HEAD`, `AVISO_DE_CONTEUDO.md` declarava sob MIT a organização dos
dados, a classificação e as justificativas próprias. A licença não concedia
direitos sobre as questões e figuras do INEP, mas a combinação do bundle
completo rastreado com a concessão sobre as camadas editoriais permitia copiar
o produto e reutilizar seus componentes próprios. A nova separação de licenças
é expressamente prospectiva: não apaga o histórico nem revoga autorizações já
concedidas sobre revisões anteriores.

## Estado local preparado

- Os 29 arquivos proibidos deixam de ser rastreados mediante
  `git rm --cached`; continuam fisicamente nos mesmos caminhos da máquina de
  trabalho e passam a ser ignorados por `.gitignore`. Em `dados/`, somente
  `favicon_b64.txt` e `logo_b64.txt` permanecem na lista pública permitida.
- `scripts/25_verificar_conteudo_publico.py` falha se um dado JSON, uma fonte
  editorial, um bundle conhecido ou um HTML renomeado com mais de 40 questões
  entrar no índice.
- `.github/workflows/seguranca-conteudo-publico.yml` executa esse gate em cada
  `push` e `pull_request`.
- `LICENSE`, `LICENSE-CODE`, `CONTENT_LICENSE.md` e
  `AVISO_DE_CONTEUDO.md` separam código, conteúdo editorial próprio e material
  de terceiros.

## Operação recomendada

1. **Criar uma cópia de segurança privada e cifrada.** Antes do primeiro
   commit que remova os arquivos do índice, copiar os 29 arquivos locais para
   armazenamento controlado e conferir hashes. Não usar artefatos públicos de
   Actions como cópia de segurança.
2. **Publicar somente a remoção prospectiva.** Revisar o `git diff --cached`,
   confirmar que cada exclusão é apenas do índice e criar um commit dedicado.
   Isso não remove blobs de commits anteriores.
3. **Privatizar a fonte editorial.** Criar um repositório privado novo, sem
   importar o histórico público, e adicionar ali os arquivos hoje ignorados
   conservando sua estrutura de diretórios. Restringir acesso por função,
   exigir MFA e impedir forks públicos.
4. **Mover build e validação editorial para CI privado.** Os jobs que leem
   `dados/*.json` ou geram as edições completas/livres devem rodar no
   repositório privado. O repositório público pode validar código e publicar a
   amostra livre já aprovada, mas não deve baixar o corpus de um endereço
   público nem registrá-lo em logs ou caches compartilhados.
5. **Distribuir somente binários assinados.** Gerar iOS/Android no ambiente
   privado e entregar pela App Store/Google Play. Não anexar o HTML completo a
   releases, Pages, issues, PRs ou artefatos de CI com acesso público.
6. **Ativar proteção de branch.** Tornar obrigatório o status
   `Bloquear bundles e dados premium` antes de mergear ou publicar. Restringir
   bypasses e revisar alterações em `.gitignore`, no gate e nas licenças.
7. **Escolher estratégia para a exposição histórica.** Como os blobs antigos
   continuam acessíveis no repositório público, a mitigação comercial forte é
   tornar esse repositório privado ou substituí-lo por um repositório público
   novo e limpo contendo somente código/amostra. Isso exige decisão do titular
   e não foi executado nesta intervenção. Se houver necessidade jurídica de
   remover histórico, planejar a reescrita e a invalidação de clones/forks com
   assessoria apropriada; não apresentar isso como revogação retroativa da MIT.
8. **Revisar direitos do material INEP.** A separação técnica não concede
   autorização para comercializar conteúdo de terceiros. Confirmar a base
   jurídica e os termos aplicáveis antes do lançamento.

## Comandos de auditoria reproduzíveis

```sh
git rev-parse --short HEAD
git ls-tree -r -l HEAD -- aplicativo dados scripts/justificativas_2024_2 scripts/tabelas_2024_2.py scripts/verificar_gabaritos.py
git show HEAD:AVISO_DE_CONTEUDO.md
python3 scripts/25_verificar_conteudo_publico.py --self-test
python3 scripts/25_verificar_conteudo_publico.py
```
