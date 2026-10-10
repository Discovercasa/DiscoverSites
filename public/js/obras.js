// Separador "Obras" do Hub: lista geral, ficha da obra, criar/editar e membros.
// Os campos que cada tipo de utilizador pode ver são filtrados na base de dados (obras_visiveis).
(function () {
  const { sb, PAPEIS, $, el } = Hub;
  const ESTADOS = { preparacao: 'Em preparação', em_curso: 'Em curso', concluida: 'Concluída', suspensa: 'Suspensa' };

  let eu = null, gestor = false, obras = [], pessoas = [], filtro = { texto: '', estado: '' };

  const data = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-PT') : '—');
  const nomeObra = (o) => (o.codigo ? `${o.codigo} · ${o.nome}` : o.nome);
  const etiquetaEstado = (e) => el('span', { class: 'estado-obra ' + e, text: ESTADOS[e] || e });
  function aviso(texto, tipo = 'erro') { const m = $('obras-aviso'); m.textContent = texto || ''; m.className = 'mensagem ' + (texto ? tipo : ''); }
  async function ok(p, msg = 'Não foi possível guardar.') { const { data: d, error } = await p; if (error) { console.error(error); throw new Error(msg); } return d; }

  async function carregar() {
    obras = await ok(sb.rpc('obras_visiveis'), 'Não foi possível carregar as obras.');
    if (gestor && !pessoas.length) pessoas = (await sb.rpc('listar_pessoas')).data || [];
  }

  // ---------- rota: "obras", "obras/nova", "obras/<id>", "obras/<id>/editar" ----------
  async function mostrar(rota, utilizador) {
    eu = utilizador; gestor = Hub.ehGestor(eu);
    const [, id, acao] = rota.split('/');
    const c = $('obras-conteudo');
    c.replaceChildren(el('p', { class: 'carregar', text: 'A carregar…' }));
    aviso('');
    try { await carregar(); } catch (e) { c.replaceChildren(); return aviso(e.message); }

    if (id === 'nova' && gestor) return formulario(null);
    if (id) {
      const o = obras.find((x) => x.id === id);
      if (!o) { c.replaceChildren(el('div', { class: 'vazio', text: 'Obra não encontrada.' })); return; }
      if (acao === 'editar' && gestor) return formulario(o);
      return paginaObra(o, acao || 'inicio');
    }
    lista();
  }

  // ---------- lista ----------
  function lista() {
    const pesquisa = el('input', { type: 'search', placeholder: 'Procurar por código, nome ou localidade', value: filtro.texto, 'aria-label': 'Procurar obras' });
    const estado = el('select', { 'aria-label': 'Filtrar por estado' }, [
      el('option', { value: '', text: 'Todos os estados' }),
      ...Object.entries(ESTADOS).map(([v, t]) => el('option', { value: v, text: t, selected: filtro.estado === v }))
    ]);
    const grelha = el('div', { class: 'grelha' });

    function desenharCartoes() {
      const t = filtro.texto.toLowerCase();
      const vis = obras.filter((o) => (!filtro.estado || o.estado === filtro.estado) &&
        (!t || [o.codigo, o.nome, o.localidade].some((v) => (v || '').toLowerCase().includes(t))));
      grelha.replaceChildren(...(vis.length ? vis.map((o) => el('a', { class: 'cartao', href: '#obras/' + o.id }, [
        o.codigo ? el('div', { class: 'codigo', text: o.codigo }) : null,
        el('h2', { class: 'titulo', text: o.nome }),
        el('p', { text: o.localidade || o.morada || 'Sem localidade' }),
        el('div', { class: 'linha-estado' }, [etiquetaEstado(o.estado),
          o.data_fim_prevista ? el('span', { class: 'ajuda', text: 'Fim previsto ' + data(o.data_fim_prevista) }) : null])
      ])) : [el('div', { class: 'vazio', text: obras.length ? 'Nenhuma obra corresponde à pesquisa.' : (gestor ? 'Ainda não há obras. Crie a primeira.' : 'Ainda não tem obras atribuídas.') })]));
    }
    pesquisa.addEventListener('input', () => { filtro.texto = pesquisa.value; desenharCartoes(); });
    estado.addEventListener('change', () => { filtro.estado = estado.value; desenharCartoes(); });

    $('obras-conteudo').replaceChildren(
      el('div', { class: 'barra' }, [
        el('div', {}, [el('h1', { class: 'titulo', text: 'Obras' }), el('p', { class: 'subtitulo', style: 'margin:0', text: gestor ? 'Todas as obras.' : 'As obras a que tem acesso.' })]),
        gestor ? el('a', { class: 'botao', href: '#obras/nova', text: '+ Nova obra' }) : null
      ]),
      el('div', { class: 'filtros' }, [pesquisa, estado]),
      grelha
    );
    desenharCartoes();
  }

  // ---------- ficha ----------
  function campo(rotulo, valor) { return el('div', { class: 'dado' }, [el('span', { class: 'rotulo', text: rotulo }), el('span', {}, valor ?? '—')]); }

  async function abaInicio(o, alvo) {
    const coords = o.latitude != null && o.longitude != null;
    const checklist = el('section', { class: 'painel' }, [el('h2', { class: 'titulo', text: 'Checklist' }), el('p', { class: 'ajuda', text: 'A carregar…' })]);
    const blocos = [
      checklist,
      el('section', { class: 'painel' }, [el('h2', { class: 'titulo', text: 'Localização' }),
        campo('Morada', o.morada || '—'), campo('Localidade', o.localidade || '—'),
        campo('Coordenadas', coords ? el('a', { href: `https://www.google.com/maps?q=${o.latitude},${o.longitude}`, target: '_blank', rel: 'noopener', text: `${o.latitude}, ${o.longitude} ↗` }) : '—')]),
      el('section', { class: 'painel' }, [el('h2', { class: 'titulo', text: 'Datas' }),
        campo('Início', data(o.data_inicio)), campo('Fim previsto', data(o.data_fim_prevista)), campo('Fim real', data(o.data_fim_real))]),
      el('section', { class: 'painel' }, [el('h2', { class: 'titulo', text: 'Pessoas' }),
        campo('Responsável da obra', o.responsavel_nome || '—'),
        o.ve_cliente ? campo('Cliente', o.cliente_nome ? `${o.cliente_nome}${o.cliente_email ? ' · ' + o.cliente_email : ''}` : '—') : null])
    ];
    if (o.ve_notas) blocos.push(el('section', { class: 'painel' }, [el('h2', { class: 'titulo', text: 'Notas internas' }),
      el('p', { class: 'notas', text: o.notas || 'Sem notas.' })]));
    const membros = o.ve_membros ? el('section', { class: 'painel' }, [el('h2', { class: 'titulo', text: 'Membros' }), el('p', { class: 'ajuda', text: 'A carregar…' })]) : null;
    if (membros) blocos.push(membros);

    const pedidos = el('section', { class: 'painel' }, [el('h2', { class: 'titulo', text: 'Pedidos e falhas' }), el('p', { class: 'ajuda', text: 'A carregar…' })]);
    blocos.splice(1, 0, pedidos);
    alvo.replaceChildren(el('div', { class: 'grelha-ficha' }, blocos));
    sb.from('pedidos').select('prioridade').eq('obra_id', o.id).eq('estado', 'aberto').then(({ data: p }) => {
      const n = (p || []).length, u = (p || []).filter((x) => x.prioridade === 'urgente').length;
      pedidos.replaceChildren(el('h2', { class: 'titulo', text: 'Pedidos e falhas' }),
        el('div', { class: 'total-ficha' }, [el('strong', { class: 'pct', text: String(n) }),
          el('div', {}, [el('span', { text: n === 1 ? 'pedido em aberto' : 'pedidos em aberto' }), u ? el('div', {}, el('span', { class: 'estado nao', text: `${u} urgente${u === 1 ? '' : 's'}` })) : null])]),
        el('a', { class: 'botao secundario pequeno', href: `#obras/${o.id}/pedidos`, text: 'Ver pedidos', style: 'margin-top:.8rem' }));
    });

    sb.rpc('progresso_obra', { p_obra: o.id }).then(({ data: p, error }) => {
      const r = !error && p && p[0];
      if (!r) { checklist.lastChild.textContent = 'Não foi possível calcular o total.'; return; }
      const pct = r.total ? Math.round((r.feitos / r.total) * 100) : 0;
      checklist.replaceChildren(el('h2', { class: 'titulo', text: 'Checklist' }),
        el('div', { class: 'total-ficha' }, [
          el('strong', { class: 'pct', text: pct + '%' }),
          el('div', {}, [el('div', { class: 'progresso', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, el('div', { style: `width:${pct}%` })),
            el('span', { class: 'ajuda', text: `${r.feitos} de ${r.total} checks feitos, em todas as fases` })])
        ]),
        el('a', { class: 'botao secundario pequeno', href: '#checklist/' + o.id, text: 'Abrir checklist', style: 'margin-top:.8rem' }));
    });

    if (membros) {
      try {
        const lista = await ok(sb.rpc('listar_membros_obra', { p_obra: o.id }), 'Não foi possível carregar os membros.');
        membros.replaceChildren(el('h2', { class: 'titulo', text: 'Membros' }),
          lista.length ? el('ul', { class: 'membros' }, lista.map((m) => el('li', {}, [m.nome || '—', ' ', el('span', { class: 'etiqueta', text: PAPEIS[m.papel] || m.papel })])))
            : el('p', { class: 'ajuda', text: 'Ainda sem membros. ADMIN e Administrador veem todas as obras.' }),
          gestor ? el('button', { class: 'botao secundario pequeno', type: 'button', text: 'Gerir membros', onclick: () => abrirMembros(o, lista.map((m) => m.user_id)) }) : null);
      } catch (e) { membros.lastChild.textContent = e.message; }
    }
  }

  // ---------- página da obra com abas ----------
  const ABAS = [
    ['inicio', 'Início'], ['projeto', 'Projeto'], ['mapa', 'Mapa'], ['documentos', 'Documentos'],
    ['fotos', 'Fotos'], ['entregas', 'Entregas'], ['pedidos', 'Pedidos']
  ];
  function paginaObra(o, aba) {
    const abas = ABAS.filter(([id]) => !(id === 'entregas' && eu.papel === 'cliente'));
    if (!abas.some(([id]) => id === aba)) aba = 'inicio';
    const alvo = el('div', { class: 'conteudo-aba' }, el('p', { class: 'carregar', text: 'A carregar…' }));
    $('obras-conteudo').replaceChildren(
      el('a', { class: 'voltar', href: '#obras', text: '← Obras' }),
      el('div', { class: 'barra' }, [
        el('div', {}, [o.codigo ? el('div', { class: 'codigo', text: o.codigo }) : null, el('h1', { class: 'titulo', text: o.nome }), etiquetaEstado(o.estado)]),
        el('div', { class: 'acoes-form' }, [
          el('a', { class: 'botao', href: '#checklist/' + o.id, text: 'Abrir checklist' }),
          gestor ? el('a', { class: 'botao secundario', href: `#obras/${o.id}/editar`, text: 'Editar' }) : null
        ])
      ]),
      el('nav', { class: 'sub-abas abas-obra', 'aria-label': 'Abas da obra' }, abas.map(([id, nome]) =>
        el('a', { href: `#obras/${o.id}${id === 'inicio' ? '' : '/' + id}`, 'aria-current': id === aba ? 'page' : false, text: nome }))),
      alvo
    );
    const vazio = (texto) => alvo.replaceChildren(el('div', { class: 'vazio' }, [el('span', { class: 'etiqueta', text: 'Em breve' }), ' ', texto]));
    if (aba === 'inicio') return abaInicio(o, alvo);
    if (aba === 'projeto') return ObraAbas.projeto(o, alvo, eu);
    if (aba === 'entregas') return ObraAbas.entregas(o, alvo, eu);
    if (aba === 'pedidos') return ObraAbas.pedidos(o, alvo, eu);
    if (aba === 'mapa') return vazio('O mapa da obra será desenvolvido mais tarde.');
    if (aba === 'documentos') return vazio('Documentos ligados à pasta da obra no Google Drive (v0.7).');
    if (aba === 'fotos') return vazio('Fotografias ligadas à pasta "Fotografias" da obra no Google Drive (v0.7).');
  }

  // ---------- criar / editar ----------
  function formulario(o) {
    const novo = !o; o = o || { estado: 'preparacao' };
    const entrada = (id, rotulo, valor, extra = {}) => el('div', { class: 'campo' }, [el('label', { for: id, text: rotulo }), el('input', { id, value: valor ?? '', autocomplete: 'off', ...extra })]);
    const escolha = (id, rotulo, opcoes, valor) => el('div', { class: 'campo' }, [el('label', { for: id, text: rotulo }),
      el('select', { id }, opcoes.map(([v, t]) => el('option', { value: v, text: t, selected: (valor || '') === v })))]);
    const equipa = pessoas.filter((p) => p.papel !== 'cliente');
    const clientes = pessoas.filter((p) => p.papel === 'cliente');

    const form = el('form', { class: 'painel', novalidate: true }, [
      el('h2', { class: 'titulo', text: novo ? 'Nova obra' : 'Editar obra' }),
      el('div', { class: 'form-grelha' }, [
        entrada('ob-codigo', 'Código', o.codigo, { placeholder: 'ex.: C2510' }),
        entrada('ob-nome', 'Nome', o.nome, { required: true }),
        escolha('ob-estado', 'Estado', Object.entries(ESTADOS), o.estado),
        entrada('ob-morada', 'Morada', o.morada),
        entrada('ob-localidade', 'Localidade', o.localidade),
        entrada('ob-coords', 'Coordenadas', o.latitude != null ? `${o.latitude}, ${o.longitude}` : '', { placeholder: 'ex.: 39.0634, -9.1462' }),
        entrada('ob-inicio', 'Início', o.data_inicio, { type: 'date' }),
        entrada('ob-fim-prev', 'Fim previsto', o.data_fim_prevista, { type: 'date' }),
        entrada('ob-fim-real', 'Fim real', o.data_fim_real, { type: 'date' }),
        escolha('ob-responsavel', 'Responsável da obra', [['', '— Ninguém —'], ...equipa.map((p) => [p.id, p.nome || p.utilizador])], o.responsavel_id),
        escolha('ob-cliente', 'Cliente (conta Cliente)', [['', '— Sem cliente —'], ...clientes.map((p) => [p.id, p.nome || p.utilizador])], o.cliente_id)
      ]),
      el('p', { class: 'ajuda', style: 'margin:-.6rem 0 1rem', text: clientes.length ? 'O cliente passa a ser membro da obra e só vê esta obra.' : 'Para escolher um cliente, crie primeiro uma conta do tipo Cliente em Colaboradores.' }),
      el('div', { class: 'campo' }, [el('label', { for: 'ob-notas', text: 'Notas internas' }), el('textarea', { id: 'ob-notas', rows: 4 }, o.notas || '')]),
      el('div', { class: 'acoes-form' }, [
        el('button', { class: 'botao', type: 'submit', text: novo ? 'Criar obra' : 'Guardar' }),
        el('a', { class: 'botao secundario', href: novo ? '#obras' : '#obras/' + o.id, text: 'Cancelar' }),
        novo ? null : el('button', { class: 'botao perigo', type: 'button', text: 'Apagar obra', style: 'margin-left:auto', onclick: () => apagar(o) })
      ]),
      el('p', { class: 'mensagem erro', id: 'ob-mensagem', role: 'alert' })
    ]);

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const v = (id) => $(id).value.trim() || null;
      const msg = (t) => { $('ob-mensagem').textContent = t; };
      if (!v('ob-nome')) return msg('Indique o nome da obra.');
      let latitude = null, longitude = null;
      if (v('ob-coords')) {
        const m = v('ob-coords').match(/^\s*(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)\s*$/);
        if (!m) return msg('Coordenadas: escreva "latitude, longitude" (ex.: 39.0634, -9.1462).');
        latitude = +m[1].replace(',', '.'); longitude = +m[2].replace(',', '.');
        if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return msg('Coordenadas fora dos limites.');
      }
      const registo = {
        codigo: v('ob-codigo'), nome: v('ob-nome'), estado: $('ob-estado').value, morada: v('ob-morada'), localidade: v('ob-localidade'),
        latitude, longitude, data_inicio: v('ob-inicio'), data_fim_prevista: v('ob-fim-prev'), data_fim_real: v('ob-fim-real'),
        responsavel_id: v('ob-responsavel'), cliente_id: v('ob-cliente'), notas: $('ob-notas').value.trim() || null
      };
      try {
        if (novo) {
          const criada = await ok(sb.from('obras').insert(registo).select('id').single(), 'Não foi possível criar a obra (o código já existe?).');
          location.hash = 'obras/' + criada.id;
        } else {
          await ok(sb.from('obras').update(registo).eq('id', o.id), 'Não foi possível guardar (o código já existe?).');
          location.hash = 'obras/' + o.id;
        }
      } catch (e) { msg(e.message); }
    });

    $('obras-conteudo').replaceChildren(el('a', { class: 'voltar', href: novo ? '#obras' : '#obras/' + o.id, text: '← Voltar' }), form);
    $('ob-nome').focus();
  }

  async function apagar(o) {
    if (!confirm(`Apagar a obra "${nomeObra(o)}"?\n\nApaga também os checks marcados, responsáveis e membros desta obra. Não pode ser desfeito.`)) return;
    try {
      await ok(sb.from('obras').delete().eq('id', o.id), 'Não foi possível apagar a obra.');
      location.hash = 'obras';
    } catch (e) { $('ob-mensagem').textContent = e.message; }
  }

  // ---------- membros ----------
  let obraMembros = null, membrosAntes = [];
  function abrirMembros(o, atuais) {
    obraMembros = o; membrosAntes = atuais;
    const candidatos = pessoas.filter((p) => !['admin', 'administrador'].includes(p.papel));
    $('dm-lista').replaceChildren(...(candidatos.length ? candidatos.map((p) => el('label', {}, [
      el('input', { type: 'checkbox', value: p.id, checked: atuais.includes(p.id) }), `${p.nome || p.utilizador} (${PAPEIS[p.papel]})`
    ])) : [el('p', { class: 'ajuda', text: 'Ainda não há contas de Obra, Subempreiteiro ou Cliente.' })]));
    $('dm-mensagem').textContent = '';
    $('d-membros').showModal();
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('f-membros').addEventListener('submit', async (ev) => {
      if (!ev.submitter || ev.submitter.value !== 'ok') return;
      ev.preventDefault();
      const depois = [...$('dm-lista').querySelectorAll('input:checked')].map((x) => x.value);
      const novos = depois.filter((id) => !membrosAntes.includes(id)), saem = membrosAntes.filter((id) => !depois.includes(id));
      try {
        if (novos.length) await ok(sb.from('obra_membros').insert(novos.map((user_id) => ({ obra_id: obraMembros.id, user_id }))));
        if (saem.length) await ok(sb.from('obra_membros').delete().eq('obra_id', obraMembros.id).in('user_id', saem));
        $('d-membros').close();
        await mostrar('obras/' + obraMembros.id, eu);
        aviso('Membros guardados.', 'ok');
      } catch (e) { $('dm-mensagem').textContent = e.message; }
    });
  });

  window.ObrasHub = { mostrar, ESTADOS, nomeObra };
})();
