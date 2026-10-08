# Roadmap

Estado: ✅ feita · 🔜 próxima · 📝 planeada

Cada versão nova do roadmap é registada em `PATCH NOTES.md` e marcada aqui como ✅.

## ✅ v0.0 — Estrutura inicial
- Documentos base: README, ROADMAP, PATCH NOTES, CLAUDE.
- `public/index.html` com `APP_VERSAO` e `NOVIDADES`.
- Testes de regressão para as Decisões fixas.
- Publicação no Cloudflare Pages a partir de `main`.

## 🔜 v0.1 — Ligação ao Supabase
- Carregar o `plataforma-core` e obter o cliente Supabase (só chave pública).
- Login e logout.
- Acrescentar `https://home.discovercasa.pt` ao Site URL e aos Redirect URLs da autenticação do Supabase.
- Primeira tabela com RLS (`user_id = auth.uid()`).

## 📝 v0.2 — Primeira funcionalidade do Hub
- *A definir com o Sebastião, a partir do objetivo.*

## Próximos passos (sem versão atribuída)
- Preencher o objetivo no README.
- Confirmar como o `plataforma-core` é carregado (URL/ficheiro).
