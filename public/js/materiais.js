// Separador "Materiais" (só ADMIN e Administrador): catálogo de materiais, preços por fornecedor e fornecedores.
(function () {
  const { sb, $, el } = Hub;
  const PAGAMENTO = { conta_corrente: 'Conta corrente', pronto_pagamento: 'Pronto pagamento', antes_levantamento: 'Antes do levantamento' };
  const DISPONIBILIDADE = { imediata: 'Imediata', encomenda: 'Por encomenda' };
  const MESES_DESATUALIZADO = 6;
  const TRANSPORTE = { sim: 'Sim', nao: 'Não', por_definir: 'Por definir' };
  const INCLUIDO = { sim: 'Incluído', nao: 'Não incluído', qtd_minima: 'Só c/ quantidade mínima' };
  const UNIDADES_EMB = ['un', 'ml', 'm2', 'm3', 'kg', 'L'];

  let eu = null, carregado = false, materiais = [], precos = [], fornecedores = [];


  async function ok(p, msg = 'Não foi possível guardar.') { const { data, error } = await p; if (error) { console.error(error); throw new Error(error.code === '23505' ? 'Já existe um registo com esse nome.' : error.code === '23503' ? 'Não é possível apagar: há preços ligados a este fornecedor.' : msg); } return data; }
  const euros = (n) => Number(n || 0).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const pct = (n) => `${Math.round(Number(n || 0) * 1000) / 10}%`;
  const dataPT = (s) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('pt-PT') : '—');
  const normal = (t) => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const finalSemIva = (p) => Number(p.preco) * (1 - Number(p.desconto || 0));
  const finalComIva = (p) => finalSemIva(p) * (1 + Number(p.iva || 0));
  const desatualizado = (p) => { const d = new Date(p.data_atualizacao + 'T00:00:00'); d.setMonth(d.getMonth() + MESES_DESATUALIZADO); return d < new Date(); };
  const nomeForn = (id) => (fornecedores.find((f) => f.id === id) || {}).nome || '—';
  const n = (v) => (v == null || v === '' ? null : Number(v));

  // Preço noutras unidades (a partir do preço final sem IVA, das medidas em metros, da quantidade por embalagem e do peso)
  function conversoes(p) {
    const P = finalSemIva(p), U = (p.unidade || 'un').toLowerCase();
    const C = n(p.comprimento), L = n(p.largura), A = n(p.espessura), Q = n(p.qtd_embalagem), peso = n(p.peso_kg);
    let peca = null;                                  // preço de uma unidade (peça)
    if (U === 'un') peca = P;
    else if (U === 'cx') peca = Q ? P / Q : null;
    else if (U === 'ml') peca = C ? P * C : null;
    else if (U === 'm2') peca = C && L ? P * C * L : null;
    else if (U === 'm3') peca = C && L && A ? P * C * L * A : null;
    const r = { un: peca };
    r.ml = U === 'ml' ? P : peca && C ? peca / C : U === 'm2' && L ? P * L : U === 'm3' && L && A ? P * L * A : null;
    r.m2 = U === 'm2' ? P : peca && C && L ? peca / (C * L) : U === 'm3' && A ? P * A : U === 'ml' && L ? P / L : null;
    r.m3 = U === 'm3' ? P : peca && C && L && A ? peca / (C * L * A) : U === 'm2' && A ? P / A : U === 'ml' && L && A ? P / (L * A) : null;
    r.emb = U === 'cx' ? P : Q ? (p.qtd_unidade === 'ml' && r.ml ? r.ml * Q : p.qtd_unidade === 'm2' && r.m2 ? r.m2 * Q : peca ? peca * Q : null) : null;
    r.kg = U === 'kg' ? P : U === 't' ? P / 1000 : peca && peso ? peca / peso : null;
    r.t = r.kg != null ? r.kg * 1000 : null;
    return r;
  }
  const CONVERSOES = [['un', '€/un'], ['ml', '€/ml'], ['m2', '€/m²'], ['m3', '€/m³'], ['emb', '€/embalagem'], ['kg', '€/kg'], ['t', '€/t']];
  const medidasTexto = (p) => {
    const d = [p.comprimento, p.largura, p.espessura].filter((x) => x != null).map((x) => Number(x).toLocaleString('pt-PT') + ' m');
    return [d.length ? d.join(' × ') : null, p.qtd_embalagem ? `${Number(p.qtd_embalagem).toLocaleString('pt-PT')} ${p.qtd_unidade || 'un'}/emb.` : null, p.peso_kg ? `${Number(p.peso_kg).toLocaleString('pt-PT')} kg` : null].filter(Boolean).join(' · ');
  };
  const precosDe = (materialId) => precos.filter((p) => p.material_id === materialId).sort((a, b) => finalSemIva(a) - finalSemIva(b));
  function aviso(t, tipo = 'erro') { const m = $('mt-aviso'); m.textContent = t || ''; m.className = 'mensagem ' + (t ? tipo : ''); }

  async function carregar() {
    const [m, p, f] = await Promise.all([
      ok(sb.from('materiais').select('*').order('nome'), 'Não foi possível carregar os materiais.'),
      ok(sb.from('material_precos').select('*'), 'Não foi possível carregar os preços.'),
      ok(sb.from('fornecedores').select('*').order('nome'), 'Não foi possível carregar os fornecedores.')
    ]);
    materiais = m; precos = p; fornecedores = f;
  }

  // rotas: materiais | materiais/<id> | materiais/fornecedores | materiais/fornecedores/<id>
  async function mostrar(rota, utilizador) {
    eu = utilizador; aviso('');
    const partes = rota.split('/');
    const sub = partes[1] === 'fornecedores' ? 'fornecedores' : 'materiais';
    document.querySelectorAll('#aba-materiais .sub-abas a').forEach((a) => a.dataset.sub === sub ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
    if (!carregado) {
      $('mt-conteudo').replaceChildren(el('p', { class: 'carregar', text: 'A carregar…' }));
      try { await carregar(); carregado = true; } catch (e) { $('mt-conteudo').replaceChildren(); return aviso(e.message); }
    } else {
      const antes = JSON.stringify([materiais, precos, fornecedores]);
      carregar().then(() => { if (JSON.stringify([materiais, precos, fornecedores]) !== antes && Hub.rota() === rota) desenhar(rota); }).catch(() => {});
    }
    desenhar(rota);
  }
  function desenhar(rota) {
    const p = rota.split('/');
    if (p[1] === 'fornecedores') return p[2] ? fichaFornecedor(p[2]) : listaFornecedores();
    return p[1] ? fichaMaterial(p[1]) : listaMateriais();
  }
  async function recarregar() { try { await carregar(); desenhar(Hub.rota()); } catch (e) { aviso(e.message); } }

  const opcoes = (lista, valor, vazio) => [el('option', { value: '', text: vazio }), ...lista.map(([v, t]) => el('option', { value: v, text: t, selected: v === valor }))];
  const categorias = () => [...new Set(materiais.map((m) => m.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  // ======================= TABELA COM PESQUISA, ORDENAÇÃO E FILTROS (reutilizável) =======================
  // colunas: { id, nome, valor(r) (para ordenar/filtrar; pode devolver uma lista), mostrar(r) (opcional), num, filtro }
  let popup = null;
  function fecharPopup() { if (popup) { popup.remove(); popup = null; } }
  document.addEventListener('click', (e) => { if (popup && !popup.contains(e.target) && !e.target.closest('.filtro-col')) fecharPopup(); });
  const valoresDe = (c, r) => { const v = c.valor(r); return Array.isArray(v) ? (v.length ? v : ['—']) : [v]; };

  function tabelaFiltravel({ id, colunas, linhas, procurar, placeholder, aoClicar, extra = [], extraTeste = () => true, contagem = (n, t) => `${n} de ${t}` }) {
    const est = Object.assign({ texto: '', ordem: { col: colunas[0].id, dir: 1 }, filtros: {} }, Hub.recordar('tabela.' + id, {}));
    const guardar = () => Hub.lembrar('tabela.' + id, est);
    const pesquisa = el('input', { type: 'search', placeholder, value: est.texto, 'aria-label': 'Procurar' });
    const corpo = el('tbody'), cabeca = el('tr'), info = el('p', { class: 'ajuda' });

    function desenharCabeca() {
      cabeca.replaceChildren(...colunas.map((c) => {
        const ativa = est.ordem.col === c.id, f = (est.filtros[c.id] || []).length;
        return el('th', { class: c.num ? 'num' : '' }, el('div', { class: 'cab-col' }, [
          el('button', { type: 'button', class: 'ordenar' + (ativa ? ' ativa' : ''), title: 'Ordenar', onclick: () => {
            est.ordem = { col: c.id, dir: ativa ? -est.ordem.dir : 1 }; guardar(); desenharCabeca(); desenharLinhas(); } },
            [c.nome, el('span', { class: 'seta', text: ativa ? (est.ordem.dir > 0 ? ' ▲' : ' ▼') : ' ↕' })]),
          c.filtro ? el('button', { type: 'button', class: 'filtro-col' + (f ? ' ativo' : ''), title: 'Filtrar', 'aria-label': 'Filtrar ' + c.nome,
            text: f ? `⏷${f}` : '⏷', onclick: (e) => abrirFiltro(c, e.currentTarget) }) : null
        ].filter(Boolean)));
      }));
    }
    function abrirFiltro(c, botao) {
      fecharPopup();
      const contagens = new Map();
      for (const r of linhas) for (const v of valoresDe(c, r)) contagens.set(v, (contagens.get(v) || 0) + 1);
      const valores = [...contagens.keys()].sort((a, b) => String(a).localeCompare(String(b), 'pt', { numeric: true }));
      const sel = new Set(est.filtros[c.id] || []);
      const procura = el('input', { type: 'search', placeholder: 'Procurar…', 'aria-label': 'Procurar valores' });
      const caixas = el('div', { class: 'popup-lista' });
      const aplicar = () => { if (sel.size) est.filtros[c.id] = [...sel]; else delete est.filtros[c.id]; guardar(); desenharCabeca(); desenharLinhas(); };
      const desenharCaixas = () => caixas.replaceChildren(...valores.filter((v) => normal(v).includes(normal(procura.value))).map((v) =>
        el('label', {}, [el('input', { type: 'checkbox', checked: sel.has(v), onchange: (e) => { e.target.checked ? sel.add(v) : sel.delete(v); aplicar(); } }), ` ${v} (${contagens.get(v)})`])));
      procura.addEventListener('input', desenharCaixas);
      popup = el('div', { class: 'popup-filtro', role: 'dialog', 'aria-label': 'Filtrar ' + c.nome }, [
        procura, caixas,
        el('div', { class: 'acoes' }, [el('button', { class: 'botao secundario pequeno', type: 'button', text: 'Limpar', onclick: () => { sel.clear(); aplicar(); desenharCaixas(); } }),
          el('button', { class: 'botao pequeno', type: 'button', text: 'Fechar', onclick: fecharPopup })])
      ]);
      document.body.append(popup);
      const r = botao.getBoundingClientRect();
      popup.style.top = `${r.bottom + window.scrollY + 4}px`;
      popup.style.left = `${Math.max(8, Math.min(r.left + window.scrollX - 120, document.documentElement.clientWidth - popup.offsetWidth - 8))}px`;
      desenharCaixas(); procura.focus();
    }
    function desenharLinhas() {
      const t = normal(est.texto.trim());
      const col = colunas.find((c) => c.id === est.ordem.col) || colunas[0];
      const chave = (r) => { const v = col.valor(r); return Array.isArray(v) ? v.join(', ') : v; };
      const vis = linhas.filter((r) => {
        for (const [cid, vals] of Object.entries(est.filtros)) { const c = colunas.find((x) => x.id === cid); if (c && vals.length && !valoresDe(c, r).some((v) => vals.includes(v))) return false; }
        if (!extraTeste(r)) return false;
        return !t || normal(procurar(r)).includes(t);
      }).sort((a, b) => { const x = chave(a), y = chave(b); return est.ordem.dir * (col.num ? (x ?? 0) - (y ?? 0) : String(x ?? '').localeCompare(String(y ?? ''), 'pt', { numeric: true })); });
      info.textContent = contagem(vis.length, linhas.length);
      corpo.replaceChildren(...(vis.length ? vis.map((r) => el('tr', { class: aoClicar ? 'clicavel' : '', onclick: aoClicar ? (e) => { if (!e.target.closest('a, button')) aoClicar(r); } : null },
        colunas.map((c) => {
          const m = c.mostrar ? c.mostrar(r) : c.valor(r);
          // texto, número, elemento ou lista (de textos → separados por vírgulas; de elementos → lado a lado)
          const conteudo = m == null || m === '' ? '—' : Array.isArray(m) ? (!m.length ? '—' : m.every((x) => typeof x === 'string') ? m.join(', ') : m) : typeof m === 'number' ? String(m) : m;
          return el('td', { class: c.num ? 'num' : '' }, conteudo);
        })))
        : [el('tr', {}, el('td', { colspan: colunas.length, text: 'Nada corresponde à pesquisa e aos filtros.' }))]));
    }
    pesquisa.addEventListener('input', () => { est.texto = pesquisa.value; guardar(); desenharLinhas(); });
    const limpar = el('button', { class: 'botao secundario pequeno', type: 'button', text: 'Limpar filtros', onclick: () => {
      est.texto = ''; est.filtros = {}; pesquisa.value = ''; guardar(); desenharCabeca(); desenharLinhas(); } });
    desenharCabeca(); desenharLinhas();
    return { no: el('div', { class: 'tabela-filtravel' }, [el('div', { class: 'filtros' }, [pesquisa, ...extra, limpar]), info,
      el('div', { class: 'tabela-envolvente' }, el('table', { class: 'tabela-materiais' }, [el('thead', {}, cabeca), corpo]))]), atualizar: desenharLinhas };
  }

  // ======================= LISTA DE MATERIAIS (uma linha por preço) =======================
  const linkForn = (id) => el('a', { href: '/materiais/fornecedores/' + id, text: nomeForn(id) });
  const celPreco = (p, destaque) => [el('strong', { text: euros(finalSemIva(p)) }), destaque ? el('div', {}, el('span', { class: 'estado sim', text: 'Mais barato' })) : null].filter(Boolean);
  const celData = (p) => el('span', { class: desatualizado(p) ? 'estado aviso' : '', title: desatualizado(p) ? `Mais de ${MESES_DESATUALIZADO} meses` : '', text: dataPT(p.data_atualizacao) });

  function listaMateriais() {
    const linhas = precos.map((p) => ({ p, m: materiais.find((m) => m.id === p.material_id) || { nome: '—' } }));
    const maisBarato = new Set(materiais.map((m) => precosDe(m.id)).filter((ps) => ps.length > 1).map((ps) => ps[0].id));
    const desat = el('input', { type: 'checkbox', checked: !!Hub.recordar('materiais.desatualizado', false) });
    const t = tabelaFiltravel({
      id: 'materiais', linhas, placeholder: 'Procurar material, nome no fornecedor ou fornecedor',
      procurar: (r) => [r.m.nome, r.m.categoria, r.p.designacao, nomeForn(r.p.fornecedor_id)].join(' '),
      aoClicar: (r) => Hub.ir('materiais/' + r.m.id),
      extra: [el('label', { class: 'interruptor' }, [desat, `Preço com mais de ${MESES_DESATUALIZADO} meses`])],
      extraTeste: (r) => !desat.checked || desatualizado(r.p),
      contagem: (n, tot) => `${n} de ${tot} preços · ${materiais.length} materiais`,
      colunas: [
        { id: 'material', nome: 'Material', valor: (r) => r.m.nome, mostrar: (r) => [el('strong', { text: r.m.nome }), r.p.designacao && r.p.designacao !== r.m.nome ? el('div', { class: 'ajuda', style: 'margin:0', text: r.p.designacao }) : null].filter(Boolean) },
        { id: 'categoria', nome: 'Categoria', valor: (r) => r.m.categoria || '—', filtro: true },
        { id: 'fornecedor', nome: 'Fornecedor', valor: (r) => nomeForn(r.p.fornecedor_id), mostrar: (r) => linkForn(r.p.fornecedor_id), filtro: true },
        { id: 'preco', nome: 'Final s/ IVA', valor: (r) => finalSemIva(r.p), mostrar: (r) => celPreco(r.p, maisBarato.has(r.p.id)), num: true },
        { id: 'unidade', nome: 'Unidade', valor: (r) => r.p.unidade || '—', filtro: true },
        { id: 'transporte', nome: 'Transporte', valor: (r) => TRANSPORTE[r.p.transporte] || '—', filtro: true },
        { id: 'incluido', nome: 'Incluído', valor: (r) => INCLUIDO[r.p.transporte_incluido] || '—', filtro: true },
        { id: 'disponibilidade', nome: 'Disponibilidade', valor: (r) => DISPONIBILIDADE[r.p.disponibilidade] || '—', filtro: true },
        { id: 'data', nome: 'Atualizado', valor: (r) => r.p.data_atualizacao || '', mostrar: (r) => celData(r.p) }
      ]
    });
    desat.addEventListener('change', () => { Hub.lembrar('materiais.desatualizado', desat.checked); t.atualizar(); });
    $('mt-conteudo').replaceChildren(
      el('div', { class: 'barra' }, [
        el('div', {}, [el('h1', { class: 'titulo', text: 'Materiais' }), el('p', { class: 'subtitulo', style: 'margin:0', text: 'Um preço por linha. Clique no título de uma coluna para ordenar; em ⏷ para filtrar.' })]),
        el('div', { class: 'acoes-form' }, [
          el('button', { class: 'botao secundario', type: 'button', text: 'Importar Excel', onclick: abrirImportar }),
          el('button', { class: 'botao', type: 'button', text: '+ Novo material', onclick: () => abrirPreco(null, null) })
        ])
      ]),
      t.no
    );
  }

  // ======================= FICHA DO MATERIAL =======================
  async function fichaMaterial(id) {
    const m = materiais.find((x) => x.id === id);
    if (!m) { $('mt-conteudo').replaceChildren(el('div', { class: 'vazio', text: 'Material não encontrado.' })); return; }
    const ps = precosDe(id);
    const historico = el('div', {}, el('p', { class: 'ajuda', text: 'A carregar o histórico…' }));
    $('mt-conteudo').replaceChildren(...[
      el('a', { class: 'voltar', href: '/materiais', text: '← Materiais' }),
      el('div', { class: 'barra' }, [
        el('div', {}, [el('h1', { class: 'titulo', text: m.nome }), m.categoria ? el('span', { class: 'etiqueta', text: m.categoria }) : null, m.notas ? el('p', { class: 'ajuda', text: m.notas }) : null].filter(Boolean)),
        el('div', { class: 'acoes-form' }, [
          el('button', { class: 'botao', type: 'button', text: '+ Preço de fornecedor', onclick: () => abrirPreco(null, m, ps[0]) })
        ])
      ]),
      el('h2', { class: 'titulo-grupo', text: `Preços por fornecedor (${ps.length})` }),
      ps.length ? el('p', { class: 'ajuda', style: 'margin-top:-.4rem', text: 'Carregue num preço para o editar (e ao nome e à categoria do material).' }) : null,
      ps.length ? el('div', { class: 'tabela-envolvente' }, el('table', {}, [
        el('thead', {}, el('tr', {}, ['Fornecedor', 'Nome no fornecedor', 'Preço', 'Desconto', 'Final s/ IVA', 'Final c/ IVA', 'Transporte', 'Disponibilidade', 'Atualizado'].map((t) => el('th', { text: t })))),
        el('tbody', {}, ps.map((p, i) => el('tr', { class: 'clicavel' + (i === 0 && ps.length > 1 ? ' melhor' : ''), title: 'Editar este preço', onclick: (e) => { if (!e.target.closest('a, button')) abrirPreco(p, m); } }, [
          el('td', {}, [el('a', { href: '/materiais/fornecedores/' + p.fornecedor_id, text: nomeForn(p.fornecedor_id) }), i === 0 && ps.length > 1 ? el('span', { class: 'estado sim', text: ' Mais barato' }) : null].filter(Boolean)),
          el('td', {}, [p.designacao || '—', medidasTexto(p) ? el('div', { class: 'ajuda', style: 'margin:0', text: medidasTexto(p) }) : null, p.detalhes ? el('div', { class: 'ajuda', style: 'margin:0', text: p.detalhes }) : null].filter(Boolean)),
          el('td', { class: 'num', text: `${euros(p.preco)} /${p.unidade || 'un'}` }),
          el('td', { class: 'num', text: Number(p.desconto) ? pct(p.desconto) : '—' }),
          el('td', { class: 'num' }, el('strong', { text: euros(finalSemIva(p)) })),
          el('td', { class: 'num', title: `IVA ${pct(p.iva)}`, text: euros(finalComIva(p)) }),
          el('td', { text: [TRANSPORTE[p.transporte], p.transporte === 'sim' ? INCLUIDO[p.transporte_incluido] : null].filter(Boolean).join(' · ') || '—' }),
          el('td', { text: [DISPONIBILIDADE[p.disponibilidade], p.prazo_dias != null ? `${p.prazo_dias} dias` : null].filter(Boolean).join(' · ') || '—' }),
          el('td', {}, celData(p))
        ])))
      ])) : el('div', { class: 'vazio', text: 'Ainda sem preços. Acrescente o primeiro com "+ Preço de fornecedor".' }),
      caixaConversoes(ps),
      el('h2', { class: 'titulo-grupo', text: 'Histórico de preços' }),
      historico
    ].filter(Boolean));
    if (!ps.length) { historico.replaceChildren(el('p', { class: 'ajuda', text: 'Sem histórico.' })); return; }
    const { data: h } = await sb.from('material_precos_historico').select('*').in('preco_id', ps.map((p) => p.id)).order('registado_em', { ascending: false });
    historico.replaceChildren(h && h.length ? el('div', { class: 'tabela-envolvente' }, el('table', {}, [
      el('thead', {}, el('tr', {}, ['Fornecedor', 'Preço de então', 'Desconto', 'Final s/ IVA', 'Válido desde', 'Substituído em'].map((t) => el('th', { text: t })))),
      el('tbody', {}, h.map((x) => { const p = ps.find((y) => y.id === x.preco_id) || {}; return el('tr', {}, [
        el('td', { text: nomeForn(p.fornecedor_id) }), el('td', { class: 'num', text: `${euros(x.preco)} /${x.unidade || 'un'}` }),
        el('td', { class: 'num', text: Number(x.desconto) ? pct(x.desconto) : '—' }), el('td', { class: 'num', text: euros(Number(x.preco) * (1 - Number(x.desconto))) }),
        el('td', { text: dataPT(x.data_atualizacao) }), el('td', { text: new Date(x.registado_em).toLocaleDateString('pt-PT') })]); }))
    ])) : el('p', { class: 'ajuda', text: 'Ainda sem alterações de preço. Quando um preço mudar, o anterior fica aqui.' }));
  }

  // Caixa de conversões: o preço de cada fornecedor por unidade, ml, m², m³, embalagem, kg e tonelada
  function caixaConversoes(ps) {
    if (!ps.length) return null;
    const linhas = ps.map((p) => ({ p, c: conversoes(p) }));
    const cols = CONVERSOES.filter(([k]) => linhas.some((l) => l.c[k] != null));
    const minimo = Object.fromEntries(cols.map(([k]) => [k, Math.min(...linhas.map((l) => l.c[k]).filter((v) => v != null))]));
    return el('section', { class: 'painel conversoes' }, [
      el('h2', { class: 'titulo', text: 'Conversões' }),
      cols.length > 1 ? el('div', { class: 'tabela-envolvente' }, el('table', {}, [
        el('thead', {}, el('tr', {}, [el('th', { text: 'Fornecedor' }), el('th', { text: 'Medidas' }), ...cols.map(([, t]) => el('th', { class: 'num', text: t }))])),
        el('tbody', {}, linhas.map(({ p, c }) => el('tr', {}, [
          el('td', { text: nomeForn(p.fornecedor_id) }), el('td', { class: 'ajuda', text: medidasTexto(p) || '—' }),
          ...cols.map(([k]) => el('td', { class: 'num' + (ps.length > 1 && c[k] != null && c[k] === minimo[k] ? ' minimo' : '') }, c[k] != null ? euros(c[k]) : '—'))
        ])))
      ])) : null,
      el('p', { class: 'ajuda', text: cols.length > 1
        ? 'Calculado a partir do preço final sem IVA, das medidas (em metros), da quantidade por embalagem e do peso. O valor mais baixo de cada coluna aparece a verde.'
        : 'Para ver o preço por ml, m², m³, embalagem ou kg, preencha as medidas, a quantidade por embalagem ou o peso no preço ("Editar").' })
    ]);
  }

  // ======================= FORNECEDORES =======================
  const simNao = (v) => (v == null ? '—' : v ? 'Sim' : 'Não');
  function listaFornecedores() {
    const linhas = fornecedores.map((f) => ({ f, n: precos.filter((p) => p.fornecedor_id === f.id).length }));
    const t = tabelaFiltravel({
      id: 'fornecedores', linhas, placeholder: 'Procurar fornecedor, categoria, armazém ou contacto',
      procurar: (r) => [r.f.nome, r.f.sede, r.f.armazens, r.f.contacto_nome, r.f.contacto_telefone, r.f.contacto_email, ...(r.f.categorias || [])].join(' '),
      aoClicar: (r) => Hub.ir('materiais/fornecedores/' + r.f.id),
      contagem: (n, tot) => `${n} de ${tot} fornecedores`,
      colunas: [
        { id: 'nome', nome: 'Fornecedor', valor: (r) => r.f.nome, mostrar: (r) => el('strong', { text: r.f.nome }) },
        { id: 'categorias', nome: 'Categorias', valor: (r) => r.f.categorias || [], mostrar: (r) => (r.f.categorias || []).length ? (r.f.categorias || []).map((c) => el('span', { class: 'etiqueta', text: c })) : '—', filtro: true },
        { id: 'n', nome: 'Materiais', valor: (r) => r.n, num: true },
        { id: 'pagamento', nome: 'Pagamento', valor: (r) => PAGAMENTO[r.f.pagamento] || '—', filtro: true },
        { id: 'transporte', nome: 'Transporte', valor: (r) => simNao(r.f.transporte), filtro: true },
        { id: 'armazens', nome: 'Armazéns', valor: (r) => r.f.armazens || '—', filtro: true },
        { id: 'contacto', nome: 'Contacto', valor: (r) => [r.f.contacto_nome, r.f.contacto_telefone].filter(Boolean).join(' · ') || '—' }
      ]
    });
    $('mt-conteudo').replaceChildren(
      el('div', { class: 'barra' }, [
        el('div', {}, [el('h1', { class: 'titulo', text: 'Fornecedores' }), el('p', { class: 'subtitulo', style: 'margin:0', text: 'Clique num fornecedor para ver os materiais dele.' })]),
        el('button', { class: 'botao', type: 'button', text: '+ Novo fornecedor', onclick: () => abrirFornecedor(null) })
      ]),
      t.no
    );
  }

  function fichaFornecedor(id) {
    const f = fornecedores.find((x) => x.id === id);
    if (!f) { $('mt-conteudo').replaceChildren(el('div', { class: 'vazio', text: 'Fornecedor não encontrado.' })); return; }
    const dado = (r, v) => el('div', { class: 'dado' }, [el('span', { class: 'rotulo', text: r }), el('span', {}, v || '—')]);
    const linhas = precos.filter((p) => p.fornecedor_id === id).map((p) => ({ p, m: materiais.find((m) => m.id === p.material_id) || { nome: '—' } }));
    const maisBarato = new Set(materiais.map((m) => precosDe(m.id)).filter((ps) => ps.length > 1).map((ps) => ps[0].id));
    const t = tabelaFiltravel({
      id: 'fornecedor-materiais', linhas, placeholder: 'Procurar nos materiais deste fornecedor',
      procurar: (r) => [r.m.nome, r.m.categoria, r.p.designacao].join(' '),
      aoClicar: (r) => Hub.ir('materiais/' + r.m.id),
      contagem: (n, tot) => `${n} de ${tot} materiais`,
      colunas: [
        { id: 'material', nome: 'Material', valor: (r) => r.m.nome, mostrar: (r) => [el('strong', { text: r.m.nome }), r.p.designacao && r.p.designacao !== r.m.nome ? el('div', { class: 'ajuda', style: 'margin:0', text: r.p.designacao }) : null].filter(Boolean) },
        { id: 'categoria', nome: 'Categoria', valor: (r) => r.m.categoria || '—', filtro: true },
        { id: 'preco', nome: 'Final s/ IVA', valor: (r) => finalSemIva(r.p), mostrar: (r) => celPreco(r.p, maisBarato.has(r.p.id)), num: true },
        { id: 'unidade', nome: 'Unidade', valor: (r) => r.p.unidade || '—', filtro: true },
        { id: 'transporte', nome: 'Transporte', valor: (r) => TRANSPORTE[r.p.transporte] || '—', filtro: true },
        { id: 'incluido', nome: 'Incluído', valor: (r) => INCLUIDO[r.p.transporte_incluido] || '—', filtro: true },
        { id: 'data', nome: 'Atualizado', valor: (r) => r.p.data_atualizacao || '', mostrar: (r) => celData(r.p) }
      ]
    });
    $('mt-conteudo').replaceChildren(
      el('a', { class: 'voltar', href: '/materiais/fornecedores', text: '← Fornecedores' }),
      el('div', { class: 'barra' }, [
        el('div', {}, [el('h1', { class: 'titulo', text: f.nome }), el('div', { class: 'linha-estado' }, (f.categorias || []).map((c) => el('span', { class: 'etiqueta', text: c })))]),
        el('button', { class: 'botao secundario', type: 'button', text: 'Editar', onclick: () => abrirFornecedor(f) })
      ]),
      el('div', { class: 'grelha-ficha' }, [
        el('section', { class: 'painel' }, [el('h2', { class: 'titulo', text: 'Empresa' }), dado('Sede', f.sede), dado('Armazéns', f.armazens), dado('Pagamento', PAGAMENTO[f.pagamento]),
          dado('Transporte', simNao(f.transporte)), dado('Transporte pago', simNao(f.transporte_pago)), f.notas ? dado('Notas', f.notas) : null].filter(Boolean)),
        el('section', { class: 'painel' }, [el('h2', { class: 'titulo', text: 'Contacto' }), dado('Nome', f.contacto_nome),
          dado('Telefone', f.contacto_telefone ? el('a', { href: 'tel:' + f.contacto_telefone.replace(/\s/g, ''), text: f.contacto_telefone }) : null),
          dado('Email', f.contacto_email ? el('a', { href: 'mailto:' + f.contacto_email, text: f.contacto_email }) : null)])
      ]),
      el('h2', { class: 'titulo-grupo', text: `Materiais deste fornecedor (${linhas.length})` }),
      t.no
    );
  }

  // ======================= DIÁLOGOS =======================
  let materialAtual = null, precoAtual = null, precoMaterial = null, fornecedorAtual = null;
  function abrirMaterial(m) {
    materialAtual = m;
    $('dm2-titulo').textContent = m ? 'Editar material' : 'Novo material';
    $('mm-nome').value = m ? m.nome : ''; $('mm-categoria').value = m ? m.categoria || '' : ''; $('mm-notas').value = m ? m.notas || '' : '';
    $('categorias-lista').replaceChildren(...categorias().map((c) => el('option', { value: c })));
    $('mm-apagar').hidden = !m; $('mm-mensagem').textContent = '';
    $('d-material').showModal();
  }
  // p: preço a editar (ou null) · m: material (ou null = material novo) · base: preço de onde copiar medidas/unidade/IVA
  function abrirPreco(p, m, base = null) {
    precoAtual = p; precoMaterial = m;
    $('dp2-titulo').textContent = !m ? 'Novo material' : p ? 'Editar · ' + m.nome : 'Novo preço · ' + m.nome;
    $('mpm-nome').value = m ? m.nome : ''; $('mpm-categoria').value = m ? m.categoria || '' : ''; $('mpm-notas').value = m ? m.notas || '' : '';
    $('categorias-lista').replaceChildren(...categorias().map((c) => el('option', { value: c })));
    $('mp-fornecedor').replaceChildren(...opcoes(fornecedores.map((f) => [f.id, f.nome]), p ? p.fornecedor_id : '', '— Escolher fornecedor —'));
    const fonte = p || base;                       // a editar: o próprio preço; novo preço: copia do preço de base
    const v = (c, padrao = '', copiar = true) => (p ? (p[c] ?? padrao) : copiar && base && base[c] != null ? base[c] : padrao);
    $('mp-designacao').value = p ? p.designacao || '' : ''; $('mp-detalhes').value = v('detalhes', '', false);
    for (const c of ['comprimento', 'largura', 'espessura', 'qtd_embalagem', 'peso_kg']) $('mp-' + c).value = v(c);
    $('mp-qtd_unidade').value = v('qtd_unidade', 'un');
    $('mp-preco').value = p ? p.preco : ''; $('mp-unidade').value = v('unidade', 'un');
    $('mp-desconto').value = p ? Math.round(Number(p.desconto) * 10000) / 100 : 0;
    $('mp-iva').value = fonte ? Math.round(Number(fonte.iva) * 10000) / 100 : 23;
    $('mp-transporte').value = p ? p.transporte || '' : ''; $('mp-transporte_incluido').value = p ? p.transporte_incluido || '' : '';
    $('mp-disponibilidade').value = p ? p.disponibilidade || '' : ''; $('mp-prazo').value = p ? p.prazo_dias ?? '' : '';
    $('mp-data').value = p ? p.data_atualizacao : new Date().toLocaleDateString('sv'); $('mp-obs').value = p ? p.observacoes || '' : '';
    $('mp-apagar').hidden = !p; $('mp-apagar-material').hidden = !m; $('mp-mensagem').textContent = '';
    calcular(); $('d-preco').showModal();
    (!m ? $('mpm-nome') : p ? $('mp-preco') : $('mp-fornecedor')).focus();
  }
  function calcular() {
    const preco = parseFloat($('mp-preco').value), desc = (parseFloat($('mp-desconto').value) || 0) / 100, iva = (parseFloat($('mp-iva').value) || 0) / 100;
    $('mp-final').textContent = isNaN(preco) ? '' : `Final: ${euros(preco * (1 - desc))} sem IVA · ${euros(preco * (1 - desc) * (1 + iva))} com IVA`;
    // pré-visualização das conversões
    const num = (id) => ($(id).value === '' ? null : parseFloat($(id).value));
    const c = isNaN(preco) ? {} : conversoes({ preco, desconto: desc, unidade: $('mp-unidade').value, comprimento: num('mp-comprimento'), largura: num('mp-largura'),
      espessura: num('mp-espessura'), qtd_embalagem: num('mp-qtd_embalagem'), qtd_unidade: $('mp-qtd_unidade').value, peso_kg: num('mp-peso_kg') });
    $('mp-conv').textContent = CONVERSOES.filter(([k]) => c[k] != null).map(([k, t]) => `${t} ${euros(c[k])}`).join(' · ');
  }
  function abrirFornecedor(f) {
    fornecedorAtual = f;
    $('df-titulo').textContent = f ? 'Editar fornecedor' : 'Novo fornecedor';
    for (const c of ['nome', 'sede', 'armazens', 'contacto_nome', 'contacto_telefone', 'contacto_email', 'notas']) $('mf-' + c).value = f ? f[c] || '' : '';
    $('mf-pagamento').value = f ? f.pagamento || '' : '';
    $('mf-transporte').value = f && f.transporte != null ? String(f.transporte) : '';
    $('mf-transporte_pago').value = f && f.transporte_pago != null ? String(f.transporte_pago) : '';
    categoriasForn = new Set(f ? f.categorias || [] : []);
    desenharCategoriasForn();
    $('mf-apagar').hidden = !f; $('mf-mensagem').textContent = '';
    $('d-fornecedor').showModal();
  }

  // categorias do fornecedor: as usadas nos materiais + as que já tem + novas
  let categoriasForn = new Set();
  function desenharCategoriasForn() {
    const todas = [...new Set([...categorias(), ...fornecedores.flatMap((f) => f.categorias || []), ...categoriasForn])].sort((a, b) => a.localeCompare(b, 'pt'));
    $('mf-categorias').replaceChildren(...(todas.length ? todas.map((c) => el('label', {}, [
      el('input', { type: 'checkbox', checked: categoriasForn.has(c), onchange: (e) => { e.target.checked ? categoriasForn.add(c) : categoriasForn.delete(c); } }), ' ' + c]))
      : [el('p', { class: 'ajuda', style: 'margin:0', text: 'Ainda não há categorias. Escreva uma nova em baixo.' })]));
  }

  // ======================= IMPORTAR EXCEL =======================
  // Junta: acrescenta fornecedores, materiais e preços novos; atualiza os preços que mudaram (o anterior vai para o histórico).
  // Preços alterados no Hub depois da data do Excel ficam como estão.
  const CAMPOS_PRECO = ['designacao', 'detalhes', 'preco', 'unidade', 'desconto', 'iva', 'comprimento', 'largura', 'espessura', 'qtd_embalagem', 'qtd_unidade',
    'transporte', 'transporte_incluido', 'disponibilidade', 'prazo_dias', 'data_atualizacao', 'observacoes'];
  let plano = null;
  function carregarSheetJS() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, falha) => document.head.append(el('script', {
      src: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', onload: ok, onerror: () => falha(new Error('Não foi possível carregar o leitor de Excel.')) })));
  }
  function abrirImportar() {
    plano = null;
    $('di-ficheiro').value = ''; $('di-resumo').replaceChildren(); $('di-aplicar').hidden = true; $('di-mensagem').textContent = '';
    $('d-importar').showModal();
  }
  const igual = (a, b) => (a == null || a === '') && (b == null || b === '') ? true
    : typeof a === 'number' || typeof b === 'number' || (!isNaN(parseFloat(a)) && !isNaN(parseFloat(b)) && /^-?[\d.]+$/.test(String(a)) && /^-?[\d.]+$/.test(String(b)))
      ? Math.abs(Number(a) - Number(b)) < 1e-6 : String(a ?? '') === String(b ?? '');

  async function analisar(ficheiro) {
    $('di-resumo').replaceChildren(el('p', { class: 'carregar', text: 'A ler o Excel…' }));
    await carregarSheetJS();
    const wb = XLSX.read(await ficheiro.arrayBuffer(), { cellDates: true });
    const folha = wb.Sheets['Geral Materiais'];
    if (!folha) throw new Error('O ficheiro não tem a folha "Geral Materiais".');
    const lido = LerMateriais.ler(XLSX.utils.sheet_to_json(folha, { header: 1, raw: true, defval: null }));
    await carregar();
    const fornPorNome = new Map(fornecedores.map((f) => [f.nome.toLowerCase(), f]));
    const matPorNome = new Map(materiais.map((m) => [m.nome.toLowerCase(), m]));
    const precoPorChave = new Map(precos.map((p) => [`${p.fornecedor_id}|${(p.designacao || '').toLowerCase()}`, p]));
    const novosForn = lido.fornecedores.filter((f) => !fornPorNome.has(f.nome.toLowerCase()));
    const vistos = new Set();
    const novosMat = lido.precos.map((p) => p.material).filter((nm) => {
      const k = nm.toLowerCase(); if (matPorNome.has(k) || vistos.has(k)) return false; vistos.add(k); return true; });
    const novos = [], alterados = [], iguais = [], maisRecentesHub = [];
    for (const p of lido.precos) {
      const f = fornPorNome.get(p.fornecedor.toLowerCase());
      const atual = f && precoPorChave.get(`${f.id}|${p.designacao.toLowerCase()}`);
      if (!atual) { novos.push(p); continue; }
      const mud = CAMPOS_PRECO.filter((c) => p[c] !== undefined && !(c === 'data_atualizacao' && !p[c]) && !igual(p[c], atual[c]));
      if (!mud.length) iguais.push(p);
      else if (p.data_atualizacao && atual.data_atualizacao > p.data_atualizacao) maisRecentesHub.push(p);
      else alterados.push({ p, atual, mud });
    }
    plano = { lido, novosForn, novosMat, novos, alterados, iguais, maisRecentesHub };
    const precoMudou = alterados.filter((a) => a.mud.some((c) => ['preco', 'desconto', 'iva', 'unidade'].includes(c)));
    $('di-resumo').replaceChildren(...[
      el('ul', { class: 'resumo-importar' }, [
        el('li', {}, [el('strong', { text: lido.precos.length }), ' preços no Excel', lido.repetidas ? ` (${lido.repetidas} linhas repetidas: fica a mais recente)` : '']),
        el('li', {}, [el('strong', { text: novosForn.length }), ' fornecedores novos']),
        el('li', {}, [el('strong', { text: novosMat.length }), ' materiais novos']),
        el('li', {}, [el('strong', { text: novos.length }), ' preços novos']),
        el('li', {}, [el('strong', { text: alterados.length }), ` preços a atualizar (${precoMudou.length} com o valor alterado — o anterior fica no histórico)`]),
        el('li', {}, [el('strong', { text: iguais.length }), ' sem alterações']),
        maisRecentesHub.length ? el('li', {}, [el('strong', { text: maisRecentesHub.length }), ' alterados no Hub depois da data do Excel (ficam como estão)']) : null,
        lido.ignoradas.length ? el('li', {}, [el('strong', { text: lido.ignoradas.length }), ' linhas ignoradas: ', lido.ignoradas.map((x) => `linha ${x.linha} (${x.motivo})`).join(', ')]) : null
      ].filter(Boolean)),
      precoMudou.length ? el('details', {}, [el('summary', { text: 'Ver os preços que mudam' }),
        el('ul', { class: 'mudancas' }, precoMudou.slice(0, 200).map(({ p, atual }) => el('li', {}, `${p.designacao} · ${p.fornecedor}: ${euros(finalSemIva(atual))} → ${euros(finalSemIva(p))}`)))]) : null,
      el('p', { class: 'ajuda', text: 'Nada é apagado. Os fornecedores existentes só recebem os dados que lhes faltam.' })
    ].filter(Boolean));
    $('di-aplicar').hidden = !(novosForn.length || novosMat.length || novos.length || alterados.length);
    if ($('di-aplicar').hidden) $('di-mensagem').textContent = 'O Hub já está igual ao Excel.';
  }

  async function aplicar() {
    const { lido, novosForn, novosMat, novos, alterados } = plano;
    const progresso = $('di-progresso'), b = $('di-aplicar');
    b.disabled = true; progresso.hidden = false;
    const total = novosForn.length + novosMat.length + novos.length + alterados.length; let feitos = 0;
    const passo = (n = 1) => { feitos += n; progresso.value = Math.round((feitos / total) * 100); };
    const lotes = (lista, tam = 200) => Array.from({ length: Math.ceil(lista.length / tam) }, (_, i) => lista.slice(i * tam, i * tam + tam));
    try {
      if (novosForn.length) { await ok(sb.from('fornecedores').insert(novosForn), 'Não foi possível criar os fornecedores.'); passo(novosForn.length); }
      // dados que faltam nos fornecedores existentes
      for (const f of lido.fornecedores) {
        const atual = fornecedores.find((x) => x.nome.toLowerCase() === f.nome.toLowerCase()); if (!atual) continue;
        const falta = Object.fromEntries(Object.entries(f).filter(([k, v]) => k !== 'nome' && v != null && (atual[k] == null || atual[k] === '')));
        if (Object.keys(falta).length) await ok(sb.from('fornecedores').update(falta).eq('id', atual.id));
      }
      for (const l of lotes(novosMat)) { await ok(sb.from('materiais').insert(l.map((nome) => ({ nome }))), 'Não foi possível criar os materiais.'); passo(l.length); }
      await carregar();
      const fId = new Map(fornecedores.map((f) => [f.nome.toLowerCase(), f.id])), mId = new Map(materiais.map((m) => [m.nome.toLowerCase(), m.id]));
      const linha = (p) => { const r = { material_id: mId.get(p.material.toLowerCase()), fornecedor_id: fId.get(p.fornecedor.toLowerCase()) };
        for (const c of CAMPOS_PRECO) r[c] = p[c] ?? null; if (!r.data_atualizacao) r.data_atualizacao = new Date().toLocaleDateString('sv'); return r; };
      for (const l of lotes(novos)) { await ok(sb.from('material_precos').insert(l.map(linha)), 'Não foi possível criar os preços.'); passo(l.length); }
      // atualizações: 6 de cada vez
      for (const l of lotes(alterados, 6)) {
        await Promise.all(l.map(({ p, atual, mud }) => ok(sb.from('material_precos').update(Object.fromEntries(mud.map((c) => [c, p[c] ?? null]))).eq('id', atual.id), 'Não foi possível atualizar um preço.')));
        passo(l.length);
      }
      $('d-importar').close();
      aviso(`Importação concluída: ${novos.length} preços novos, ${alterados.length} atualizados, ${novosMat.length} materiais e ${novosForn.length} fornecedores novos.`, 'ok');
      await recarregar();
    } catch (e) { $('di-mensagem').textContent = e.message + ' O que já foi importado ficou guardado; pode voltar a importar o mesmo ficheiro para continuar.'; }
    finally { b.disabled = false; progresso.hidden = true; }
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('di-ficheiro').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      $('di-mensagem').textContent = ''; $('di-aplicar').hidden = true;
      try { await analisar(f); } catch (err) { $('di-resumo').replaceChildren(); $('di-mensagem').textContent = err.message; }
    });
    $('di-aplicar').addEventListener('click', aplicar);
    const enviar = (form, fn) => $(form).addEventListener('submit', async (ev) => { if (!ev.submitter || ev.submitter.value !== 'ok') return; ev.preventDefault(); await fn(); });
    // material
    enviar('f-material', async () => {
      const r = { nome: $('mm-nome').value.trim(), categoria: $('mm-categoria').value.trim() || null, notas: $('mm-notas').value.trim() || null };
      if (!r.nome) { $('mm-mensagem').textContent = 'Indique o nome do material.'; return; }
      try {
        if (materialAtual) await ok(sb.from('materiais').update(r).eq('id', materialAtual.id));
        else { const n = await ok(sb.from('materiais').insert(r).select('id').single()); $('d-material').close(); await carregar(); Hub.ir('materiais/' + n.id); return; }
        $('d-material').close(); await recarregar();
      } catch (e) { $('mm-mensagem').textContent = e.message; }
    });
    $('mm-apagar').addEventListener('click', async () => {
      if (!confirm(`Apagar o material "${materialAtual.nome}" e todos os seus preços?`)) return;
      try { await ok(sb.from('materiais').delete().eq('id', materialAtual.id), 'Não foi possível apagar.'); $('d-material').close(); await carregar(); Hub.ir('materiais'); }
      catch (e) { $('mm-mensagem').textContent = e.message; }
    });
    // preço
    // ao mudar o valor, a data de atualização passa a ser hoje
    ['mp-preco', 'mp-desconto', 'mp-iva'].forEach((id) => $(id).addEventListener('input', () => { calcular(); $('mp-data').value = new Date().toLocaleDateString('sv'); }));
    ['mp-unidade', 'mp-comprimento', 'mp-largura', 'mp-espessura', 'mp-qtd_embalagem', 'mp-qtd_unidade', 'mp-peso_kg'].forEach((id) => $(id).addEventListener('input', calcular));
    // fornecedor escolhido num preço novo: sugere o transporte desse fornecedor
    $('mp-fornecedor').addEventListener('change', () => {
      const f = fornecedores.find((x) => x.id === $('mp-fornecedor').value); if (!f || precoAtual) return;
      if (!$('mp-transporte').value && f.transporte != null) $('mp-transporte').value = f.transporte ? 'sim' : 'nao';
      if (!$('mp-transporte_incluido').value && f.transporte_pago != null) $('mp-transporte_incluido').value = f.transporte_pago ? 'sim' : 'nao';
    });
    enviar('f-preco', async () => {
      const num = (id) => ($(id).value === '' ? null : parseFloat($(id).value));
      const r = { material_id: precoMaterial ? precoMaterial.id : null, fornecedor_id: $('mp-fornecedor').value || null, designacao: $('mp-designacao').value.trim() || null,
        detalhes: $('mp-detalhes').value.trim() || null, preco: num('mp-preco'), unidade: $('mp-unidade').value.trim() || null,
        comprimento: num('mp-comprimento'), largura: num('mp-largura'), espessura: num('mp-espessura'), qtd_embalagem: num('mp-qtd_embalagem'),
        qtd_unidade: $('mp-qtd_embalagem').value === '' ? null : $('mp-qtd_unidade').value, peso_kg: num('mp-peso_kg'),
        transporte: $('mp-transporte').value || null, transporte_incluido: $('mp-transporte').value === 'sim' ? ($('mp-transporte_incluido').value || null) : null,
        desconto: (num('mp-desconto') || 0) / 100, iva: (num('mp-iva') ?? 23) / 100, disponibilidade: $('mp-disponibilidade').value || null,
        prazo_dias: $('mp-prazo').value === '' ? null : parseInt($('mp-prazo').value, 10), data_atualizacao: $('mp-data').value || new Date().toLocaleDateString('sv'),
        observacoes: $('mp-obs').value.trim() || null };
      if (!r.fornecedor_id) { $('mp-mensagem').textContent = 'Escolha o fornecedor.'; return; }
      if (r.preco == null || isNaN(r.preco) || r.preco < 0) { $('mp-mensagem').textContent = 'Indique o preço sem IVA.'; return; }
      if (r.desconto < 0 || r.desconto >= 1) { $('mp-mensagem').textContent = 'O desconto tem de estar entre 0 e 99%.'; return; }
      for (const c of ['comprimento', 'largura', 'espessura', 'qtd_embalagem', 'peso_kg']) if (r[c] != null && !(r[c] > 0)) { $('mp-mensagem').textContent = 'As medidas, a quantidade e o peso têm de ser maiores que zero.'; return; }
      try {
        if (!precoMaterial) {
          // janela completa: cria o material e o primeiro preço
          const nome = $('mpm-nome').value.trim();
          if (!nome) { $('mp-mensagem').textContent = 'Indique o nome do material.'; return; }
          const novo = await ok(sb.from('materiais').insert({ nome, categoria: $('mpm-categoria').value.trim() || null, notas: $('mpm-notas').value.trim() || null }).select('id').single());
          r.material_id = novo.id;
          if (!r.designacao) r.designacao = nome;
          await ok(sb.from('material_precos').insert(r), 'O material foi criado, mas não o preço.');
          $('d-preco').close(); await carregar(); Hub.ir('materiais/' + novo.id); return;
        }
        // o nome, a categoria e as notas do material também se editam nesta janela
        const mat = { nome: $('mpm-nome').value.trim(), categoria: $('mpm-categoria').value.trim() || null, notas: $('mpm-notas').value.trim() || null };
        if (!mat.nome) { $('mp-mensagem').textContent = 'Indique o nome do material.'; return; }
        if (mat.nome !== precoMaterial.nome || mat.categoria !== (precoMaterial.categoria || null) || mat.notas !== (precoMaterial.notas || null))
          await ok(sb.from('materiais').update(mat).eq('id', precoMaterial.id));
        await ok(precoAtual ? sb.from('material_precos').update(r).eq('id', precoAtual.id) : sb.from('material_precos').insert(r)); $('d-preco').close(); await recarregar();
      } catch (e) { $('mp-mensagem').textContent = e.message; }
    });
    $('mp-apagar-material').addEventListener('click', async () => {
      const n = precosDe(precoMaterial.id).length;
      if (!confirm(`Apagar o material "${precoMaterial.nome}"${n ? ` e os seus ${n} preço${n === 1 ? '' : 's'}` : ''}?`)) return;
      try { await ok(sb.from('materiais').delete().eq('id', precoMaterial.id), 'Não foi possível apagar.'); $('d-preco').close(); await carregar(); Hub.ir('materiais'); }
      catch (e) { $('mp-mensagem').textContent = e.message; }
    });
    $('mp-apagar').addEventListener('click', async () => {
      if (!confirm(`Apagar o preço de ${nomeForn(precoAtual.fornecedor_id)}? O histórico deste preço também é apagado.`)) return;
      try { await ok(sb.from('material_precos').delete().eq('id', precoAtual.id), 'Não foi possível apagar.'); $('d-preco').close(); await recarregar(); }
      catch (e) { $('mp-mensagem').textContent = e.message; }
    });
    // fornecedor
    const novaCategoria = () => { const c = $('mf-nova-categoria').value.trim(); if (!c) return; categoriasForn.add(c); $('mf-nova-categoria').value = ''; desenharCategoriasForn(); };
    $('mf-acrescentar-categoria').addEventListener('click', novaCategoria);
    $('mf-nova-categoria').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); novaCategoria(); } });
    enviar('f-fornecedor', async () => {
      const t = (c) => $('mf-' + c).value.trim() || null;
      const b = (c) => ($('mf-' + c).value === '' ? null : $('mf-' + c).value === 'true');
      const r = { nome: t('nome'), sede: t('sede'), armazens: t('armazens'), pagamento: t('pagamento'), transporte: b('transporte'), transporte_pago: b('transporte_pago'),
        contacto_nome: t('contacto_nome'), contacto_telefone: t('contacto_telefone'), contacto_email: t('contacto_email'), notas: t('notas'),
        categorias: [...categoriasForn].sort((a, b) => a.localeCompare(b, 'pt')) };
      if (!r.nome) { $('mf-mensagem').textContent = 'Indique o nome do fornecedor.'; return; }
      try {
        if (fornecedorAtual) await ok(sb.from('fornecedores').update(r).eq('id', fornecedorAtual.id));
        else { const n = await ok(sb.from('fornecedores').insert(r).select('id').single()); $('d-fornecedor').close(); await carregar(); Hub.ir('materiais/fornecedores/' + n.id); return; }
        $('d-fornecedor').close(); await recarregar();
      } catch (e) { $('mf-mensagem').textContent = e.message; }
    });
    $('mf-apagar').addEventListener('click', async () => {
      if (!confirm(`Apagar o fornecedor "${fornecedorAtual.nome}"?`)) return;
      try { await ok(sb.from('fornecedores').delete().eq('id', fornecedorAtual.id), 'Não foi possível apagar.'); $('d-fornecedor').close(); await carregar(); Hub.ir('materiais/fornecedores'); }
      catch (e) { $('mf-mensagem').textContent = e.message; }
    });
  });

  window.MateriaisHub = { mostrar };
})();
