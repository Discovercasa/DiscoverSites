# Roadmap

Estado: ✅ feita · 🔜 próxima · 📝 planeada

Cada versão nova do roadmap é registada em `PATCH NOTES.md` e marcada aqui como ✅.
Ordem dos blocos: **Base → Equipa → Obras → Custos**.

## ✅ v0.0 — Estrutura inicial
- Documentos base, `public/index.html` com `APP_VERSAO` e `NOVIDADES`, testes, Cloudflare Pages.

---

## Bloco 1 — Base

### 🔜 v0.1 — Login e visual Discovercasa
- Visual com as cores Discovercasa (amarelo, cinzento escuro, fundo claro, títulos condensados), a partir do HTML do Sebastião.
- Login com senha própria de cada utilizador. Sem registo público.
- Ligação ao Supabase **Sites** só com a chave pública.
- `https://hub.discovercasa.pt` no Site URL e nos Redirect URLs da autenticação.

### 📝 v0.2 — Papéis e permissões
- 5 papéis: ADMIN, Administrador, Obra, Subempreiteiro, Cliente (matriz no README).
- Converter os papéis atuais de `profiles` sem partir o site existente:
  `discovercasa2010` e `sebalca5` → ADMIN; o terceiro utilizador → Administrador.
- Acesso por obra através de `obra_membros`.

### 📝 v0.3 — Página central
- Menu com as áreas que cada papel pode abrir.

### 📝 v0.4 — Gestão de contas
- ADMIN e Administrador criam contas, definem a senha inicial e atribuem papéis e obras.
- Feito numa Edge Function (a chave secreta nunca vai para o site).

---

## Bloco 2 — Equipa

### 📝 v0.5 — Colaboradores
- Ficha de colaborador; dados pessoais (NIF, CC, IBAN, aptidão médica) só para ADMIN e Administrador.
- Alertas de documentos a expirar (carta, CC, aptidão médica).

### 📝 v0.6 — Férias e ausências
- Mapa anual (férias, faltas, teletrabalho, feriados…).

### 📝 v0.7 — Horas extra
- Registo por obra e colaborador; estado pago / não pago; totais.

### 📝 v0.8 — Veículos e deslocações
- Veículos com alertas (revisão, inspeção, seguro, IUC); registo de deslocações; gasóleo.
- PINs de cartões **não** são guardados.

---

## Bloco 3 — Obras

### 📝 v0.9 — Obras
- Obra com código, local e cliente; membros e papéis por obra.
- Integrar no Hub a checklist existente (fases e itens).

### 📝 v0.10 — Fase, fotos e vídeos
- Fase atual da obra; fotos e vídeos (decidir armazenamento: Supabase ou R2).
- Cliente vê a fase e as fotos da obra dele.

### 📝 v0.11 — Mapa de obras

---

## Bloco 4 — Custos

### 📝 v0.12 — Fornecedores e catálogo
- Fornecedores, materiais e serviços com histórico de preços. Importação dos Excels.

### 📝 v0.13 — Materiais por obra

### 📝 v0.14 — Custos da obra
- Por fase e categoria: material, serviços, mão de obra, alimentação, alojamento, transporte.

### 📝 v1.0 — Orçamentação
- Custos + margem → orçamento final. O Cliente vê só o orçamento final.

---

## Próximos passos (sem versão atribuída)
- Preencher o objetivo no README.
- Avaliar passar o DNS do `discovercasa.pt` do cPanel para a Cloudflare (copiar antes os registos de email).
