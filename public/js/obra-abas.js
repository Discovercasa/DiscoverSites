// Abas da obra: Projeto, Entregas, Pedidos e falhas.
(function () {
  const { sb, $, el } = Hub;
  const TIPOS_PEDIDO = { material: 'Pedido de material', falha: 'Falha / avaria', ferramenta: 'Pedido de ferramenta', outro: 'Outro' };
  const PRIORIDADES = { baixa: 'Baixa', normal: 'Normal', urgente: 'Urgente' };

  async function ok(p, msg = 'Não foi possível guardar.') { const { data, error } = await p; if (error) { console.error(error); throw new Error(msg); } return data; }
  const dataPT = (s) => new Date(s.length === 10 ? s + 'T00:00:00' : s).toLocaleDateString('pt-PT');
  const horaPT = (s) => new Date(s).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const ehGestor = (eu) => Hub.ehGestor(eu);
  const mensagem = (texto, tipo = 'erro') => el('p', { class: 'mensagem ' + tipo, role: 'status', text: texto });

  async function nomes(ids) {
    const unicos = [...new Set(ids.filter(Boolean))];
    if (!unicos.length) return new Map();
    const { data } = await sb.from('profiles').select('id, nome, utilizador').in('id', unicos);
    return new Map((data || []).map((p) => [p.id, p.nome || p.utilizador]));
  }

  // ---------- memória das abas: mostra já o que se viu e atualiza em segundo plano ----------
  const memo = new Map();
  // buscar(): devolve os dados; redesenhar(): volta a chamar a aba (que lê a memória)
  async function comMemoria(chave, buscar, alvo, redesenhar) {
    if (memo.has(chave)) {
      const antes = JSON.stringify(memo.get(chave));
      buscar().then((d) => { if (JSON.stringify(d) !== antes) { memo.set(chave, d); if (alvo.isConnected) redesenhar(); } }).catch(() => {});
      return memo.get(chave);
    }
    alvo.replaceChildren(el('p', { class: 'carregar', text: 'A carregar…' }));
    const d = await buscar(); memo.set(chave, d); return d;
  }

  // ======================= PROJETO =======================
  const CAMPOS_PROJETO = [
    ['tipologia', 'Tipologia', { placeholder: 'ex.: T3' }], ['area_m2', 'Área (m²)', { type: 'number', min: 0, step: '0.01' }],
    ['pisos', 'Nº de pisos', { type: 'number', min: 0, max: 20 }], ['modelo', 'Modelo da casa', {}],
    ['arquiteto', 'Arquiteto', {}], ['licenca', 'Nº de licença', {}]
  ];

  async function projeto(o, alvo, eu, editar = false) {
    let p;
    const buscar = async () => (await ok(sb.from('obra_projeto').select('*').eq('obra_id', o.id).maybeSingle(), 'Não foi possível carregar o projeto.')) || {};
    try { p = editar ? await buscar() : await comMemoria('projeto:' + o.id, buscar, alvo, () => projeto(o, alvo, eu)); }
    catch (e) { alvo.replaceChildren(mensagem(e.message)); return; }

    if (!editar) {
      const vazio = CAMPOS_PROJETO.every(([c]) => p[c] == null || p[c] === '') && !p.notas;
      alvo.replaceChildren(el('section', { class: 'painel' }, [
        el('div', { class: 'barra', style: 'margin-bottom:.5rem' }, [el('h2', { class: 'titulo', style: 'margin:0', text: 'Projeto' }),
          ehGestor(eu) ? el('button', { class: 'botao secundario pequeno', type: 'button', text: vazio ? 'Preencher' : 'Editar', onclick: () => projeto(o, alvo, eu, true) }) : null]),
        vazio ? el('p', { class: 'ajuda', text: 'Ainda sem informação do projeto.' }) : el('div', {}, [
          ...CAMPOS_PROJETO.map(([c, r]) => el('div', { class: 'dado' }, [el('span', { class: 'rotulo', text: r }),
            el('span', { text: p[c] == null || p[c] === '' ? '—' : c === 'area_m2' ? `${Number(p[c]).toLocaleString('pt-PT')} m²` : String(p[c]) })])),
          el('div', { class: 'dado' }, [el('span', { class: 'rotulo', text: 'Notas' }), el('span', { class: 'notas', text: p.notas || '—' })])
        ])
      ]));
      return;
    }

    const form = el('form', { class: 'painel', novalidate: true }, [
      el('h2', { class: 'titulo', text: 'Editar projeto' }),
      el('div', { class: 'form-grelha' }, CAMPOS_PROJETO.map(([c, r, extra]) => el('div', { class: 'campo' }, [
        el('label', { for: 'pj-' + c, text: r }), el('input', { id: 'pj-' + c, value: p[c] ?? '', autocomplete: 'off', ...extra })]))),
      el('div', { class: 'campo' }, [el('label', { for: 'pj-notas', text: 'Notas' }), el('textarea', { id: 'pj-notas', rows: 4 }, p.notas || '')]),
      el('div', { class: 'acoes-form' }, [el('button', { class: 'botao', type: 'submit', text: 'Guardar' }),
        el('button', { class: 'botao secundario', type: 'button', text: 'Cancelar', onclick: () => projeto(o, alvo, eu) })]),
      el('p', { class: 'mensagem erro', id: 'pj-mensagem', role: 'alert' })
    ]);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const v = (c) => { const x = $('pj-' + c).value.trim(); return x === '' ? null : x; };
      const r = { obra_id: o.id, tipologia: v('tipologia'), area_m2: v('area_m2') == null ? null : +v('area_m2'), pisos: v('pisos') == null ? null : parseInt(v('pisos'), 10),
        modelo: v('modelo'), arquiteto: v('arquiteto'), licenca: v('licenca'), notas: v('notas'), updated_at: new Date().toISOString() };
      try { await ok(sb.from('obra_projeto').upsert(r)); memo.delete('projeto:' + o.id); await projeto(o, alvo, eu); }
      catch (e) { $('pj-mensagem').textContent = e.message; }
    });
    alvo.replaceChildren(form);
  }

  // ======================= ENTREGAS =======================
  const podeEditarEntregas = (eu) => ehGestor(eu) || eu.papel === 'obra';

  async function entregas(o, alvo, eu) {
    let lista, itens;
    try {
      ({ lista, itens } = await comMemoria('entregas:' + o.id, async () => {
        const l = await ok(sb.from('entregas').select('*').eq('obra_id', o.id).order('data', { ascending: false }), 'Não foi possível carregar as entregas.');
        const i = l.length ? await ok(sb.from('entrega_itens').select('*').in('entrega_id', l.map((e) => e.id)).order('ordem'), 'Não foi possível carregar os materiais.') : [];
        return { lista: l, itens: i };
      }, alvo, () => entregas(o, alvo, eu)));
    } catch (e) { alvo.replaceChildren(mensagem(e.message)); return; }
    const editar = podeEditarEntregas(eu);
    const recarregar = () => { memo.delete('entregas:' + o.id); return entregas(o, alvo, eu); };

    const cartao = (e) => {
      const linhas = itens.filter((i) => i.entrega_id === e.id);
      return el('article', { class: 'cartao-registo' }, [
        el('div', { class: 'cabeca-registo' }, [
          el('span', { class: 'estado ' + (e.estado === 'entregue' ? 'sim' : 'aviso'), text: e.estado === 'entregue' ? 'Entregue' : 'Prevista' }),
          el('strong', { text: dataPT(e.data) }), el('span', { text: e.fornecedor || 'Fornecedor não indicado' }),
          el('span', { class: 'espaco' }),
          editar ? el('button', { class: 'botao secundario pequeno', type: 'button', text: 'Editar', onclick: () => abrirEntrega(o, e, linhas, recarregar, eu) }) : null
        ]),
        linhas.length ? el('table', { class: 'itens' }, [el('tbody', {}, linhas.map((i) => el('tr', {}, [
          el('td', { text: i.material }), el('td', { class: 'num', text: i.quantidade == null ? '' : Number(i.quantidade).toLocaleString('pt-PT') }), el('td', { text: i.unidade || '' })])))]) : null,
        (e.recebido_por || e.notas) ? el('p', { class: 'ajuda' }, [e.recebido_por ? `Recebido por ${e.recebido_por}. ` : '', e.notas || '']) : null
      ]);
    };

    alvo.replaceChildren(...[
      editar ? el('button', { class: 'botao largo-topo', type: 'button', text: '+ Nova entrega', onclick: () => abrirEntrega(o, null, [], recarregar, eu) }) : null,
      ...(['prevista', 'entregue'].map((estado) => {
        const grupo = lista.filter((e) => e.estado === estado);
        return grupo.length ? el('section', {}, [el('h2', { class: 'titulo-grupo', text: `${estado === 'prevista' ? 'Previstas' : 'Entregues'} (${grupo.length})` }), ...grupo.map(cartao)]) : null;
      })),
      lista.length ? null : el('div', { class: 'vazio', text: 'Ainda não há entregas registadas.' })
    ].filter(Boolean));
  }

  let entregaAtual = null;
  function abrirEntrega(o, e, linhas, aoGuardar, eu) {
    entregaAtual = { o, e, aoGuardar };
    $('de-titulo').textContent = e ? 'Editar entrega' : 'Nova entrega';
    $('de-data').value = e ? e.data : new Date().toISOString().slice(0, 10);
    $('de-fornecedor').value = e ? e.fornecedor || '' : '';
    $('de-estado').value = e ? e.estado : 'entregue';
    $('de-recebido').value = e ? e.recebido_por || '' : (eu.nome || '');
    $('de-notas').value = e ? e.notas || '' : '';
    $('de-itens').replaceChildren();
    (linhas.length ? linhas : [{}]).forEach(linhaMaterial);
    $('de-apagar').hidden = !e; $('de-mensagem').textContent = '';
    $('d-entrega').showModal();
  }
  function linhaMaterial(i = {}) {
    const linha = el('div', { class: 'linha-material' }, [
      el('input', { placeholder: 'Material', value: i.material || '', 'aria-label': 'Material', class: 'm-material' }),
      el('input', { type: 'number', step: 'any', min: 0, placeholder: 'Qtd.', value: i.quantidade ?? '', 'aria-label': 'Quantidade', class: 'm-qtd' }),
      el('input', { placeholder: 'Un.', value: i.unidade || '', 'aria-label': 'Unidade', class: 'm-un', list: 'unidades' }),
      el('button', { class: 'botao secundario pequeno', type: 'button', text: '✕', 'aria-label': 'Remover linha', onclick: () => linha.remove() })
    ]);
    $('de-itens').append(linha);
  }

  // ======================= PEDIDOS E FALHAS =======================
  async function pedidos(o, alvo, eu) {
    let lista, respostas, quem;
    try {
      let nomesLista;
      ({ lista, respostas, nomesLista } = await comMemoria('pedidos:' + o.id, async () => {
        const l = await ok(sb.from('pedidos').select('*').eq('obra_id', o.id).order('created_at', { ascending: false }), 'Não foi possível carregar os pedidos.');
        const r = l.length ? await ok(sb.from('pedido_respostas').select('*').in('pedido_id', l.map((p) => p.id)).order('created_at'), 'Não foi possível carregar as respostas.') : [];
        const n = await nomes([...l.map((p) => p.criado_por), ...l.map((p) => p.fechado_por), ...r.map((x) => x.autor)]);
        return { lista: l, respostas: r, nomesLista: [...n] };
      }, alvo, () => pedidos(o, alvo, eu)));
      quem = new Map(nomesLista);
    } catch (e) { alvo.replaceChildren(mensagem(e.message)); return; }
    const hoje = new Date().toLocaleDateString('sv');
    const recarregar = () => { memo.delete('pedidos:' + o.id); ObrasHub.atualizarAvisoPedidos(o.id); return pedidos(o, alvo, eu); };

    const cartao = (p) => {
      const podeFechar = ehGestor(eu) || p.criado_por === eu.id;
      const rs = respostas.filter((r) => r.pedido_id === p.id);
      const foto = p.foto_path ? el('button', { class: 'foto-pedido', type: 'button', 'aria-label': 'Ver fotografia' }) : null;
      if (foto) sb.storage.from('pedidos').createSignedUrl(p.foto_path, 3600).then(({ data }) => {
        if (!data) return;
        foto.append(el('img', { src: data.signedUrl, alt: 'Fotografia do pedido', loading: 'lazy' }));
        foto.addEventListener('click', () => window.open(data.signedUrl, '_blank', 'noopener'));
      });
      return el('article', { class: 'cartao-registo pedido ' + (p.prioridade === 'urgente' && p.estado === 'aberto' ? 'urgente' : '') }, [
        el('div', { class: 'cabeca-registo' }, [
          el('span', { class: 'estado ' + (p.estado === 'aberto' ? 'aviso' : 'sim'), text: p.estado === 'aberto' ? 'Por concluir' : 'Concluído' }),
          p.prioridade !== 'normal' ? el('span', { class: 'estado ' + (p.prioridade === 'urgente' ? 'nao' : ''), text: PRIORIDADES[p.prioridade] }) : null,
          el('span', { class: 'etiqueta', text: TIPOS_PEDIDO[p.tipo] }),
          p.necessario_ate ? el('span', { class: 'necessario' + (p.estado === 'aberto' && p.necessario_ate < hoje ? ' atrasado' : ''),
            text: (p.estado === 'aberto' && p.necessario_ate < hoje ? '⚠ Era para ' : 'Necessário até ') + dataPT(p.necessario_ate) }) : null
        ]),
        el('div', { class: 'corpo-pedido' }, [foto, el('p', { class: 'descricao', text: p.descricao })]),
        el('p', { class: 'ajuda', text: `${quem.get(p.criado_por) || '—'} · ${horaPT(p.created_at)}${p.estado === 'fechado' && p.fechado_em ? ` · concluído por ${quem.get(p.fechado_por) || '—'} em ${dataPT(p.fechado_em)}` : ''}` }),
        rs.length ? el('ul', { class: 'respostas' }, rs.map((r) => el('li', {}, [el('strong', { text: quem.get(r.autor) || '—' }), ` · ${horaPT(r.created_at)}`, el('p', { text: r.texto })]))) : null,
        el('div', { class: 'acoes-form' }, [
          p.estado === 'aberto' ? el('button', { class: 'botao secundario pequeno', type: 'button', text: 'Responder', onclick: () => abrirResposta(p, recarregar) }) : null,
          podeFechar ? el('button', { class: 'botao secundario pequeno', type: 'button', text: p.estado === 'aberto' ? 'Concluir' : 'Reabrir', onclick: async () => {
            try { await ok(sb.from('pedidos').update({ estado: p.estado === 'aberto' ? 'fechado' : 'aberto' }).eq('id', p.id)); await recarregar(); }
            catch (e) { alert(e.message); }
          } }) : null
        ])
      ]);
    };

    // por data de necessidade (mais próxima primeiro; sem data no fim), depois urgentes, depois os mais antigos
    const abertos = lista.filter((p) => p.estado === 'aberto').sort((a, b) =>
      (a.necessario_ate || '9999').localeCompare(b.necessario_ate || '9999') || (b.prioridade === 'urgente') - (a.prioridade === 'urgente') || a.created_at.localeCompare(b.created_at));
    const fechados = lista.filter((p) => p.estado === 'fechado');
    alvo.replaceChildren(
      el('button', { class: 'botao largo-topo', type: 'button', text: '+ Novo pedido ou falha', onclick: () => abrirPedido(o, recarregar, eu) }),
      el('h2', { class: 'titulo-grupo', text: `Em aberto (${abertos.length})` }),
      ...(abertos.length ? abertos.map(cartao) : [el('p', { class: 'ajuda', text: 'Nenhum pedido em aberto.' })]),
      el('details', { class: 'fechados' }, [el('summary', {}, el('span', { class: 'titulo-grupo', text: `Concluídos (${fechados.length})` })),
        ...(fechados.length ? fechados.map(cartao) : [el('p', { class: 'ajuda', text: 'Nenhum pedido concluído.' })])])
    );
  }

  let pedidoNovo = null, pedidoResposta = null;
  function abrirPedido(o, aoGuardar, eu) {
    pedidoNovo = { o, aoGuardar, eu };
    $('dpd-tipo').replaceChildren(...Object.entries(TIPOS_PEDIDO).map(([k, t]) => el('option', { value: k, text: t })));
    $('dpd-prioridade').replaceChildren(...Object.entries(PRIORIDADES).map(([k, t]) => el('option', { value: k, text: t, selected: k === 'normal' })));
    $('dpd-descricao').value = ''; $('dpd-foto').value = ''; $('dpd-necessario').value = ''; $('dpd-mensagem').textContent = '';
    $('d-pedido-obra').showModal();
  }
  function abrirResposta(p, aoGuardar) {
    pedidoResposta = { p, aoGuardar };
    $('dr-pedido').textContent = p.descricao.length > 120 ? p.descricao.slice(0, 120) + '…' : p.descricao;
    $('dr-texto').value = ''; $('dr-mensagem').textContent = '';
    $('d-resposta').showModal();
  }

  // Reduz fotografias grandes do telemóvel antes de enviar (máx. 1600 px, JPEG)
  async function reduzirFoto(ficheiro) {
    try {
      const img = await createImageBitmap(ficheiro);
      const escala = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
      return blob ? { blob, ext: 'jpg', tipo: 'image/jpeg' } : null;
    } catch (_) { return null; }
  }

  document.addEventListener('DOMContentLoaded', () => {
    // --- entrega ---
    $('de-mais').addEventListener('click', () => linhaMaterial());
    $('f-entrega').addEventListener('submit', async (ev) => {
      if (!ev.submitter || ev.submitter.value !== 'ok') return;
      ev.preventDefault();
      const { o, e, aoGuardar } = entregaAtual;
      const r = { obra_id: o.id, data: $('de-data').value, fornecedor: $('de-fornecedor').value.trim() || null, estado: $('de-estado').value,
        recebido_por: $('de-recebido').value.trim() || null, notas: $('de-notas').value.trim() || null };
      if (!r.data) { $('de-mensagem').textContent = 'Indique a data.'; return; }
      const linhas = [...$('de-itens').querySelectorAll('.linha-material')].map((l, n) => ({
        material: l.querySelector('.m-material').value.trim(), quantidade: l.querySelector('.m-qtd').value === '' ? null : +l.querySelector('.m-qtd').value,
        unidade: l.querySelector('.m-un').value.trim() || null, ordem: n })).filter((l) => l.material);
      try {
        let id = e && e.id;
        if (e) await ok(sb.from('entregas').update(r).eq('id', id));
        else id = (await ok(sb.from('entregas').insert(r).select('id').single())).id;
        if (e) await ok(sb.from('entrega_itens').delete().eq('entrega_id', id));
        if (linhas.length) await ok(sb.from('entrega_itens').insert(linhas.map((l) => ({ ...l, entrega_id: id }))), 'A entrega foi guardada, mas não os materiais.');
        $('d-entrega').close(); await aoGuardar();
      } catch (err) { $('de-mensagem').textContent = err.message; }
    });
    $('de-apagar').addEventListener('click', async () => {
      if (!confirm('Apagar esta entrega?')) return;
      try { await ok(sb.from('entregas').delete().eq('id', entregaAtual.e.id), 'Não foi possível apagar.'); $('d-entrega').close(); await entregaAtual.aoGuardar(); }
      catch (err) { $('de-mensagem').textContent = err.message; }
    });

    // --- novo pedido ---
    $('f-pedido-obra').addEventListener('submit', async (ev) => {
      if (!ev.submitter || ev.submitter.value !== 'ok') return;
      ev.preventDefault();
      const { o, aoGuardar, eu } = pedidoNovo;
      const descricao = $('dpd-descricao').value.trim();
      if (!descricao) { $('dpd-mensagem').textContent = 'Escreva a descrição.'; return; }
      const botao = ev.submitter; botao.disabled = true; botao.textContent = 'A guardar…';
      try {
        const id = crypto.randomUUID();
        let foto_path = null;
        const f = $('dpd-foto').files[0];
        if (f) {
          if (!f.type.startsWith('image/')) throw new Error('A fotografia tem de ser uma imagem.');
          const r = (await reduzirFoto(f)) || { blob: f, ext: (f.name.split('.').pop() || 'jpg').toLowerCase(), tipo: f.type };
          if (r.blob.size > 10 * 1024 * 1024) throw new Error('A fotografia é demasiado grande (máx. 10 MB).');
          foto_path = `${o.id}/${id}/foto.${r.ext}`;
          const { error } = await sb.storage.from('pedidos').upload(foto_path, r.blob, { contentType: r.tipo });
          if (error) { console.error(error); throw new Error('Não foi possível enviar a fotografia.'); }
        }
        await ok(sb.from('pedidos').insert({ id, obra_id: o.id, tipo: $('dpd-tipo').value, prioridade: $('dpd-prioridade').value, descricao, foto_path, criado_por: eu.id, necessario_ate: $('dpd-necessario').value || null }));
        $('d-pedido-obra').close(); await aoGuardar();
      } catch (err) { $('dpd-mensagem').textContent = err.message; }
      finally { botao.disabled = false; botao.textContent = 'Guardar'; }
    });

    // --- resposta ---
    $('f-resposta').addEventListener('submit', async (ev) => {
      if (!ev.submitter || ev.submitter.value !== 'ok') return;
      ev.preventDefault();
      const texto = $('dr-texto').value.trim();
      if (!texto) { $('dr-mensagem').textContent = 'Escreva a resposta.'; return; }
      try { await ok(sb.from('pedido_respostas').insert({ pedido_id: pedidoResposta.p.id, texto, autor: (await sb.auth.getUser()).data.user.id }));
        $('d-resposta').close(); await pedidoResposta.aoGuardar(); }
      catch (err) { $('dr-mensagem').textContent = err.message; }
    });
  });

  window.ObraAbas = { projeto, entregas, pedidos, reduzirFoto };
})();
