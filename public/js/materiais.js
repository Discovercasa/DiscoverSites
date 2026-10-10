// Separador "Materiais" (só ADMIN e Administrador): catálogo de materiais, preços por fornecedor e fornecedores.
(function () {
  const { sb, $, el } = Hub;
  const PAGAMENTO = { conta_corrente: 'Conta corrente', pronto_pagamento: 'Pronto pagamento', antes_levantamento: 'Antes do levantamento' };
  const DISPONIBILIDADE = { imediata: 'Imediata', encomenda: 'Por encomenda' };
  const MESES_DESATUALIZADO = 6;

  let eu = null, carregado = false, materiais = [], precos = [], fornecedores = [];
  let filtro = Hub.recordar('materiais.filtro', { texto: '', fornecedor: '', categoria: '', desatualizado: false });

  async function ok(p, msg = 'Não foi possível guardar.') { const { data, error } = await p; if (error) { console.error(error); throw new Error(error.code === '23505' ? 'Já existe um registo com esse nome.' : error.code === '23503' ? 'Não é possível apagar: há preços ligados a este fornecedor.' : msg); } return data; }
  const euros = (n) => Number(n || 0).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const pct = (n) => `${Math.round(Number(n || 0) * 1000) / 10}%`;
  const dataPT = (s) => (s ? new Date(s + 'T00:00:00').toLocaleDateString('pt-PT') : '—');
  const normal = (t) => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const finalSemIva = (p) => Number(p.preco) * (1 - Number(p.desconto || 0));
  const finalComIva = (p) => finalSemIva(p) * (1 + Number(p.iva || 0));
  const desatualizado = (p) => { const d = new Date(p.data_atualizacao + 'T00:00:00'); d.setMonth(d.getMonth() + MESES_DESATUALIZADO); return d < new Date(); };
  const nomeForn = (id) => (fornecedores.find((f) => f.id === id) || {}).nome || '—';
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

  // ======================= LISTA DE MATERIAIS =======================
  function listaMateriais() {
    const pesquisa = el('input', { type: 'search', placeholder: 'Procurar material, designação ou fornecedor', value: filtro.texto, 'aria-label': 'Procurar materiais' });
    const forn = el('select', { 'aria-label': 'Fornecedor' }, opcoes(fornecedores.map((f) => [f.id, f.nome]), filtro.fornecedor, 'Todos os fornecedores'));
    const cat = el('select', { 'aria-label': 'Categoria' }, opcoes([...categorias().map((c) => [c, c]), ['__sem', 'Sem categoria']], filtro.categoria, 'Todas as categorias'));
    const desat = el('input', { type: 'checkbox', checked: filtro.desatualizado });
    const corpo = el('tbody');
    const contagem = el('p', { class: 'ajuda' });

    function desenharLinhas() {
      const t = normal(filtro.texto.trim());
      const linhas = materiais.map((m) => ({ m, ps: precosDe(m.id) })).filter(({ m, ps }) => {
        if (filtro.fornecedor && !ps.some((p) => p.fornecedor_id === filtro.fornecedor)) return false;
        if (filtro.categoria === '__sem' ? m.categoria : filtro.categoria && m.categoria !== filtro.categoria) return false;
        if (filtro.desatualizado && !ps.some(desatualizado)) return false;
        if (t && !normal([m.nome, m.categoria, ...ps.map((p) => p.designacao), ...ps.map((p) => nomeForn(p.fornecedor_id))].join(' ')).includes(t)) return false;
        return true;
      });
      contagem.textContent = `${linhas.length} de ${materiais.length} materiais`;
      corpo.replaceChildren(...(linhas.length ? linhas.map(({ m, ps }) => {
        const melhor = ps[0];

        return el('tr', { class: 'clicavel', onclick: () => Hub.ir('materiais/' + m.id), title: 'Abrir' }, [
          el('td', {}, [el('strong', { text: m.nome }), melhor && melhor.designacao && melhor.designacao !== m.nome ? el('div', { class: 'ajuda', style: 'margin:0', text: melhor.designacao }) : null].filter(Boolean)),
          el('td', { text: m.categoria || '—' }),
          el('td', { class: 'num' }, melhor ? [el('strong', { text: euros(finalSemIva(melhor)) }), el('span', { class: 'ajuda', text: ` /${melhor.unidade || 'un'}` })] : '—'),
          el('td', { text: melhor ? nomeForn(melhor.fornecedor_id) : '—' }),
          el('td', { class: 'num', text: ps.length > 1 ? `${ps.length} fornecedores` : ps.length ? '1' : '—' }),
          el('td', {}, melhor ? el('span', { class: desatualizado(melhor) ? 'estado aviso' : '', title: desatualizado(melhor) ? `Mais de ${MESES_DESATUALIZADO} meses` : '', text: dataPT(melhor.data_atualizacao) }) : '—')
        ]);
      }) : [el('tr', {}, el('td', { colspan: 6, text: 'Nenhum material com estes filtros.' }))]));
    }
    const mudar = () => { filtro = { texto: pesquisa.value, fornecedor: forn.value, categoria: cat.value, desatualizado: desat.checked }; Hub.lembrar('materiais.filtro', filtro); desenharLinhas(); };
    pesquisa.addEventListener('input', mudar); [forn, cat, desat].forEach((x) => x.addEventListener('change', mudar));

    $('mt-conteudo').replaceChildren(
      el('div', { class: 'barra' }, [
        el('div', {}, [el('h1', { class: 'titulo', text: 'Materiais' }), el('p', { class: 'subtitulo', style: 'margin:0', text: 'Preço final sem IVA (com desconto). O mais barato de cada material aparece primeiro.' })]),
        el('button', { class: 'botao', type: 'button', text: '+ Novo material', onclick: () => abrirMaterial(null) })
      ]),
      el('div', { class: 'filtros' }, [pesquisa, forn, cat, el('label', { class: 'interruptor' }, [desat, `Preço com mais de ${MESES_DESATUALIZADO} meses`])]),
      contagem,
      el('div', { class: 'tabela-envolvente' }, el('table', { class: 'tabela-materiais' }, [
        el('thead', {}, el('tr', {}, ['Material', 'Categoria', 'Melhor preço s/ IVA', 'Fornecedor', 'Preços', 'Atualizado'].map((t) => el('th', { text: t })))),
        corpo
      ]))
    );
    desenharLinhas();
  }

  // ======================= FICHA DO MATERIAL =======================
  async function fichaMaterial(id) {
    const m = materiais.find((x) => x.id === id);
    if (!m) { $('mt-conteudo').replaceChildren(el('div', { class: 'vazio', text: 'Material não encontrado.' })); return; }
    const ps = precosDe(id);
    const historico = el('div', {}, el('p', { class: 'ajuda', text: 'A carregar o histórico…' }));
    $('mt-conteudo').replaceChildren(
      el('a', { class: 'voltar', href: '/materiais', text: '← Materiais' }),
      el('div', { class: 'barra' }, [
        el('div', {}, [el('h1', { class: 'titulo', text: m.nome }), m.categoria ? el('span', { class: 'etiqueta', text: m.categoria }) : null, m.notas ? el('p', { class: 'ajuda', text: m.notas }) : null].filter(Boolean)),
        el('div', { class: 'acoes-form' }, [
          el('button', { class: 'botao', type: 'button', text: '+ Preço de fornecedor', onclick: () => abrirPreco(null, m) }),
          el('button', { class: 'botao secundario', type: 'button', text: 'Editar', onclick: () => abrirMaterial(m) })
        ])
      ]),
      el('h2', { class: 'titulo-grupo', text: `Preços por fornecedor (${ps.length})` }),
      ps.length ? el('div', { class: 'tabela-envolvente' }, el('table', {}, [
        el('thead', {}, el('tr', {}, ['Fornecedor', 'Designação', 'Preço', 'Desconto', 'Final s/ IVA', 'Final c/ IVA', 'Disponibilidade', 'Atualizado', ''].map((t) => el('th', { text: t })))),
        el('tbody', {}, ps.map((p, i) => el('tr', { class: i === 0 && ps.length > 1 ? 'melhor' : '' }, [
          el('td', {}, [el('a', { href: '/materiais/fornecedores/' + p.fornecedor_id, text: nomeForn(p.fornecedor_id) }), i === 0 && ps.length > 1 ? el('span', { class: 'estado sim', text: ' Mais barato' }) : null].filter(Boolean)),
          el('td', {}, [p.designacao || '—', p.dimensoes ? el('div', { class: 'ajuda', style: 'margin:0', text: p.dimensoes }) : null, p.detalhes ? el('div', { class: 'ajuda', style: 'margin:0', text: p.detalhes }) : null].filter(Boolean)),
          el('td', { class: 'num', text: `${euros(p.preco)} /${p.unidade || 'un'}` }),
          el('td', { class: 'num', text: Number(p.desconto) ? pct(p.desconto) : '—' }),
          el('td', { class: 'num' }, el('strong', { text: euros(finalSemIva(p)) })),
          el('td', { class: 'num', title: `IVA ${pct(p.iva)}`, text: euros(finalComIva(p)) }),
          el('td', { text: [DISPONIBILIDADE[p.disponibilidade], p.prazo_dias != null ? `${p.prazo_dias} dias` : null].filter(Boolean).join(' · ') || '—' }),
          el('td', {}, el('span', { class: desatualizado(p) ? 'estado aviso' : '', text: dataPT(p.data_atualizacao), title: desatualizado(p) ? `Mais de ${MESES_DESATUALIZADO} meses` : '' })),
          el('td', {}, el('button', { class: 'botao secundario pequeno', type: 'button', text: 'Editar', title: 'Editar este preço', onclick: () => abrirPreco(p, m) }))
        ])))
      ])) : el('div', { class: 'vazio', text: 'Ainda sem preços. Acrescente o primeiro com "+ Preço de fornecedor".' }),
      el('h2', { class: 'titulo-grupo', text: 'Histórico de preços' }),
      historico
    );
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

  // ======================= FORNECEDORES =======================
  function listaFornecedores() {
    $('mt-conteudo').replaceChildren(
      el('div', { class: 'barra' }, [
        el('div', {}, [el('h1', { class: 'titulo', text: 'Fornecedores' }), el('p', { class: 'subtitulo', style: 'margin:0', text: `${fornecedores.length} fornecedores.` })]),
        el('button', { class: 'botao', type: 'button', text: '+ Novo fornecedor', onclick: () => abrirFornecedor(null) })
      ]),
      el('div', { class: 'grelha' }, fornecedores.map((f) => {
        const n = precos.filter((p) => p.fornecedor_id === f.id).length;
        return el('a', { class: 'cartao', href: '/materiais/fornecedores/' + f.id }, [
          el('h2', { class: 'titulo', text: f.nome }),
          el('p', { text: f.armazens || f.sede || '—' }),
          el('div', { class: 'linha-estado' }, [
            el('span', { class: 'etiqueta', text: `${n} material${n === 1 ? '' : 'is'}` }),
            f.pagamento ? el('span', { class: 'etiqueta', text: PAGAMENTO[f.pagamento] }) : null,
            f.transporte ? el('span', { class: 'etiqueta', text: f.transporte_pago ? 'Transporte (pago)' : 'Transporte' }) : null
          ].filter(Boolean))
        ]);
      }))
    );
  }

  function fichaFornecedor(id) {
    const f = fornecedores.find((x) => x.id === id);
    if (!f) { $('mt-conteudo').replaceChildren(el('div', { class: 'vazio', text: 'Fornecedor não encontrado.' })); return; }
    const ps = precos.filter((p) => p.fornecedor_id === id).map((p) => ({ p, m: materiais.find((m) => m.id === p.material_id) || {} })).sort((a, b) => (a.m.nome || '').localeCompare(b.m.nome || ''));
    const dado = (r, v) => el('div', { class: 'dado' }, [el('span', { class: 'rotulo', text: r }), el('span', {}, v || '—')]);
    const sim = (v) => (v == null ? '—' : v ? 'Sim' : 'Não');
    $('mt-conteudo').replaceChildren(
      el('a', { class: 'voltar', href: '/materiais/fornecedores', text: '← Fornecedores' }),
      el('div', { class: 'barra' }, [el('h1', { class: 'titulo', text: f.nome }), el('button', { class: 'botao secundario', type: 'button', text: 'Editar', onclick: () => abrirFornecedor(f) })]),
      el('div', { class: 'grelha-ficha' }, [
        el('section', { class: 'painel' }, [el('h2', { class: 'titulo', text: 'Empresa' }), dado('Sede', f.sede), dado('Armazéns', f.armazens), dado('Pagamento', PAGAMENTO[f.pagamento]),
          dado('Transporte', sim(f.transporte)), dado('Transporte pago', sim(f.transporte_pago)), f.notas ? dado('Notas', f.notas) : null].filter(Boolean)),
        el('section', { class: 'painel' }, [el('h2', { class: 'titulo', text: 'Contacto' }), dado('Nome', f.contacto_nome),
          dado('Telefone', f.contacto_telefone ? el('a', { href: 'tel:' + f.contacto_telefone.replace(/\s/g, ''), text: f.contacto_telefone }) : null),
          dado('Email', f.contacto_email ? el('a', { href: 'mailto:' + f.contacto_email, text: f.contacto_email }) : null)])
      ]),
      el('h2', { class: 'titulo-grupo', text: `Materiais deste fornecedor (${ps.length})` }),
      ps.length ? el('div', { class: 'tabela-envolvente' }, el('table', {}, [
        el('thead', {}, el('tr', {}, ['Material', 'Designação', 'Final s/ IVA', 'Atualizado'].map((t) => el('th', { text: t })))),
        el('tbody', {}, ps.map(({ p, m }) => el('tr', { class: 'clicavel', onclick: () => Hub.ir('materiais/' + m.id) }, [
          el('td', { text: m.nome || '—' }), el('td', { text: p.designacao || '—' }),
          el('td', { class: 'num', text: `${euros(finalSemIva(p))} /${p.unidade || 'un'}` }),
          el('td', {}, el('span', { class: desatualizado(p) ? 'estado aviso' : '', text: dataPT(p.data_atualizacao) }))
        ])))
      ])) : el('p', { class: 'ajuda', text: 'Ainda sem materiais.' })
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
  function abrirPreco(p, m) {
    precoAtual = p; precoMaterial = m;
    $('dp2-titulo').textContent = (p ? 'Editar preço · ' : 'Novo preço · ') + m.nome;
    $('mp-fornecedor').replaceChildren(...opcoes(fornecedores.map((f) => [f.id, f.nome]), p ? p.fornecedor_id : '', '— Escolher fornecedor —'));
    const v = (c, padrao = '') => (p && p[c] != null ? p[c] : padrao);
    $('mp-designacao').value = v('designacao', m.nome); $('mp-dimensoes').value = v('dimensoes'); $('mp-detalhes').value = v('detalhes');
    $('mp-preco').value = v('preco'); $('mp-unidade').value = v('unidade', 'un');
    $('mp-desconto').value = p ? Math.round(Number(p.desconto) * 10000) / 100 : 0; $('mp-iva').value = p ? Math.round(Number(p.iva) * 10000) / 100 : 23;
    $('mp-disponibilidade').value = v('disponibilidade'); $('mp-prazo').value = v('prazo_dias');
    $('mp-data').value = p ? p.data_atualizacao : new Date().toLocaleDateString('sv'); $('mp-obs').value = v('observacoes');
    $('mp-apagar').hidden = !p; $('mp-mensagem').textContent = '';
    calcular(); $('d-preco').showModal();
  }
  function calcular() {
    const preco = parseFloat($('mp-preco').value), desc = (parseFloat($('mp-desconto').value) || 0) / 100, iva = (parseFloat($('mp-iva').value) || 0) / 100;
    $('mp-final').textContent = isNaN(preco) ? '' : `Final: ${euros(preco * (1 - desc))} sem IVA · ${euros(preco * (1 - desc) * (1 + iva))} com IVA`;
  }
  function abrirFornecedor(f) {
    fornecedorAtual = f;
    $('df-titulo').textContent = f ? 'Editar fornecedor' : 'Novo fornecedor';
    for (const c of ['nome', 'sede', 'armazens', 'contacto_nome', 'contacto_telefone', 'contacto_email', 'notas']) $('mf-' + c).value = f ? f[c] || '' : '';
    $('mf-pagamento').value = f ? f.pagamento || '' : '';
    $('mf-transporte').value = f && f.transporte != null ? String(f.transporte) : '';
    $('mf-transporte_pago').value = f && f.transporte_pago != null ? String(f.transporte_pago) : '';
    $('mf-apagar').hidden = !f; $('mf-mensagem').textContent = '';
    $('d-fornecedor').showModal();
  }

  document.addEventListener('DOMContentLoaded', () => {
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
    enviar('f-preco', async () => {
      const num = (id) => ($(id).value === '' ? null : parseFloat($(id).value));
      const r = { material_id: precoMaterial.id, fornecedor_id: $('mp-fornecedor').value || null, designacao: $('mp-designacao').value.trim() || null,
        dimensoes: $('mp-dimensoes').value.trim() || null, detalhes: $('mp-detalhes').value.trim() || null, preco: num('mp-preco'), unidade: $('mp-unidade').value.trim() || null,
        desconto: (num('mp-desconto') || 0) / 100, iva: (num('mp-iva') ?? 23) / 100, disponibilidade: $('mp-disponibilidade').value || null,
        prazo_dias: $('mp-prazo').value === '' ? null : parseInt($('mp-prazo').value, 10), data_atualizacao: $('mp-data').value || new Date().toLocaleDateString('sv'),
        observacoes: $('mp-obs').value.trim() || null };
      if (!r.fornecedor_id) { $('mp-mensagem').textContent = 'Escolha o fornecedor.'; return; }
      if (r.preco == null || isNaN(r.preco) || r.preco < 0) { $('mp-mensagem').textContent = 'Indique o preço sem IVA.'; return; }
      if (r.desconto < 0 || r.desconto >= 1) { $('mp-mensagem').textContent = 'O desconto tem de estar entre 0 e 99%.'; return; }
      try { await ok(precoAtual ? sb.from('material_precos').update(r).eq('id', precoAtual.id) : sb.from('material_precos').insert(r)); $('d-preco').close(); await recarregar(); }
      catch (e) { $('mp-mensagem').textContent = e.message; }
    });
    $('mp-apagar').addEventListener('click', async () => {
      if (!confirm(`Apagar o preço de ${nomeForn(precoAtual.fornecedor_id)}? O histórico deste preço também é apagado.`)) return;
      try { await ok(sb.from('material_precos').delete().eq('id', precoAtual.id), 'Não foi possível apagar.'); $('d-preco').close(); await recarregar(); }
      catch (e) { $('mp-mensagem').textContent = e.message; }
    });
    // fornecedor
    enviar('f-fornecedor', async () => {
      const t = (c) => $('mf-' + c).value.trim() || null;
      const b = (c) => ($('mf-' + c).value === '' ? null : $('mf-' + c).value === 'true');
      const r = { nome: t('nome'), sede: t('sede'), armazens: t('armazens'), pagamento: t('pagamento'), transporte: b('transporte'), transporte_pago: b('transporte_pago'),
        contacto_nome: t('contacto_nome'), contacto_telefone: t('contacto_telefone'), contacto_email: t('contacto_email'), notas: t('notas') };
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
