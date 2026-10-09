# Patch Notes

## Decisões fixas

Regras que não se alteram sem confirmação do Sebastião. Cada uma tem, sempre que possível, um teste em `tests/regressao.cjs` (indicado entre parênteses).

1. **Nunca credenciais privadas no código.** Só a chave pública do Supabase, obtida através do `plataforma-core`. (D1)
2. **Dados do utilizador só dele.** Todas as tabelas têm RLS ativo, com políticas limitadas ao próprio utilizador. (D2)
3. **A versão da app acompanha as Patch Notes.** `APP_VERSAO` em `public/index.html` é igual à primeira versão do Histórico. (D3)
4. **As novidades acompanham a versão.** A primeira entrada de `NOVIDADES` é a versão atual, com os grupos "novas funcionalidades" e "alterações". (D4)
5. **Site estático em `public/`**, publicado pelo Cloudflare Pages a partir de `main`. (D5)
6. **Interface em português de Portugal.** (D6)
7. **O Hub vive em `https://hub.discovercasa.pt`** (Cloudflare Pages `discoversites`, CNAME no cPanel) e usa o projeto Supabase **Sites**, partilhado pelos sites da plataforma. (D7)
8. **Contas só criadas por ADMIN ou Administrador**, pela Edge Function `gerir-contas`. Sem registo público (o "sign up" está desligado no Supabase); cada utilizador tem a sua palavra-passe. (D8)
9. **5 papéis com a matriz de permissões do README.** O Cliente nunca vê custos nem preços; Obra também não. (D9)
10. **Dados pessoais da equipa** (NIF, CC, IBAN, saúde) só visíveis para ADMIN e Administrador. (teste quando as tabelas existirem)
11. **PINs de cartões não são guardados** na plataforma. (D11)
12. **Ordem do roadmap: Base → Equipa → Obras → Custos.**
13. **O tipo de utilizador só muda pelo servidor.** Um trigger em `profiles` bloqueia alterações diretas a `papel`, `role`, `utilizador` e `ativo`; um Administrador não cria nem altera contas ADMIN; ninguém muda o próprio tipo. (D13)

## Histórico

### v0.1 — 2026-10-09
- Novo visual Discovercasa: logótipo, amarelo `#ffcd34`, cinzento `#333`, fundo `#f4f4f2`, letra Barlow / Barlow Condensed.
- Ecrã de entrada (utilizador ou email + palavra-passe), menu inicial e separadores Início, Colaboradores e Novidades.
- `public/js/plataforma-core.js`: cliente Supabase com a chave pública.
- Base de dados (migração `0001_papeis_e_contas`): colunas `papel`, `utilizador`, `ativo` em `profiles`; funções `listar_contas`, `email_para_login`, `eh_gestor`; trigger que protege o papel e o mantém em sincronia com a checklist antiga.
- Correção de segurança: antes, qualquer utilizador podia alterar o próprio papel.
- Contas atuais: `sebastiao` e `discovercasa2010` → ADMIN; `discoversebastiao` → Administrador.
- Edge Function `gerir-contas`: criar contas, mudar tipo, palavra-passe e estado.
- Roadmap: v0.2–v0.4 originais absorvidas pela v0.1; versões seguintes renumeradas.
- Decisão fixa 13 e teste D13; teste D1 ajustado para permitir que as Edge Functions leiam a chave de serviço do ambiente.

### v0.0c — 2026-10-09
- Roadmap definido em 4 blocos (Base → Equipa → Obras → Custos), a partir dos Excels de materiais e de horários/GPS.
- O site existente da checklist (tabelas `obras`, `fases`, `items`…) passa a fazer parte do Hub.
- Papéis atuais: `discovercasa2010` e `sebalca5` → ADMIN; o terceiro → Administrador (aplicado na v0.2).
- README: matriz de papéis e permissões.
- Novas Decisões fixas 8 a 12; testes D8, D9 e D11.

### v0.0b — 2026-10-08
- Subdomínio mudado de `home` para `hub.discovercasa.pt` (pedido do Sebastião; Decisão fixa D7 atualizada).
- Site publicado como Cloudflare **Pages** (`discoversites.pages.dev`) em vez de Worker, para aceitar o CNAME do cPanel.
- README: secção de DNS (CNAME `hub` → `discoversites.pages.dev`).
- ROADMAP: Redirect URLs da v0.1 com o novo domínio; nota sobre migrar o DNS para a Cloudflare.
- Teste D7 atualizado.

### v0.0a — 2026-10-08
- Domínio do Hub definido: `home.discovercasa.pt` (Cloudflare Pages, Custom domain).
- Projeto Supabase definido: **Sites**.
- Nova Decisão fixa D7, com teste (`link rel="canonical"` no `index.html`).
- README e ROADMAP atualizados.

### v0.0 — 2026-10-08
- Criada a estrutura do Hub: README, ROADMAP, PATCH NOTES, CLAUDE.
- Criados `public/index.html` (com `APP_VERSAO` e `NOVIDADES`), `package.json` e `tests/regressao.cjs`.
- Definidas as Decisões fixas D1 a D6, com testes.
- Pasta `supabase/migrations/` preparada para o SQL das tabelas.
