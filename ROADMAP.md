# Roadmap

Estado: ✅ feita · 🔜 próxima · 📝 planeada

Cada versão nova do roadmap é registada em `PATCH NOTES.md` e marcada aqui como ✅.
Ordem dos blocos: **Base → Equipa (fichas, férias) → Obras (abas, Drive, mapas) → Equipa (horas, veículos) → Custos**.

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
- Separador do Hub (`#checklist`), centrado, com o total da obra e de cada fase (v0.3a).
- Fases → títulos → checks → subchecks (sem limite de níveis). Estrutura comum a todas as obras; checks marcados por obra.
- Só ADMIN e Administrador criam, editam, reordenam e apagam.
- Visibilidade por tipo de utilizador e/ou colaborador, aplicada na base de dados; o que está dentro herda.
- Por obra: esconder, responsável, partilhar com pessoas; membros da obra; criar obras.
- A checklist antiga passou para aqui (3 fases, 19 itens).

### ✅ v0.3 — Obras
- Separador **Obras** no Hub: lista geral (pesquisa e filtro por estado) e ficha de cada obra.
- Campos: código, nome, estado, morada, localidade, coordenadas, datas, responsável, cliente (conta Cliente), notas internas, membros.
- Cada tipo de utilizador vê só os campos permitidos, filtrados na base de dados.
- Criar, editar, apagar e gerir membros passam da checklist para aqui. A checklist volta a ficar centrada.

---

## Bloco 2 — Equipa

### ✅ v0.4 — Ficha de colaborador
- Ficha de cada colaborador (13 importados do Excel); dados pessoais só para ADMIN e Administrador.
- Criar a conta a partir da ficha; email interno para quem não tem email.
- Alertas de documentos a expirar (carta, CC, aptidão médica) no Início.
- *Fora desta versão:* registo de EPIs.

### ✅ v0.5 — Férias e ausências
- Mapa mensal da equipa, pedidos com aprovação, saldo por pessoa, feriados nacionais e municipais.
- Férias de 2026 importadas do Excel.

---

## Bloco 3 — Obras

### ✅ v0.6 — Abas da obra
- Abas: Início · Projeto · Mapa (em breve) · Documentos · Fotos · Entregas · Pedidos.
- Projeto (tipologia, área, pisos, modelo, arquiteto, licença, notas).
- Entregas de materiais (com linhas de material); Cliente não vê.
- Pedidos e falhas: tipo, prioridade, fotografia, respostas, fechar/reabrir; pedidos em aberto no Início.

### 🔜 v0.7 — Documentos e Fotos (Google Drive)
- Ligação à Drive da conta Gmail da empresa (autorização guardada no Supabase, nunca no código).
- Ao criar uma obra, cria a pasta da obra com "Documentos" e "Fotografias"; ligar as obras atuais às pastas que já existam.
- Pastas de Documentos com visibilidade por tipo de utilizador e/ou colaborador, decidida no Hub.
- Ver, carregar e descarregar ficheiros a partir do Hub; foto da guia de remessa nas entregas.

### 📝 v0.8 — Mapa da obra
- *A definir.*

### 📝 v0.9 — Mapa de obras
- Todas as obras num mapa (coordenadas da ficha).

---

## Bloco 2b — Equipa (continuação)

### 📝 v0.10 — Horas extra
- Registo por obra e colaborador; estado pago / não pago; totais.

### 📝 v0.11 — Veículos e deslocações
- Veículos com alertas (revisão, inspeção, seguro, IUC); registo de deslocações; gasóleo.
- PINs de cartões **não** são guardados.

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
