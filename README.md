# Hub

## Objetivo

> **A preencher:** cola aqui o objetivo do Hub (o texto que está nas instruções do projeto).

## Onde está

- **Site:** https://hub.discovercasa.pt
- **Cloudflare Pages:** projeto `discoversites` (https://discoversites.pages.dev)
- **Supabase:** projeto **Sites** (região eu-west-1), partilhado por todos os sites da plataforma.

## Papéis e permissões

| | ADMIN | Administrador | Obra | Subempreiteiro | Cliente |
|---|---|---|---|---|---|
| Criar e gerir contas | Todas | Todas exceto ADMIN | — | — | — |
| Obras que vê | Todas | Todas | Atribuídas | Atribuídas | A dele |
| Fase e fotos | Ver e editar | Ver e editar | Ver e carregar | Ver e carregar | Ver |
| Lista de materiais | Ver e editar | Ver e editar | Ver | A parte dele | — |
| Preços e custos | Ver e editar | Ver e editar | — | — | — |
| Orçamento final | Ver e editar | Ver e editar | — | — | Ver |
| Mapa de obras | Todas | Todas | Atribuídas | Atribuídas | — |
| Dados pessoais da equipa | Ver e editar | Ver e editar | — | — | — |
| Férias e ausências | Todos, aprovar | Todos, aprovar | As suas, pedir | As suas, pedir (se tiver ficha) | — |

## Contas

- Só ADMIN e Administrador criam contas, no separador **Colaboradores**.
- Cada conta tem nome, utilizador, email, tipo de utilizador e palavra-passe.
- Entra-se com o utilizador **ou** com o email.
- O registo público tem de estar desligado no Supabase (Authentication → "Allow new users to sign up").

## Equipa

- Em **Colaboradores → Equipa**: ficha de cada colaborador (identificação, contactos, trabalho, documentos). Só ADMIN e Administrador.
- Cada colaborador tem conta; cria-se a partir da ficha ("Criar conta"). Sem email próprio, usa-se `<utilizador>@equipa.discovercasa.pt`.
- Documentos a expirar nos próximos 31 dias aparecem como alertas no Início.

## Férias

- Separador **Férias**. ADMIN e Administrador: mapa mensal, pedidos, saldos e feriados. Cada colaborador com ficha: "As minhas férias" (saldo e pedidos).
- Saldo: 22 dias por ano (ajustável) + transitados; descontam férias pessoais e Férias Discovercasa aprovadas, em dias úteis.

## Obras

- Separador **Obras** no Hub: lista de todas as obras (cada pessoa vê as suas) e ficha de cada uma.
- Só ADMIN e Administrador criam, editam e apagam obras e escolhem os membros.
- O cliente é uma conta do tipo Cliente; ao ser escolhido passa a membro da obra.
- Campos por tipo: Subempreiteiro não vê cliente, notas nem membros; Cliente vê a obra e os seus dados, sem notas.

## Google Drive

- Conta `discoversebastiao@gmail.com`, pasta **Discovercasa Sites / Obras**. Cada obra tem `<código · nome>/Documentos` e `/Fotografias`.
- Ligação feita uma vez por um ADMIN (página Obras → "Ligar Google Drive"). As credenciais (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) estão nos Secrets do Supabase; nunca no código.
- Funções do servidor: `supabase/functions/drive` (pastas e ficheiros) e `supabase/functions/drive-ligar` (regresso da autorização Google).
- Quem vê cada pasta decide-se no Hub ("Quem vê"), não na Drive. Ninguém precisa de conta Google.

## Abas da obra

- **Início** (ficha e resumo) · **Projeto** · **Mapa** (em breve) · **Documentos** e **Fotos** (Google Drive, v0.7) · **Entregas** · **Pedidos**.
- Entregas: registam ADMIN, Administrador e Obra; Subempreiteiro vê; Cliente não vê.
- Pedidos e falhas: qualquer membro cria e responde; fecham ADMIN/Administrador ou quem criou. Fotografias guardadas em privado no Supabase.

## Checklist

- **Estrutura comum:** fases → títulos → checks → subchecks. O que se acrescenta aparece em todas as obras.
- **Por obra:** os checks marcados, quem e quando, o responsável, o que está escondido e com quem se partilhou.
- **Quem vê:** cada fase ou item pode ficar restrito a tipos de utilizador e/ou colaboradores (vazio = todos). ADMIN e Administrador veem tudo. Quem não pode ver um item não o recebe da base de dados.
- **Quem edita:** só ADMIN e Administrador (botão "Editar estrutura"). Quem vê um check pode marcá-lo.

## Como está construído

O Hub é um site estático, sem passo de build.

| Peça | Onde | Para quê |
|---|---|---|
| Interface | `public/index.html` | Página única: HTML, CSS e JS no mesmo ficheiro. |
| Dados e login | Supabase | Base de dados Postgres com RLS: cada utilizador só vê os seus dados. |
| Ligação ao Supabase | `public/js/plataforma-core.js` | Cria o cliente Supabase com a chave **pública**. Nada privado no código. |
| Gestão de contas | `supabase/functions/gerir-contas` | Edge Function: só ela cria contas e muda tipos. Lê a chave de serviço do ambiente do Supabase. |
| Base de dados | `supabase/migrations/*.sql` | Tabelas e políticas RLS, por ordem. |
| Publicação | Cloudflare Pages | Publica a pasta `public/` a cada push para `main`. |
| Testes | `tests/regressao.cjs` | Garantem que as Decisões fixas continuam válidas. |

## Como tudo funciona

1. Cada alteração segue o processo descrito em `CLAUDE.md`.
2. Os planos de versões estão em `ROADMAP.md`.
3. Cada alteração feita fica registada em `PATCH NOTES.md`, juntamente com as **Decisões fixas** (regras que não se quebram sem confirmação).
4. A versão visível na app (`APP_VERSAO`) e a lista `NOVIDADES` em `public/index.html` acompanham sempre o topo do Histórico das Patch Notes. Os testes verificam isto.

### Versões

- `v0.1`, `v0.2`… correspondem a versões do roadmap.
- `v0.1a`, `v0.1b`… são alterações pedidas entre versões.

### Correr os testes

```bash
NODE_PATH=$(npm root -g) node tests/regressao.cjs
```

Tem de terminar com **0 falhas**.

### Publicação no Cloudflare Pages

- O Hub é uma só página com endereços como `/obras/<id>/pedidos`. Como não há `404.html`, a Cloudflare devolve o `index.html` para qualquer endereço e o Hub abre o separador certo.

- Repositório ligado: este repo, ramo `main`.
- Build command: *(vazio)*.
- Build output directory: `public`.
- Projeto: `discoversites` (tipo **Pages**, não Worker).
- Custom domain: `hub.discovercasa.pt`.

### DNS

O DNS do `discovercasa.pt` é gerido no **cPanel** (Zone Editor), não na Cloudflare.
O subdomínio aponta para o Pages com um registo CNAME:

| Nome | Tipo | Destino |
|---|---|---|
| `hub` | CNAME | `discoversites.pages.dev` |

## Estrutura

```
.
├── CLAUDE.md          instruções e regras para o Claude
├── README.md          este ficheiro
├── ROADMAP.md         plano de versões
├── PATCH NOTES.md     histórico de alterações + Decisões fixas
├── package.json
├── public/
│   ├── index.html     a app inteira: entrada e todos os separadores (APP_VERSAO, NOVIDADES)
│   ├── css/hub.css    estilos comuns
│   ├── js/hub.js      cabeçalho, sessão e utilitários comuns
│   ├── js/obras.js    separador Obras (lista, ficha, abas)
│   ├── js/obra-abas.js abas Projeto, Entregas e Pedidos
│   ├── js/drive.js    abas Documentos e Fotos (Google Drive)
│   ├── js/checklist.js separador Checklist
│   ├── js/colaboradores.js separador Colaboradores → Equipa
│   ├── js/ferias.js   separador Férias
│   ├── _redirects     /checklist.html → /checklist
│   ├── js/plataforma-core.js
│   └── img/           logótipos e favicon
├── supabase/
│   ├── migrations/    SQL das tabelas e políticas RLS
│   └── functions/     Edge Functions (gerir-contas, drive, drive-ligar)
└── tests/
    └── regressao.cjs  testes de regressão
```
