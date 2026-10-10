// Separador "Checklist" do Hub.
(function () {
  const { sb, PAPEIS, $, el } = Hub;
  const PAPEIS_RESTRINGIVEIS = ['obra', 'subempreiteiro', 'cliente'];

  let eu = null, gestor = false, editar = false, pedida = null, iniciado = false;
  const FILTROS_VAZIOS = { texto: '', estado: '', resp: '', restritos: false };
  let verEscondidos = Hub.recordar('checklist.verEscondidos', false);
  let fechados = new Set(Hub.recordar('checklist.fechados', []));
  const lembrarFechados = () => Hub.lembrar('checklist.fechados', [...fechados]);
  let filtros = Object.assign({}, FILTROS_VAZIOS, Hub.recordar('checklist.filtros', {}));
  const filtroAtivo = () => !!(filtros.texto.trim() || filtros.estado || filtros.resp || filtros.restritos);
  const normal = (t) => (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let pessoas = [];                 // gestores: todas as contas ativas
  const nomes = new Map();          // id -> nome
  let obras = [], obraId = null, membro = false;
  let fases = [], itens = [], faseId = null;
  let estado = new Map(), escondidos = new Set(), responsaveis = new Map(), partilhas = [];

  // ---------- utilitários ----------
  function aviso(texto, tipo = 'erro') { const m = $('ck-aviso'); m.textContent = texto || ''; m.className = 'mensagem ' + (texto ? tipo : ''); }
  const porOrdem = (a, b) => a.ordem - b.ordem;
  const filhosDe = (paiId, fase) => itens.filter((i) => (paiId ? i.parent_id === paiId : !i.parent_id && i.fase_id === fase)).sort(porOrdem);
  const nomeDe = (id) => nomes.get(id) || 'alguém';
  const data = (iso) => new Date(iso).toLocaleDateString('pt-PT');
  async function ok(promessa, msgErro = 'Não foi possível guardar.') {
    const { data: d, error } = await promessa;
    if (error) { console.error(error); throw new Error(msgErro); }
    return d;
  }

  function pedirTexto(titulo, valor = '', rotulo = 'Nome') {
    return new Promise((resolver) => {
      $('dt-titulo').textContent = titulo; $('dt-rotulo').textContent = rotulo; $('dt-valor').value = valor;
      const f = $('f-texto');
      f.onsubmit = (ev) => {
        const v = ev.submitter && ev.submitter.value === 'ok' ? $('dt-valor').value.trim() : null;
        if (ev.submitter && ev.submitter.value === 'ok' && !v) { ev.preventDefault(); return; }
        resolver(v || null);
      };
      $('d-texto').onclose = () => resolver(null);
      $('d-texto').showModal(); $('dt-valor').focus();
    });
  }

  // ---------- visibilidade nesta obra ----------
  function escondidoNaObra(it) {
    for (let x = it; x; x = itens.find((i) => i.id === x.parent_id)) if (escondidos.has(x.id)) return true;
    return false;
  }
  function partilhadoComigo(it) {
    const meus = new Set(partilhas.filter((p) => p.user_id === eu.id).map((p) => p.item_id));
    for (let x = it; x; x = itens.find((i) => i.id === x.parent_id)) if (meus.has(x.id)) return true;
    return false;
  }
  function temPartilhaAbaixo(it) {
    return partilhadoComigo(it) || filhosDe(it.id).some(temPartilhaAbaixo);
  }
  // O que esta pessoa vê nesta obra (a base de dados já filtrou a visibilidade por tipo/colaborador)
  function mostrarNo(it) {
    if (escondidoNaObra(it) && !(gestor && verEscondidos)) return false;
    if (gestor) return true;
    return membro || temPartilhaAbaixo(it);
  }
  // Itens escondidos diretamente nesta obra (que ainda existem)
  const nEscondidos = () => itens.filter((i) => escondidos.has(i.id)).length;
  function contar(paiId, fase) {
    let total = 0, feitos = 0;
    for (const it of filhosDe(paiId, fase)) {
      if (!mostrarNo(it) || escondidoNaObra(it)) continue;
      if (it.tipo === 'item') { total++; if (estado.has(it.id)) feitos++; }
      const c = contar(it.id); total += c.total; feitos += c.feitos;
    }
    return { total, feitos };
  }

  // ---------- carregar ----------
  async function carregarEstrutura() {
    const [f, i] = await Promise.all([
      sb.from('fases').select('id, titulo, ordem, vis_papeis, vis_utilizadores').order('ordem'),
      sb.from('items').select('id, fase_id, parent_id, titulo, tipo, ordem, vis_papeis, vis_utilizadores').order('ordem')
    ]);
    if (f.error || i.error) throw new Error('Não foi possível carregar a checklist.');
    fases = f.data; itens = i.data;
    if (!fases.some((x) => x.id === faseId)) faseId = Hub.ler('fase') && fases.some((x) => x.id === Hub.ler('fase')) ? Hub.ler('fase') : (fases[0] && fases[0].id);
  }

  async function carregarObras() {
    const { data: o, error } = await sb.from('obras').select('id, codigo, nome').order('nome');
    if (error) throw new Error('Não foi possível carregar as obras.');
    obras = o.sort((a, b) => (a.codigo || '~').localeCompare(b.codigo || '~') || a.nome.localeCompare(b.nome));
    const guardada = Hub.ler('obra');
    // A obra pedida no endereço tem prioridade; depois a atual; depois a última usada; senão a primeira.
    obraId = obras.some((x) => x.id === pedida) ? pedida
      : obras.some((x) => x.id === obraId) ? obraId
      : obras.some((x) => x.id === guardada) ? guardada : (obras[0] && obras[0].id);
    if (obraId) Hub.guardar('obra', obraId);
    $('ck-obra').replaceChildren(...obras.map((x) => el('option', { value: x.id, text: x.codigo ? `${x.codigo} · ${x.nome}` : x.nome, selected: x.id === obraId })));
    $('ck-obra').hidden = !obras.length;
  }

  async function carregarObra() {
    estado = new Map(); escondidos = new Set(); responsaveis = new Map(); partilhas = []; membro = gestor;
    if (!obraId) return;
    const [s, ig, r, p, m] = await Promise.all([
      sb.from('item_status').select('item_id, concluido_por, concluido_em').eq('obra_id', obraId),
      sb.from('item_ignorados').select('item_id').eq('obra_id', obraId),
      sb.from('item_responsaveis').select('item_id, user_id, texto').eq('obra_id', obraId),
      sb.from('item_partilhas').select('item_id, user_id').eq('obra_id', obraId),
      gestor ? Promise.resolve({ data: [] }) : sb.from('obra_membros').select('user_id').eq('obra_id', obraId).eq('user_id', eu.id)
    ]);
    for (const x of s.data || []) estado.set(x.item_id, x);
    for (const x of ig.data || []) escondidos.add(x.item_id);
    for (const x of r.data || []) responsaveis.set(x.item_id, x);
    partilhas = p.data || [];
    if (!gestor) membro = (m.data || []).length > 0;

    // nomes que faltam (quem concluiu / responsável)
    const faltam = [...new Set([...estado.values()].map((x) => x.concluido_por).concat([...responsaveis.values()].map((x) => x.user_id)))]
      .filter((id) => id && !nomes.has(id));
    if (faltam.length) {
      const { data: perfis } = await sb.from('profiles').select('id, nome, utilizador').in('id', faltam);
      for (const x of perfis || []) nomes.set(x.id, x.nome || x.utilizador);
    }
  }

  async function recarregar(tudo = true) {
    try {
      if (tudo) await carregarEstrutura();
      await carregarObra();
      desenhar();
    } catch (e) { aviso(e.message); }
  }

  // ---------- desenhar ----------
  function desenhar() {
    $('ck-editar').textContent = editar ? 'Terminar edição' : 'Editar estrutura';
    $('ck-editar').setAttribute('aria-pressed', editar);
    $('ck-ficha').hidden = !obraId;
    if (obraId) $('ck-ficha').href = '/obras/' + obraId;
    const c = $('ck-conteudo');

    if (!obras.length) {
      c.replaceChildren(el('div', { class: 'vazio', text: gestor
        ? 'Ainda não há obras. Crie a primeira no separador Obras.'
        : 'Ainda não tem obras atribuídas. Fale com um administrador.' }));
      return;
    }

    const visiveis = fases.filter((f) => gestor || contar(null, f.id).total > 0 || filhosDe(null, f.id).some(mostrarNo));
    if (!visiveis.some((f) => f.id === faseId)) faseId = visiveis[0] && visiveis[0].id;

    const abas = el('div', { class: 'fases', role: 'tablist' }, visiveis.map((f) => {
      const n = contar(null, f.id);
      return el('button', {
        class: 'fase-aba', type: 'button', role: 'tab', 'aria-selected': String(f.id === faseId), 'data-id': f.id,
        onclick: () => { faseId = f.id; Hub.guardar('fase', f.id); desenhar(); }
      }, [f.titulo, el('small', { text: `${n.feitos}/${n.total}` })]);
    }));
    if (gestor && editar) abas.append(el('div', { class: 'adicionar', style: 'margin:0' },
      el('button', { type: 'button', text: '+ Fase', onclick: novaFase })));

    // total de todas as fases visíveis nesta obra
    const tot = visiveis.reduce((a, f) => { const n = contar(null, f.id); return { total: a.total + n.total, feitos: a.feitos + n.feitos }; }, { total: 0, feitos: 0 });
    const pctTot = tot.total ? Math.round((tot.feitos / tot.total) * 100) : 0;
    const total = el('div', { class: 'total-obra' }, [
      el('span', { class: 'rotulo', text: 'Total da obra' }),
      el('div', { class: 'progresso', role: 'progressbar', 'aria-valuenow': pctTot, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Total da obra' },
        el('div', { style: `width:${pctTot}%` })),
      el('strong', { text: `${tot.feitos} de ${tot.total} · ${pctTot}%` })
    ]);

    desenharFiltros();
    if (filtroAtivo()) { c.replaceChildren(total, resultados(visiveis)); return; }

    const fase = fases.find((f) => f.id === faseId);
    if (!fase) { c.replaceChildren(total, abas, el('div', { class: 'vazio', text: 'Não há fases visíveis.' })); return; }

    const n = contar(null, fase.id);
    const pct = n.total ? Math.round((n.feitos / n.total) * 100) : 0;
    const cabeca = el('div', { class: 'cabeca-fase' }, [
      el('h1', { class: 'titulo', text: fase.titulo }),
      el('div', { class: 'progresso', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 },
        el('div', { style: `width:${pct}%` })),
      el('span', { class: 'contagem', text: `${n.feitos} de ${n.total} · ${pct}%` }),
      el('div', { class: 'ferramentas abrir-fechar' }, [
        el('button', { type: 'button', text: 'Abrir tudo', onclick: () => { itens.filter((i) => i.fase_id === fase.id).forEach((i) => fechados.delete(i.id)); lembrarFechados(); desenhar(); } }),
        el('button', { type: 'button', text: 'Fechar tudo', onclick: () => { itens.filter((i) => i.fase_id === fase.id && itens.some((x) => x.parent_id === i.id)).forEach((i) => fechados.add(i.id)); lembrarFechados(); desenhar(); } })
      ]),
      gestor && restricao(fase),
      gestor && editar && el('div', { class: 'ferramentas' }, [
        el('button', { type: 'button', title: 'Mover para a esquerda', text: '←', onclick: () => mover(fase, -1, 'fases') }),
        el('button', { type: 'button', title: 'Mover para a direita', text: '→', onclick: () => mover(fase, 1, 'fases') }),
        el('button', { type: 'button', text: 'Opções', onclick: () => abrirOpcoes('fase', fase) })
      ])
    ]);

    const raiz = filhosDe(null, fase.id).filter(mostrarNo);
    const arvore = el('ul', { class: 'arvore', 'data-pai': '' }, raiz.map((it) => desenharNo(it, raiz)));
    const conteudo = [total, abas, cabeca];
    if (!raiz.length) conteudo.push(el('div', { class: 'vazio', text: gestor ? 'Esta fase ainda está vazia.' : 'Não há checks visíveis nesta fase.' }));
    conteudo.push(arvore);
    if (gestor && editar) conteudo.push(el('div', { class: 'adicionar' }, [
      el('button', { type: 'button', text: '+ Título', onclick: () => novoItem(fase.id, null, 'titulo') }),
      el('button', { type: 'button', text: '+ Check', onclick: () => novoItem(fase.id, null, 'item') })
    ]));
    c.replaceChildren(...conteudo);
    c.classList.toggle('editando', gestor && editar);
    if (gestor && editar) ativarArrastar(abas, c);
  }

  // ---------- pesquisa e filtros ----------
  function desenharFiltros() {
    $('ck-procurar').value !== filtros.texto && document.activeElement !== $('ck-procurar') && ($('ck-procurar').value = filtros.texto);
    $('ck-f-estado').value = filtros.estado;
    // responsáveis: "os meus", "sem responsável" e as pessoas conhecidas
    const pessoasResp = gestor ? pessoas : [...new Set([...responsaveis.values()].map((r) => r.user_id).filter(Boolean))].map((id) => ({ id, nome: nomes.get(id) }));
    const opcoes = [['', 'Todos os responsáveis'], ['meus', 'Os meus'], ['sem', 'Sem responsável'], ...pessoasResp.filter((p) => p.id !== eu.id).map((p) => [p.id, p.nome || p.utilizador || '—'])];
    $('ck-f-resp').replaceChildren(...opcoes.map(([v, t]) => el('option', { value: v, text: t, selected: v === filtros.resp })));
    $('ck-f-esc').hidden = $('ck-f-res-l').hidden = !gestor;
    $('ck-f-res').checked = filtros.restritos;
    const ne = nEscondidos();
    $('ck-f-esc').textContent = `${verEscondidos ? 'Ocultar' : 'Mostrar'} escondidos nesta obra (${ne})`;
    $('ck-f-esc').setAttribute('aria-pressed', verEscondidos);
    $('ck-f-esc').disabled = !ne && !verEscondidos;
    $('ck-f-limpar').hidden = !filtroAtivo();
  }
  function mudarFiltro(campo, valor) { filtros[campo] = valor; Hub.lembrar('checklist.filtros', filtros); desenhar(); }

  function acima(it) { const out = []; for (let x = itens.find((i) => i.id === it.parent_id); x; x = itens.find((i) => i.id === x.parent_id)) out.unshift(x); return out; }
  const restrito = (x) => (x.vis_papeis || []).length || (x.vis_utilizadores || []).length;

  function resultados(visiveis) {
    const t = normal(filtros.texto.trim());
    const grupos = visiveis.map((f) => {
      const lista = itens.filter((it) => {
        if (it.fase_id !== f.id || it.tipo !== 'item' || !mostrarNo(it)) return false;

        if (filtros.estado === 'feitos' && !estado.has(it.id)) return false;
        if (filtros.estado === 'por_fazer' && estado.has(it.id)) return false;
        const r = responsaveis.get(it.id);
        if (filtros.resp === 'meus' && !(r && r.user_id === eu.id)) return false;
        if (filtros.resp === 'sem' && r) return false;
        if (filtros.resp && !['meus', 'sem'].includes(filtros.resp) && !(r && r.user_id === filtros.resp)) return false;
        const pais = acima(it);
        if (filtros.restritos && !(restrito(it) || pais.some(restrito) || restrito(f))) return false;
        if (t && !normal([f.titulo, ...pais.map((p) => p.titulo), it.titulo].join(' ')).includes(t)) return false;
        return true;
      }).sort((a, b) => (acima(a).map((p) => p.ordem).join('.') + '.' + a.ordem).localeCompare(acima(b).map((p) => p.ordem).join('.') + '.' + b.ordem, undefined, { numeric: true }));
      return { f, lista };
    }).filter((g) => g.lista.length);
    const n = grupos.reduce((a, g) => a + g.lista.length, 0);
    return el('div', { class: 'resultados' }, [
      el('p', { class: 'contagem-resultados', text: n ? `${n} resultado${n === 1 ? '' : 's'}${gestor && editar ? ' · para arrastar, limpe a pesquisa e os filtros' : ''}` : 'Nenhum check corresponde à pesquisa e aos filtros.' }),
      ...grupos.map(({ f, lista }) => el('section', {}, [
        el('h2', { class: 'titulo-grupo' }, [f.titulo, el('small', { text: ` · ${lista.length}` })]),
        el('ul', { class: 'arvore' }, lista.map((it) => {
          const li = desenharNo(it, [], true);
          const caminho = [f.titulo, ...acima(it).map((p) => p.titulo)].join(' › ');
          if (caminho) li.querySelector('.corpo').prepend(el('div', { class: 'caminho', text: caminho }));
          return li;
        }))
      ]))
    ]);
  }

  // ---------- arrastar (modo "Editar estrutura") ----------
  function ativarArrastar(abas, c) {
    if (!window.Sortable) return;
    Sortable.create(abas, {
      animation: 150, draggable: '.fase-aba', forceFallback: true,
      onEnd: () => reordenarFases([...abas.querySelectorAll('.fase-aba')].map((b) => b.dataset.id))
    });
    c.querySelectorAll('ul.arvore, ul.filhos').forEach((ul) => Sortable.create(ul, {
      group: { name: 'checklist', put: (para, de, arrastado) => arrastado.dataset.tipo !== 'titulo' || para.el.dataset.pai === '' },
      handle: '.pega', animation: 150, forceFallback: true, fallbackOnBody: true, swapThreshold: 0.65, emptyInsertThreshold: 12,
      onEnd: soltar
    }));
  }
  async function soltar(ev) {
    if (ev.from === ev.to && ev.oldIndex === ev.newIndex) return;
    const pedidos = [];
    for (const ul of new Set([ev.from, ev.to])) {
      const pai = ul.dataset.pai || null;
      [...ul.children].filter((li) => li.dataset.id).forEach((li, n) => {
        const it = itens.find((x) => x.id === li.dataset.id);
        if (it && (it.ordem !== n || (it.parent_id || null) !== pai)) {
          it.ordem = n; it.parent_id = pai;
          pedidos.push(ok(sb.from('items').update({ ordem: n, parent_id: pai }).eq('id', it.id), 'Não foi possível guardar a nova ordem.'));
        }
      });
    }
    try { await Promise.all(pedidos); aviso(''); } catch (e) { aviso(e.message); }
    await recarregar();
  }
  async function reordenarFases(ids) {
    try {
      await Promise.all(ids.map((id, n) => { const f = fases.find((x) => x.id === id); return f && f.ordem !== n ? ok(sb.from('fases').update({ ordem: n }).eq('id', id), 'Não foi possível guardar a ordem das fases.') : null; }));
    } catch (e) { aviso(e.message); }
    await recarregar();
  }

  function restricao(obj) {
    const p = (obj.vis_papeis || []).map((x) => PAPEIS[x] || x);
    const u = (obj.vis_utilizadores || []).map((id) => nomes.get(id) || '?');
    if (!p.length && !u.length) return null;
    return el('span', { class: 'etiqueta', title: 'Visibilidade restrita', text: '👁 ' + p.concat(u).join(', ') });
  }

  function desenharNo(it, irmaos, plano = false) {
    const titulo = it.tipo === 'titulo';
    const feito = estado.get(it.id);
    const esc = escondidoNaObra(it);
    const filhos = filhosDe(it.id).filter(mostrarNo);
    const resp = responsaveis.get(it.id);

    const classes = ['no', titulo ? 'no-titulo' : 'no-check'];
    if (feito && !titulo) classes.push('feito');
    if (esc) classes.push('escondido');

    const meta = [];
    if (titulo) { const n = contar(it.id); if (n.total) meta.push(el('span', { text: `${n.feitos}/${n.total}` })); }
    if (feito && !titulo) meta.push(el('span', { text: `✓ ${nomeDe(feito.concluido_por)} · ${data(feito.concluido_em)}` }));
    if (resp) meta.push(el('span', { text: 'Responsável: ' + (resp.user_id ? nomeDe(resp.user_id) : resp.texto) }));
    if (gestor) {
      if (esc && escondidos.has(it.id)) meta.push(el('span', { class: 'etiqueta', text: 'Escondido nesta obra' }));
      const r = restricao(it); if (r) meta.push(r);
      const np = partilhas.filter((p) => p.item_id === it.id).length;
      if (np) meta.push(el('span', { class: 'etiqueta', text: `Partilhado com ${np}` }));
    }

    const temFilhos = !plano && filhos.length > 0;
    const fechado = temFilhos && fechados.has(it.id);
    const alternar = temFilhos ? el('button', { type: 'button', class: 'alternar', 'aria-expanded': String(!fechado),
      title: fechado ? 'Abrir' : 'Fechar', text: fechado ? '▸' : '▾',
      onclick: () => { fechado ? fechados.delete(it.id) : fechados.add(it.id); lembrarFechados(); desenhar(); } })
      : (!plano && titulo ? el('span', { class: 'alternar vazio-alt' }) : null);
    const caixa = titulo ? null : el('input', {
      type: 'checkbox', checked: !!feito, 'aria-label': it.titulo,
      onchange: (ev) => marcar(it, ev.target)
    });

    const ferramentas = gestor ? el('div', { class: 'ferramentas' }, [
      editar && el('button', { type: 'button', title: 'Subir', text: '↑', onclick: () => mover(it, -1, 'items') }),
      editar && el('button', { type: 'button', title: 'Descer', text: '↓', onclick: () => mover(it, 1, 'items') }),
      editar && el('button', { type: 'button', title: titulo ? 'Adicionar check' : 'Adicionar subcheck', text: '+',
        onclick: () => novoItem(it.fase_id, it, 'item') }),
      el('button', { type: 'button', title: 'Opções', text: '⋯', onclick: () => abrirOpcoes('item', it) })
    ]) : null;

    const arrastar = gestor && editar && !plano;
    const linha = el('div', { class: 'linha' }, [
      arrastar ? el('span', { class: 'pega', title: 'Arrastar', 'aria-hidden': 'true', text: '⠿' }) : null,
      alternar,
      caixa,
      el('div', { class: 'corpo' }, [el('div', { class: 'texto', text: it.titulo }), meta.length ? el('div', { class: 'meta' }, meta) : null]),
      ferramentas
    ]);
    const listaFilhos = plano ? null : (filhos.length || arrastar) ? el('ul', { class: 'filhos' + (fechado ? ' recolhido' : ''), 'data-pai': it.id }, filhos.map((f) => desenharNo(f, filhos))) : null;
    if (fechado) classes.push('fechado');
    return el('li', { class: classes.join(' '), 'data-id': it.id, 'data-tipo': it.tipo }, [linha, listaFilhos]);
  }

  // ---------- ações ----------
  async function marcar(it, caixa) {
    const marcado = caixa.checked;
    caixa.disabled = true;
    try {
      if (marcado) {
        await ok(sb.from('item_status').upsert({ obra_id: obraId, item_id: it.id, concluido: true, concluido_por: eu.id, concluido_em: new Date().toISOString() }));
        estado.set(it.id, { item_id: it.id, concluido_por: eu.id, concluido_em: new Date().toISOString() });
        nomes.set(eu.id, eu.nome || eu.utilizador);
      } else {
        await ok(sb.from('item_status').delete().eq('obra_id', obraId).eq('item_id', it.id));
        estado.delete(it.id);
      }
      aviso('');
      desenhar();
    } catch (e) {
      caixa.checked = !marcado; caixa.disabled = false;
      aviso('Não foi possível guardar o check.');
    }
  }

  async function novaFase() {
    const titulo = await pedirTexto('Nova fase');
    if (!titulo) return;
    try {
      const nova = await ok(sb.from('fases').insert({ titulo, ordem: fases.length ? Math.max(...fases.map((f) => f.ordem)) + 1 : 0 }).select('id').single());
      faseId = nova.id; await recarregar();
    } catch (e) { aviso(e.message); }
  }

  async function novoItem(fase, pai, tipo) {
    const titulo = await pedirTexto(tipo === 'titulo' ? 'Novo título' : (pai ? (pai.tipo === 'titulo' ? 'Novo check' : 'Novo subcheck') : 'Novo check'), '', 'Texto');
    if (!titulo) return;
    const irmaos = filhosDe(pai ? pai.id : null, fase);
    try {
      await ok(sb.from('items').insert({
        fase_id: fase, parent_id: pai ? pai.id : null, titulo, tipo,
        ordem: irmaos.length ? Math.max(...irmaos.map((i) => i.ordem)) + 1 : 0,
        // um check novo herda a visibilidade do pai
        vis_papeis: pai ? pai.vis_papeis : [], vis_utilizadores: pai ? pai.vis_utilizadores : []
      }));
      await recarregar();
    } catch (e) { aviso(e.message); }
  }

  async function mover(obj, direcao, tabela) {
    const lista = tabela === 'fases' ? [...fases].sort(porOrdem) : filhosDe(obj.parent_id, obj.fase_id);
    const i = lista.findIndex((x) => x.id === obj.id), j = i + direcao;
    if (j < 0 || j >= lista.length) return;
    // renumerar a lista inteira para evitar ordens repetidas
    [lista[i], lista[j]] = [lista[j], lista[i]];
    try {
      await Promise.all(lista.map((x, n) => x.ordem === n ? null : ok(sb.from(tabela).update({ ordem: n }).eq('id', x.id))));
      await recarregar();
    } catch (e) { aviso(e.message); }
  }

  // ---------- opções (fase / item) ----------
  let emEdicao = null;
  function caixas(contentor, lista, escolhidos) {
    contentor.replaceChildren(...lista.map(([valor, texto]) => el('label', {}, [
      el('input', { type: 'checkbox', value: valor, checked: escolhidos.includes(valor) }), texto
    ])));
  }
  const escolhidos = (contentor) => [...contentor.querySelectorAll('input:checked')].map((x) => x.value);
  const pessoasRestringiveis = () => pessoas.filter((p) => !['admin', 'administrador'].includes(p.papel));

  function abrirOpcoes(tipo, obj) {
    emEdicao = { tipo, obj };
    const ehItem = tipo === 'item';
    $('do-titulo').textContent = tipo === 'fase' ? 'Fase' : obj.tipo === 'titulo' ? 'Título' : 'Check';
    $('do-nome').value = obj.titulo;
    caixas($('do-papeis'), PAPEIS_RESTRINGIVEIS.map((p) => [p, PAPEIS[p]]), obj.vis_papeis || []);
    caixas($('do-pessoas'), pessoasRestringiveis().map((p) => [p.id, p.nome || p.utilizador]), obj.vis_utilizadores || []);

    $('do-obra').hidden = !ehItem || !obraId;
    if (ehItem && obraId) {
      $('do-obra-nome').textContent = (obras.find((o) => o.id === obraId) || {}).nome || '';
      $('do-esconder').checked = escondidos.has(obj.id);
      const r = responsaveis.get(obj.id);
      const sel = $('do-responsavel');
      sel.replaceChildren(
        el('option', { value: '', text: '— Ninguém —' }),
        ...pessoas.map((p) => el('option', { value: p.id, text: p.nome || p.utilizador, selected: r && r.user_id === p.id })),
        el('option', { value: '__texto', text: 'Outra pessoa (escrever nome)…', selected: !!(r && !r.user_id && r.texto) })
      );
      $('do-responsavel-texto').value = r && !r.user_id ? (r.texto || '') : '';
      $('do-responsavel-texto').hidden = sel.value !== '__texto';
      caixas($('do-partilhas'), pessoasRestringiveis().map((p) => [p.id, p.nome || p.utilizador]),
        partilhas.filter((p) => p.item_id === obj.id).map((p) => p.user_id));
    }
    $('do-mensagem').textContent = '';
    $('d-opcoes').showModal();
  }
  $('do-responsavel').addEventListener('change', (e) => { $('do-responsavel-texto').hidden = e.target.value !== '__texto'; });

  $('f-opcoes').addEventListener('submit', async (ev) => {
    if (!ev.submitter || ev.submitter.value !== 'ok') return;
    ev.preventDefault();
    const { tipo, obj } = emEdicao;
    const titulo = $('do-nome').value.trim();
    if (!titulo) { $('do-mensagem').textContent = 'Escreva o texto.'; return; }
    const tabela = tipo === 'fase' ? 'fases' : 'items';
    try {
      await ok(sb.from(tabela).update({
        titulo, vis_papeis: escolhidos($('do-papeis')), vis_utilizadores: escolhidos($('do-pessoas'))
      }).eq('id', obj.id));

      if (tipo === 'item' && obraId) {
        const esconder = $('do-esconder').checked;
        if (esconder && !escondidos.has(obj.id))
          await ok(sb.from('item_ignorados').insert({ obra_id: obraId, item_id: obj.id, ignorado_por: eu.id }));
        if (!esconder && escondidos.has(obj.id))
          await ok(sb.from('item_ignorados').delete().eq('obra_id', obraId).eq('item_id', obj.id));

        const v = $('do-responsavel').value, texto = $('do-responsavel-texto').value.trim();
        if (!v || (v === '__texto' && !texto)) {
          if (responsaveis.has(obj.id)) await ok(sb.from('item_responsaveis').delete().eq('obra_id', obraId).eq('item_id', obj.id));
        } else {
          await ok(sb.from('item_responsaveis').upsert({
            obra_id: obraId, item_id: obj.id, user_id: v === '__texto' ? null : v, texto: v === '__texto' ? texto : null
          }));
        }

        const antes = partilhas.filter((p) => p.item_id === obj.id).map((p) => p.user_id);
        const depois = escolhidos($('do-partilhas'));
        const novos = depois.filter((id) => !antes.includes(id)), saem = antes.filter((id) => !depois.includes(id));
        if (novos.length) await ok(sb.from('item_partilhas').insert(novos.map((user_id) => ({ obra_id: obraId, item_id: obj.id, user_id }))));
        if (saem.length) await ok(sb.from('item_partilhas').delete().eq('obra_id', obraId).eq('item_id', obj.id).in('user_id', saem));
      }
      $('d-opcoes').close();
      aviso('Guardado.', 'ok');
      await recarregar();
    } catch (e) { $('do-mensagem').textContent = e.message; }
  });

  $('do-apagar').addEventListener('click', async () => {
    const { tipo, obj } = emEdicao;
    const oQue = tipo === 'fase' ? `a fase "${obj.titulo}"` : `"${obj.titulo}"`;
    if (!confirm(`Apagar ${oQue} e tudo o que está dentro?\n\nIsto apaga em TODAS as obras, incluindo os checks já feitos.`)) return;
    try {
      await ok(sb.from(tipo === 'fase' ? 'fases' : 'items').delete().eq('id', obj.id), 'Não foi possível apagar.');
      $('d-opcoes').close();
      await recarregar();
    } catch (e) { $('do-mensagem').textContent = e.message; }
  });

  // ---------- obras ----------
  $('ck-obra').addEventListener('change', (e) => {
    Hub.guardar('obra', e.target.value);
    Hub.ir('checklist/' + e.target.value);
  });

  $('ck-editar').addEventListener('click', () => { editar = !editar; desenhar(); });

  let tPesquisa = 0;
  document.addEventListener('DOMContentLoaded', () => {
    $('ck-procurar').addEventListener('input', (e) => { clearTimeout(tPesquisa); tPesquisa = setTimeout(() => mudarFiltro('texto', e.target.value), 200); });
    $('ck-f-estado').addEventListener('change', (e) => mudarFiltro('estado', e.target.value));
    $('ck-f-resp').addEventListener('change', (e) => mudarFiltro('resp', e.target.value));
    $('ck-f-esc').addEventListener('click', () => { verEscondidos = !verEscondidos; Hub.lembrar('checklist.verEscondidos', verEscondidos); desenhar(); });
    $('ck-f-res').addEventListener('change', (e) => mudarFiltro('restritos', e.target.checked));
    $('ck-f-limpar').addEventListener('click', () => { filtros = { ...FILTROS_VAZIOS }; $('ck-procurar').value = ''; Hub.lembrar('checklist.filtros', filtros); desenhar(); });
  });

  // ---------- mostrar (chamado pelo index ao abrir o separador) ----------
  async function mostrar(rota, utilizador) {
    pedida = rota.split('/')[1] || null;
    // ao voltar à mesma obra, mostra já o que se tinha e atualiza depois
    if (iniciado && (!pedida || pedida === obraId)) desenhar();
    try {
      if (!iniciado) {
        eu = utilizador; gestor = Hub.ehGestor(eu);
        nomes.set(eu.id, eu.nome || eu.utilizador);
        $('ck-editar').hidden = !gestor;
        if (gestor) {
          const { data } = await sb.rpc('listar_pessoas');
          pessoas = data || [];
          for (const p of pessoas) nomes.set(p.id, p.nome || p.utilizador);
        }
        await carregarEstrutura();
        iniciado = true;
      }
      await carregarObras();
      await carregarObra();
      desenhar();
    } catch (e) { aviso(e.message); }
  }

  window.ChecklistHub = { mostrar };
})();
