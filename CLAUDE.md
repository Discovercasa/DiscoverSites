# Instruções para o Claude

Projeto do Sebastião. Responder em português de Portugal.

## Processo obrigatório em cada alteração

1. **Perguntar antes de alterar ou começar uma versão.** O Sebastião prefere clarificar primeiro.
2. **Ler `PATCH NOTES.md` → "Decisões fixas"** e confirmar que o pedido não contraria nenhuma. Se contrariar (ou uma versão nova do `ROADMAP.md` o fizer), avisar e pedir confirmação antes de mexer. Se ele confirmar, atualizar a decisão.
3. **Implementar.**
4. **Correr os testes:**
   ```bash
   NODE_PATH=$(npm root -g) node tests/regressao.cjs
   ```
   Tem de dar **0 falhas**. Uma falha = uma decisão fixa quebrada: corrigir, ou avisar se a mudança foi pedida (e então atualizar o teste e a decisão).
5. **Registar no `PATCH NOTES.md`** (nova entrada no topo do Histórico):
   - alteração pedida entre versões → letra seguinte (`v0.7h` → `v0.7i`);
   - nova versão do roadmap → `v0.8`, `v0.9`… (e marcar no `ROADMAP.md`).
   - Se o pedido criar uma regra nova ("quero sempre…", "nunca…"), acrescentá-la às Decisões fixas e, se possível, um teste.
6. **Atualizar `APP_VERSAO`** e acrescentar a versão no topo de `NOVIDADES` em `public/index.html`. Texto para o utilizador, em dois grupos: `novas` (novas funcionalidades) e `alteracoes` (alterações). Frases curtas.
7. **Commit + push para `main`:**
   ```bash
   git fetch && git rebase origin/main
   git add -A && git commit -m "vX.Y: resumo" && git push origin main
   ```
   Depois, **verificar o site publicado** no Cloudflare Pages (a versão no rodapé tem de ser a nova).

## Regras

- **Nunca credenciais privadas no código** (só a chave pública do Supabase, via `plataforma-core`). Nada de `service_role`, passwords, tokens ou ficheiros `.env` no repositório.
- **Dados do utilizador só dele (RLS).** Todas as tabelas novas em `supabase/migrations/` com `enable row level security` e políticas com `auth.uid()`.
- Manter a app num único `public/index.html` enquanto for simples; propor divisão antes de a fazer.
- Não acrescentar dependências sem perguntar.
