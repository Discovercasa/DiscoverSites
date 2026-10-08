# Patch Notes

## Decisões fixas

Regras que não se alteram sem confirmação do Sebastião. Cada uma tem, sempre que possível, um teste em `tests/regressao.cjs` (indicado entre parênteses).

1. **Nunca credenciais privadas no código.** Só a chave pública do Supabase, obtida através do `plataforma-core`. (D1)
2. **Dados do utilizador só dele.** Todas as tabelas têm RLS ativo, com políticas limitadas ao próprio utilizador. (D2)
3. **A versão da app acompanha as Patch Notes.** `APP_VERSAO` em `public/index.html` é igual à primeira versão do Histórico. (D3)
4. **As novidades acompanham a versão.** A primeira entrada de `NOVIDADES` é a versão atual, com os grupos "novas funcionalidades" e "alterações". (D4)
5. **Site estático em `public/`**, publicado pelo Cloudflare Pages a partir de `main`. (D5)
6. **Interface em português de Portugal.** (D6)
7. **O Hub vive em `https://home.discovercasa.pt`** e usa o projeto Supabase **Sites**, partilhado pelos sites da plataforma. (D7)

## Histórico

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
