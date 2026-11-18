# L — Barra lateral em seções com abas

Data: 18/11/2026 · Aprovado pelo usuário no chat · Branch: `melhorias/piloto`

## Objetivo
A barra lateral da gestão tem 11 itens soltos e vão entrar Cupons (peça M) e Financeiro (peça N). Ela passa a ter 6 seções; telas relacionadas viram abas dentro da seção. É só reorganização: o conteúdo das telas não muda e não há migration.

## Seções
| Seção (barra) | Ícone | Abas (chave atual da página) |
|---|---|---|
| Visão geral | LayoutDashboard | — (`resumo`) |
| Pedidos | ShoppingBag | — (`pedidos`) |
| Cardápio | Utensils | Produtos (`produtos`), Opcionais (`opcionais`), Categorias (`categorias`), QR das mesas (`qr`) |
| Clientes | Users | Clientes (`contatos`), Avaliações (`avaliacoes`) |
| Relatórios | BarChart3 | Resultados (`resultados`), Métricas (`metricas`) |
| Configurações | Settings | — (`configuracoes`) |

## Comportamento
- O estado continua sendo a chave da página (`page`). A seção ativa é derivada da página; nenhuma chamada existente a `setPage(...)` muda.
- Clicar numa seção com abas abre a última aba usada nessa seção nesta sessão do navegador (memória em estado React; na primeira vez, a primeira aba da tabela).
- As abas aparecem logo abaixo do `.page-heading`, como pílulas (`role="tablist"`, cada aba `role="tab"` com `aria-selected`; setas esquerda/direita movem o foco). A aba ativa usa `--brand`/`--brand-contrast`; as demais `--surface-2`/`--text`. No celular a fileira rola na horizontal sem quebrar linha.
- O título da página (`.page-heading h1`) continua mostrando o nome da tela (aba), não da seção.
- Permissões: quem não é dono continua vendo só Visão geral e Pedidos. Uma seção só aparece se o usuário puder ver pelo menos uma das suas abas; uma aba só aparece se ele puder ver aquela página (mesma regra de hoje, `owner || página permitida`).
- A tabela de seções fica num módulo puro (`src/lib/admin-sections.ts`) com testes: cada página pertence a exatamente uma seção, `sectionOf(page)`, `visibleSections(isOwner)`.

## Fora de escopo
Mudar o conteúdo das telas, rotas/URLs, o rodapé da barra (modo, ver cardápio, sair), a demo `/demo/gestao` (outro componente).

## Testes
Unitário do módulo de seções; capturas da gestão (desktop 1280×800 e celular 390×844, claro e escuro) com a barra e as abas; `tsc`, `lint`, `test:online`, `build`.
