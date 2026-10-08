# Hub

## Objetivo

> **A preencher:** cola aqui o objetivo do Hub (o texto que está nas instruções do projeto).

## Onde está

- **Site:** https://hub.discovercasa.pt
- **Cloudflare Pages:** projeto `discoversites` (https://discoversites.pages.dev)
- **Supabase:** projeto **Sites** (região eu-west-1), partilhado por todos os sites da plataforma.

## Como está construído

O Hub é um site estático, sem passo de build.

| Peça | Onde | Para quê |
|---|---|---|
| Interface | `public/index.html` | Página única: HTML, CSS e JS no mesmo ficheiro. |
| Dados e login | Supabase | Base de dados Postgres com RLS: cada utilizador só vê os seus dados. |
| Ligação ao Supabase | `plataforma-core` | Fornece o URL e a chave **pública** (anon) do Supabase. Nada privado no código. |
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
│   └── index.html     a app (APP_VERSAO, NOVIDADES)
├── supabase/
│   └── migrations/    SQL das tabelas e políticas RLS
└── tests/
    └── regressao.cjs  testes de regressão
```
