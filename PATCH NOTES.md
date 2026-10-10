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
10. **Dados pessoais da equipa** (NIF, CC, IBAN, saúde) só visíveis para ADMIN e Administrador. (D10)
11. **PINs de cartões não são guardados** na plataforma. (D11)
12. **Ordem do roadmap: Base → Equipa (fichas, férias) → Obras (abas, Drive) → Controlo e veículos → Materiais → Mapas → resto dos Custos.** (alterada na v0.2, v0.3, v0.6, v0.8 e v0.9 a pedido do Sebastião)
13. **O tipo de utilizador só muda pelo servidor.** Um trigger em `profiles` bloqueia alterações diretas a `papel`, `role`, `utilizador` e `ativo`; um Administrador não cria nem altera contas ADMIN; ninguém muda o próprio tipo. (D13)
14. **A visibilidade da checklist é aplicada na base de dados** (RLS em `fases` e `items`), não só no ecrã. O que está dentro de um item escondido também fica escondido. (D14)
16. **Campos da obra por tipo de utilizador**, filtrados na base de dados: cliente e notas internas não se leem diretamente da tabela, só por `obras_visiveis()`. Subempreiteiro não vê cliente, notas nem membros; Cliente vê a sua obra e os seus dados, sem notas. (D15)
17. **O cliente de uma obra é sempre uma conta Cliente** criada por ADMIN/Administrador, e só vê as obras a que é associado. (D15)
18. **Largura:** a checklist fica centrada; as outras páginas ocupam a largura toda.
19. **Tudo numa só página:** as áreas são separadores de `index.html` (sem mudar de página), com **endereços sem "#"** (`/obras/<id>/pedidos`); a Cloudflare Pages devolve o `index.html` para qualquer endereço (não pode existir `public/404.html`). O código de cada área fica em `public/js/<área>.js`. (D18)
20. **Todos os colaboradores têm conta.** Quem não tem email usa um endereço interno `<utilizador>@equipa.discovercasa.pt`; entra com o nome de utilizador.
21. **Alertas de documentos** (carta, CC, aptidão médica) 31 dias antes de expirarem, no Início, para ADMIN e Administrador.
22. **Férias:** ADMIN e Administrador registam e aprovam; cada colaborador vê só as suas e pode pedir (fica pendente). Saldo de 22 dias/ano por omissão, mais transitados; descontam férias pessoais e Férias Discovercasa aprovadas, em dias úteis. (D16)
23. **"f" no Excel de férias = Falta**; o "x" não se importa.
24. **Abas da obra:** Início · Projeto · Mapa · Documentos · Fotos · Entregas · Pedidos. Só membros da obra (e ADMIN/Administrador) veem o conteúdo. (D17)
25. **Entregas:** registam ADMIN, Administrador e Obra; Subempreiteiro só vê; **Cliente não vê**. (D17)
26. **Pedidos e falhas:** qualquer membro cria e responde; **fecha** ADMIN/Administrador ou quem criou; só ADMIN/Administrador alteram o texto. Fotografias num armazenamento privado, só para membros da obra. (D17)
27. **Google Drive:** conta `discoversebastiao@gmail.com`; pastas em **A minha unidade / Discovercasa Sites / Obras / <código · nome> / Documentos e Fotografias**. Quem vê cada pasta decide-se no Hub (herda da pasta-mãe), não na Drive; ninguém precisa de conta Google.
28. **Credenciais do Google** só nos Secrets do Supabase (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`); o refresh token fica em `drive_config`, tabela sem acesso para utilizadores. Só um ADMIN liga a Drive. (D19)
29. **Carregar:** Documentos — ADMIN, Administrador e Obra; Fotos (fotografias e vídeos) — todos os membros. Criar/apagar pastas, apagar ficheiros e mudar "Quem vê" — só ADMIN e Administrador. Apagar envia para o lixo da Drive.
30. **Voltar onde estava:** no mesmo dia, cada separador volta ao mesmo sítio (sub-página, filtros, pesquisa, posição); abrir o Hub volta à última página. **Noutro dia, tudo recomeça** no Início, sem filtros. (D20)
31. **Abas já vistas abrem logo** (mostram o que se viu e atualizam em segundo plano); "A carregar" só na primeira vez.
32. **Foto de capa da obra:** escolhida por ADMIN/Administrador (das Fotos da obra ou carregada), guardada em privado no Supabase; vista por todos os membros, incluindo o Cliente; aparece também nos cartões da lista. (D20)
33. **Checklist:** pesquisa em todas as fases (sem distinguir acentos; cada resultado mostra Fase › Título) e filtros (estado, responsável, visibilidade restrita); em "Editar estrutura" arrastam-se fases, títulos, checks e subchecks (títulos só no primeiro nível); títulos e checks com subchecks abrem e fecham.
34. **Escondidos numa obra desaparecem para todos** (também ADMIN/Administrador); o botão "Mostrar escondidos nesta obra (N)" mostra-os a cinzento no lugar deles.
35. **Pedidos:** "Concluir"/"Concluídos" (não "Fechar"); campo "Necessário até"; ordenados pela data de necessidade; a aba Pedidos mostra quantos estão por concluir (vermelho se algum for urgente ou estiver atrasado).
36. **Contactos de emergência e alojamento** da obra (hospital, polícia/GNR, bombeiros, alojamento): visíveis para os membros, **exceto o Cliente**. (D21)
37. **Controlo** (GPS e Horas extra) e **Veículos**: só ADMIN e Administrador. Dos cartões dos veículos guardam-se **só os últimos 4 dígitos**; nunca PINs nem números completos. (D21)
38. **A foto de capa é o fundo do cabeçalho da obra** (não uma faixa por cima).
39. **Materiais e fornecedores:** só ADMIN e Administrador. Um material (nomenclatura Discovercasa) tem preços de vários fornecedores, ordenados do mais barato (preço final sem IVA, com desconto). (D22)
40. **Histórico de preços automático:** ao mudar o preço, o desconto, o IVA ou a unidade, o valor anterior é guardado pelo servidor; ninguém escreve diretamente no histórico. Preço com mais de 6 meses = desatualizado. (D22)
41. **Medidas dos materiais em metros** (comprimento, largura, altura/espessura); quantidade por embalagem e peso em campos próprios; **transporte e "incluído" em cada preço** (não só no fornecedor). (D23)
42. **Importar Excel de materiais = juntar:** acrescenta o que é novo e atualiza o que mudou (o preço anterior vai para o histórico); nunca apaga; preços alterados no Hub depois da data do Excel ficam como estão. (D23)
15. **Todas as páginas** em `public/` são em português de Portugal e ligam-se ao Supabase só pelo `plataforma-core`. (D6)

## Histórico

### v0.9a — 2026-10-11
- **Novo material numa janela completa** (material + primeiro preço), organizada por blocos: Material, Fornecedor, Medidas e quantidade, Preço, Transporte e entrega.
- **Medidas** em metros (comprimento, largura, altura/espessura), **quantidade por embalagem** (com unidade) e **peso por unidade**; o campo antigo de "dimensões" foi convertido (o que não deu ficou nos Detalhes).
- **Conversões** na ficha do material (€/un, €/ml, €/m², €/m³, €/embalagem, €/kg, €/t) para cada fornecedor, com o mais barato a verde; pré-visualização na janela.
- **Lista de materiais com uma linha por preço**, ordenável por qualquer coluna e com filtros de escolha múltipla (Categoria, Fornecedor, Unidade, Transporte, Incluído, Disponibilidade); o fornecedor abre a sua página; "Mais barato" assinalado.
- **Transporte e "incluído" por preço** (Sim / Não / Por definir; Incluído / Não incluído / Só c/ quantidade mínima).
- **Importar Excel** (`public/js/materiais-importar.js`, SheetJS 0.18.5 do cdnjs carregado só ao importar): resumo antes de aplicar; testado com o Excel novo (903 preços, 46 fornecedores, 87 com medidas, 75 com quantidade, 103 medidas por rever). Medidas acima de 30 contam como milímetros; granulometrias (brita 11/22) ficam nos Detalhes.
- Base de dados (migração `0012_material_precos_medidas`). Novo teste D23 (leitura do Excel).

### v0.9 — 2026-10-11
- Novo separador **Materiais** (`public/js/materiais.js`, só ADMIN/Administrador), com as abas **Materiais** e **Fornecedores**.
- Lista de materiais com pesquisa (sem acentos), filtros por fornecedor, categoria e "preço com mais de 6 meses"; melhor preço de cada material.
- Ficha do material: preços por fornecedor (preço, desconto, final sem/com IVA, disponibilidade, prazo, data), o mais barato em destaque; histórico de preços; criar/editar/apagar.
- Ficha do fornecedor: empresa, pagamento, transporte, contacto (ligar/email) e os seus materiais.
- Base de dados (migração `0011_materiais_fornecedores`): `fornecedores`, `materiais`, `material_precos`, `material_precos_historico` (escrito por trigger). Testado: só gestores veem; o histórico é criado ao mudar o preço e não ao mudar observações; ninguém escreve no histórico diretamente.
- Importados do Excel: 9 fornecedores, 113 materiais, 113 preços; o preço repetido do "ROLO ALUMINIO 80" (março) ficou no histórico.
- Roadmap: Materiais passam a v0.9; Mapas a v0.10 e v0.11 (Decisão 12 atualizada). Novo teste D22.

### v0.8 — 2026-10-11
- Novo separador **Controlo** (`public/js/controlo.js`, só ADMIN/Administrador): **GPS** (condutor, veículo, partidas e chegadas de manhã/almoço/tarde, tempo de condução, observações; filtros por mês, condutor e veículo) e **Horas extra** (obra, colaborador, horas × €/hora com 8,50 € por omissão, ou valor fixo; Pago/Não pago com um clique; totais e resumo por colaborador).
- **Veículos** em Colaboradores (`public/js/colaboradores.js`): ficha do veículo, validades de revisão/inspeção/seguro/IUC com alertas no Início (31 dias), cartões BP e Pontos só com os últimos 4 dígitos.
- Base de dados (migração `0010_controlo_veiculos`): `veiculos`, `gps_registos`, `horas_extra` com RLS só para gestores (testado: Administrador vê 9/10/27; Obra e Cliente veem 0).
- Importados do Excel: 9 veículos (sem PINs; cartões só com 4 dígitos), 10 registos de GPS (os do "Scenic" ficam com o veículo em texto, porque há dois), 27 horas extra (as de "Cães" ligadas à obra Caes; nomes sem ficha ficam em texto).
- Roadmap: Controlo e Veículos passam a v0.8; Mapa da obra e Mapa de obras para depois (Decisão 12 atualizada). Novo teste D21.

### v0.7c — 2026-10-11
- Obra: a **capa é o fundo do cabeçalho**; aviso com o número de pedidos por concluir na aba Pedidos; bloco **Emergência e alojamento** (ficha e formulário), com "Ligar" e "Mapa".
- Pedidos: "Necessário até", ordem pela data de necessidade, atrasados em destaque, "Concluir"/"Concluídos".
- Checklist: abrir/fechar (▸/▾, "Abrir tudo"/"Fechar tudo", com memória); escondidos desaparecem para todos e o botão "Mostrar escondidos nesta obra (N)" mostra-os; a pesquisa mostra Fase › Título.
- Férias: aba **Visão Pedro** (ano de um colaborador, dias alinhados pelo dia da semana, cores como no Excel, contagem de gozados/marcados/pendentes/por marcar); "As minhas férias" passa a mostrar a mesma vista.
- Separadores do topo mais compactos para caberem todos.

### v0.7b — 2026-10-11
- **Voltar onde estava:** memória do dia em `public/js/hub.js` (`lembrar`/`recordar`, rota de cada secção, posição na página); o separador do topo volta à última sub-página dessa secção; noutro dia recomeça tudo.
- **Sem "A carregar" nas abas já vistas:** Obras, abas da obra (Projeto, Entregas, Pedidos), Equipa, Férias e Checklist mostram o que tinham e atualizam em segundo plano. Mudar de aba dentro da obra já não recarrega o cabeçalho nem a capa.
- **Foto de capa** (migração `0009_obras_capa`, armazenamento privado `capas`; ação `capa_da_drive` na função `drive`): carregar ou escolher das Fotos da obra; aparece no topo da obra e nos cartões da lista.
- **Checklist:** pesquisa e filtros (com memória); arrastar com SortableJS 1.15.2 (cdnjs), funciona com rato e dedo; títulos só no primeiro nível.
- Testado: pesquisa "agua" encontra "Águas e esgotos"; arrastar grava a nova posição; voltar ao separador regressa à mesma sub-página e posição; noutro dia recomeça.
- Esclarecido: as "versões 2 e 3" da função `drive` foram só os Secrets guardados (o código não mudou) — não houve alterações fora desta conversa.
- Novo teste D20.

### v0.7a — 2026-10-11
- **Documentos e Fotos mais rápidos:** a barra (pasta, "+ Carregar", "+ Pasta", "Quem vê") aparece logo; a lista mostra o que foi guardado da última vez e atualiza em segundo plano (só redesenha se mudou).
- Um só pedido para abrir a área (`listar` aceita obra + área); caminho das pastas numa consulta (`caminho_pasta`, migração `0008`).
- Miniaturas em lotes de 12 (`miniaturas`), guardadas no browser (Cache Storage); ao abrir uma obra, as listas de Documentos e Fotos são preparadas em segundo plano.
- Medido com 1,5 s de atraso por pedido: botões em 0,1 s; fotos em 2,5 s na 1.ª vez e 0,1–0,2 s nas seguintes.
- Nota: ficheiros acrescentados diretamente na Drive aparecem depois da atualização em segundo plano.
- A função `drive` estava na versão 3 no Supabase (alterada fora desta conversa); foi substituída por esta (versão 4).

### v0.7 — 2026-10-10
- **Documentos e Fotos** de cada obra ligados ao Google Drive (`public/js/drive.js`; Edge Functions `drive` e `drive-ligar`).
- Página Obras: estado da ligação e botão "Ligar Google Drive" (só ADMIN); ao criar uma obra, as pastas são criadas na Drive; ao mudar o código/nome, a pasta é renomeada.
- Navegar por pastas (`/obras/<id>/documentos/<pasta>`), carregar vários ficheiros com barra de progresso (envio direto do browser para a Drive, sem limite de tamanho do servidor), descarregar (Google Docs vão em PDF), ver fotos e vídeos, criar e apagar pastas, "Quem vê" por pasta.
- Pastas criadas diretamente na Drive aparecem no Hub e herdam a visibilidade da pasta-mãe.
- Base de dados (migração `0007_drive_pastas`): `drive_config` (privada), `drive_pastas` com RLS recursiva (`pode_ver_pasta`).
- Testado: Obra vê 5/5 pastas; Cliente não vê a pasta só para Obra nem as subpastas dela; Cliente não muda a visibilidade; quem não é membro não vê nada.
- `plataforma-core` passa a expor também a chave pública (`chave`) para pedidos de ficheiros.
- Novo teste D19.
- *Fica para depois:* foto da guia de remessa nas entregas.

### v0.6a — 2026-10-10
- **Endereços sem "#":** `hub.discovercasa.pt/obras/<id>/pedidos`, `/checklist/<obra>`, `/ferias/saldos`… (`Hub.rota()` e `Hub.ir()` em `public/js/hub.js`; as ligações internas mudam de separador sem recarregar; o botão Voltar funciona). Ligações antigas com "#" são convertidas.
- `public/_redirects`: só `/checklist.html → /checklist`.
- **Correção:** na checklist não era possível mudar de obra (ficava sempre a anterior).
- Decisão 19 atualizada; novo teste D18.

### v0.6 — 2026-10-10
- Página da obra com **abas** (`public/js/obras.js`, `public/js/obra-abas.js`): Início (a antiga ficha, agora com o total de pedidos), Projeto, Mapa (em breve), Documentos e Fotos (em breve, v0.7), Entregas, Pedidos.
- **Projeto:** campos do projeto; ADMIN/Administrador editam.
- **Entregas:** data, fornecedor, estado (prevista/entregue), linhas de material, recebido por, notas.
- **Pedidos e falhas:** tipo, prioridade, descrição, fotografia (reduzida no telemóvel antes de enviar), respostas, fechar/reabrir; em aberto/fechados.
- Início: pedidos em aberto nas obras de cada pessoa, com os urgentes.
- Base de dados (migração `0006_obra_abas`): `obra_projeto`, `entregas`, `entrega_itens`, `pedidos`, `pedido_respostas`, armazenamento privado `pedidos`; funções `membro_obra`, `ve_entregas`, `edita_entregas`, `pedidos_abertos`.
- Testado por tipo: Cliente vê/cria pedidos e não vê entregas; Subempreiteiro vê entregas mas não regista; Obra regista; ninguém fecha pedidos de outros; quem não é membro não vê nada.
- Correção: aparecia "null" por baixo da lista de entregas e no formulário "Novo colaborador".
- Roadmap: Drive na v0.7; Mapa da obra v0.8; Mapa de obras v0.9; Horas extra e Veículos passam a v0.10 e v0.11; Custos a partir da v0.12 (Decisão 12 atualizada).
- Novo teste D17.

### v0.5 — 2026-10-10
- Novo separador **Férias** (`public/js/ferias.js`):
  - ADMIN/Administrador: mapa mensal da equipa (clicar para registar/alterar), pedidos pendentes (aprovar/recusar), saldos por ano (dias e transitados editáveis), feriados (nacionais e municipais), "Férias Discovercasa" para todos.
  - Colaborador com ficha: "As minhas férias" (saldo, registo, pedir, cancelar pedido pendente).
- Início: aviso de pedidos pendentes para ADMIN/Administrador; cartão Férias.
- Base de dados (migração `0005_ferias_ausencias`): `feriados` (2026 e 2027), `ferias_saldos`, `ausencias`; funções `minha_ficha_id`, `dias_uteis`, `saldos_ferias`.
- Testado: um colaborador vê só as suas ausências e nenhuma ficha; pode pedir, mas não aprovar nem pedir por outro.
- Importadas 91 ausências de 2026 do Excel (9 pessoas). Ficaram de fora 3 nomes sem ficha: "Mª João Santos", "Luís Henrique Nogueira", "Paulo Beça".
- Novo teste D16.

### v0.4 — 2026-10-10
- **Ficha do colaborador** (`public/js/colaboradores.js`): identificação, contactos, trabalho, documentos com validade; criar, editar, apagar.
- Colaboradores dividido em **Equipa** (fichas) e **Contas de acesso**.
- **Criar conta a partir da ficha**: sugere utilizador e email interno `@equipa.discovercasa.pt`; a função `gerir-contas` liga a conta à ficha (`colaborador_id`).
- **Alertas** no Início: documentos expirados ou a expirar em 31 dias.
- Base de dados (migração `0004_progresso_e_colaboradores`): tabela `colaboradores` com RLS só para ADMIN/Administrador (testado: Administrador vê 13, Obra vê 0).
- Importados os 13 colaboradores da folha "Colaboradores" do Excel; a ficha do Sebastião ligada à conta `sebastiao`.
- Testes: D2 aceita políticas com `eh_gestor()`; novo teste D10.

### v0.3a — 2026-10-10
- A checklist passou para dentro do Hub (`public/js/checklist.js`, separador `#checklist`); `public/checklist.html` removido; `public/_redirects` envia `/checklist` para `/#checklist`.
- **Total de todas as fases** na checklist e na ficha da obra (função `progresso_obra`, que conta só o que a pessoa vê e não está escondido).
- Decisão 19 (tudo numa só página) substitui a regra "cada área grande tem a sua página".

### v0.3 — 2026-10-10
- Novo separador **Obras** em `index.html` (`public/js/obras.js`): lista com pesquisa e filtro, ficha, criar/editar/apagar, membros.
- Base de dados (migração `0003_obras_ficha`): novos campos em `obras`; leitura de `cliente_id` e `notas` só pela função `obras_visiveis()`; o cliente tem de ser conta Cliente e passa a membro da obra; função `listar_membros_obra`.
- Testado por tipo: Obra vê notas e cliente; Subempreiteiro nenhum dos dois; Cliente vê o próprio, sem notas; leitura direta das notas bloqueada.
- Checklist: centrada; sem "Nova obra"/"Membros" (passaram para Obras); abre a obra pedida em `?obra=`; botão "Ficha da obra".
- Correção: faltava espaço entre o cabeçalho e o conteúdo; botões-ligação deixaram de aparecer sublinhados.
- Roadmap: Obras passam a v0.3; Equipa começa na v0.4 (Decisão 12 atualizada).
- Novas Decisões 16–18; teste D15.

### v0.2 — 2026-10-10
- Nova página `public/checklist.html` (`hub.discovercasa.pt/checklist`).
- Fases → títulos → checks → subchecks; estrutura comum, checks por obra; esconder por obra; responsável; partilhas; membros; nova obra.
- Visibilidade por tipo de utilizador e/ou colaborador (`vis_papeis`, `vis_utilizadores`), com herança; aplicada por RLS (migração `0002_checklist_visibilidade`).
- `eh_admin()` passa a usar os tipos novos (ADMIN/Administrador, contas ativas); esconder numa obra só para gestores.
- Dados antigos convertidos: os checks que vinham a seguir a um título passaram a ser filhos dele.
- Separadores no topo, junto ao logótipo; páginas com largura total.
- Código comum em `public/css/hub.css` e `public/js/hub.js`.
- Roadmap: checklist passa a v0.2; Equipa, Obras e Custos renumerados (Decisão 12 atualizada).
- Testes: D6 alargado a todas as páginas; novo D14.

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
