# Roadmap

Estado: ✅ feita · 🔜 próxima · 📝 planeada

Cada versão nova do roadmap é registada em `PATCH NOTES.md` e marcada aqui como ✅.
Ordem dos blocos: **Base → Equipa → Obras → Custos**.

## ✅ v0.0 — Estrutura inicial
- Documentos base, `public/index.html` com `APP_VERSAO` e `NOVIDADES`, testes, Cloudflare Pages.

---

## Bloco 1 — Base

### ✅ v0.1 — Entrada, menu inicial e contas
- Visual Discovercasa (logótipo, amarelo, cinzento escuro, Barlow).
- Entrada com utilizador **ou** email e palavra-passe; sem registo público.
- Menu inicial e separadores por tipo de utilizador.
- 5 tipos de utilizador na base de dados (`profiles.papel`), sincronizados com a checklist antiga (`role`).
- Separador **Colaboradores**: criar contas, mudar tipo, redefinir palavra-passe, ativar/desativar (Edge Function `gerir-contas`).
- O tipo de utilizador já não pode ser alterado pelo próprio (correção de segurança).

---

## Bloco 2 — Equipa

### 🔜 v0.2 — Ficha de colaborador
- Acrescentar à conta a ficha do colaborador; dados pessoais (NIF, CC, IBAN, aptidão médica) só para ADMIN e Administrador.
- Alertas de documentos a expirar (carta, CC, aptidão médica).

### 📝 v0.3 — Férias e ausências
- Mapa anual (férias, faltas, teletrabalho, feriados…).

### 📝 v0.4 — Horas extra
- Registo por obra e colaborador; estado pago / não pago; totais.

### 📝 v0.5 — Veículos e deslocações
- Veículos com alertas (revisão, inspeção, seguro, IUC); registo de deslocações; gasóleo.
- PINs de cartões **não** são guardados.

---

## Bloco 3 — Obras

### 📝 v0.6 — Obras
- Obra com código, local e cliente; membros por obra (`obra_membros`).
- Integrar no Hub a checklist existente (fases e itens).

### 📝 v0.7 — Fase, fotos e vídeos
- Fase atual da obra; fotos e vídeos (decidir armazenamento: Supabase ou R2).
- Cliente vê a fase e as fotos da obra dele.

### 📝 v0.8 — Mapa de obras

---

## Bloco 4 — Custos

### 📝 v0.9 — Fornecedores e catálogo
- Fornecedores, materiais e serviços com histórico de preços. Importação dos Excels.

### 📝 v0.10 — Materiais por obra

### 📝 v0.11 — Custos da obra
- Por fase e categoria: material, serviços, mão de obra, alimentação, alojamento, transporte.

### 📝 v1.0 — Orçamentação
- Custos + margem → orçamento final. O Cliente vê só o orçamento final.

---

## Próximos passos (sem versão atribuída)
- Preencher o objetivo no README.
- Avaliar passar o DNS do `discovercasa.pt` do cPanel para a Cloudflare (copiar antes os registos de email).
