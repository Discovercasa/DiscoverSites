# Roadmap

Estado: ✅ feita · 🔜 próxima · 📝 planeada

Cada versão nova do roadmap é registada em `PATCH NOTES.md` e marcada aqui como ✅.
Ordem dos blocos: **Base (com a checklist) → Equipa → Obras → Custos**.

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

### ✅ v0.2 — Checklist
- Página própria em `hub.discovercasa.pt/checklist`, com separadores no topo e largura total.
- Fases → títulos → checks → subchecks (sem limite de níveis). Estrutura comum a todas as obras; checks marcados por obra.
- Só ADMIN e Administrador criam, editam, reordenam e apagam.
- Visibilidade por tipo de utilizador e/ou colaborador, aplicada na base de dados; o que está dentro herda.
- Por obra: esconder, responsável, partilhar com pessoas; membros da obra; criar obras.
- A checklist antiga passou para aqui (3 fases, 19 itens).

---

## Bloco 2 — Equipa

### 🔜 v0.3 — Ficha de colaborador
- Acrescentar à conta a ficha do colaborador; dados pessoais (NIF, CC, IBAN, aptidão médica) só para ADMIN e Administrador.
- Alertas de documentos a expirar (carta, CC, aptidão médica).

### 📝 v0.4 — Férias e ausências
- Mapa anual (férias, faltas, teletrabalho, feriados…).

### 📝 v0.5 — Horas extra
- Registo por obra e colaborador; estado pago / não pago; totais.

### 📝 v0.6 — Veículos e deslocações
- Veículos com alertas (revisão, inspeção, seguro, IUC); registo de deslocações; gasóleo.
- PINs de cartões **não** são guardados.

---

## Bloco 3 — Obras

### 📝 v0.7 — Obras
- Obra com código, local e cliente; membros por obra (`obra_membros`).

### 📝 v0.8 — Fase, fotos e vídeos
- Fase atual da obra; fotos e vídeos (decidir armazenamento: Supabase ou R2).
- Cliente vê a fase e as fotos da obra dele.

### 📝 v0.9 — Mapa de obras

---

## Bloco 4 — Custos

### 📝 v0.10 — Fornecedores e catálogo
- Fornecedores, materiais e serviços com histórico de preços. Importação dos Excels.

### 📝 v0.11 — Materiais por obra

### 📝 v0.12 — Custos da obra
- Por fase e categoria: material, serviços, mão de obra, alimentação, alojamento, transporte.

### 📝 v1.0 — Orçamentação
- Custos + margem → orçamento final. O Cliente vê só o orçamento final.

---

## Próximos passos (sem versão atribuída)
- Preencher o objetivo no README.
- Avaliar passar o DNS do `discovercasa.pt` do cPanel para a Cloudflare (copiar antes os registos de email).
