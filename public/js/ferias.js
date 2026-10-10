// Separador "Férias": mapa e gestão (ADMIN/Administrador) ou "As minhas férias" (quem tem ficha).
(function () {
  const { sb, $, el } = Hub;
  const TIPOS = {
    ferias: { nome: 'Férias', sigla: 'F', cor: '#ffcd34' },
    ferias_empresa: { nome: 'Férias Discovercasa', sigla: 'FD', cor: '#f0a500' },
    falta: { nome: 'Falta', sigla: 'Fa', cor: '#e57373' },
    teletrabalho: { nome: 'Teletrabalho', sigla: 'T', cor: '#64b5f6' },
    tese: { nome: 'Trabalho tese', sigla: 'W', cor: '#9575cd' },
    compensacao: { nome: 'Dia de compensação', sigla: 'C', cor: '#81c784' },
    baixa: { nome: 'Baixa', sigla: 'B', cor: '#bdbdbd' },
    formacao: { nome: 'Formação', sigla: 'Fo', cor: '#4db6ac' }
  };
  const PEDIVEIS = ['ferias', 'teletrabalho', 'compensacao', 'formacao', 'falta'];
  const ESTADOS = { pendente: 'Pendente', aprovado: 'Aprovado', recusado: 'Recusado' };
  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  let eu = null, gestor = false, ano = new Date().getFullYear(), mes = new Date().getMonth(), vista = 'mapa';
  let fichas = [], ausencias = [], feriados = new Map(), saldos = [];

  async function ok(p, msg = 'Não foi possível guardar.') { const { data, error } = await p; if (error) { console.error(error); throw new Error(msg); } return data; }
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dataPT = (s) => new Date(s + 'T00:00:00').toLocaleDateString('pt-PT');
  const num = (n) => Number(n).toLocaleString('pt-PT', { maximumFractionDigits: 1 });
  function aviso(texto, tipo = 'erro') { const m = $('fe-aviso'); m.textContent = texto || ''; m.className = 'mensagem ' + (texto ? tipo : ''); }
  function diasUteis(ini, fim, meio) {
    if (meio) return 0.5;
    let n = 0;
    for (let d = new Date(ini + 'T00:00:00'); iso(d) <= fim; d.setDate(d.getDate() + 1))
      if (d.getDay() % 6 !== 0 && !feriados.has(iso(d))) n++;
    return n;
  }
  const periodo = (a) => a.data_inicio === a.data_fim ? dataPT(a.data_inicio) + (a.meio_dia ? ' (meio dia)' : '') : `${dataPT(a.data_inicio)} a ${dataPT(a.data_fim)}`;
  const etiquetaTipo = (t) => el('span', { class: 'tipo-aus', style: `--cor:${TIPOS[t].cor}`, text: TIPOS[t].nome });
  const etiquetaEstado = (e) => el('span', { class: 'estado ' + ({ aprovado: 'sim', recusado: 'nao', pendente: 'aviso' }[e]), text: ESTADOS[e] });

  async function carregar() {
    const ini = `${ano}-01-01`, fim = `${ano}-12-31`;
    const [f, a, s] = await Promise.all([
      ok(sb.from('feriados').select('data, nome, ambito').gte('data', ini).lte('data', fim).order('data'), 'Não foi possível carregar os feriados.'),
      ok(sb.from('ausencias').select('*').lte('data_inicio', fim).gte('data_fim', ini).order('data_inicio'), 'Não foi possível carregar as ausências.'),
      ok(sb.rpc('saldos_ferias', { p_ano: ano }), 'Não foi possível carregar os saldos.')
    ]);
    feriados = new Map(f.map((x) => [x.data, x])); ausencias = a; saldos = s;
    if (gestor) fichas = await ok(sb.from('colaboradores').select('id, nome').order('nome'), 'Não foi possível carregar a equipa.');
  }

  async function mostrar(rota, utilizador) {
    eu = utilizador; gestor = Hub.ehGestor(eu);
    const sub = rota.split('/')[1];
    if (['mapa', 'saldos', 'feriados'].includes(sub)) vista = sub;
    $('fe-conteudo').replaceChildren(el('p', { class: 'carregar', text: 'A carregar…' }));
    aviso('');
    try { await carregar(); } catch (e) { $('fe-conteudo').replaceChildren(); return aviso(e.message); }
    desenhar();
  }
  async function recarregar() { try { await carregar(); desenhar(); } catch (e) { aviso(e.message); } }

  function seletorAno() {
    return el('div', { class: 'navega' }, [
      el('button', { class: 'botao secundario pequeno', type: 'button', text: '‹', 'aria-label': 'Ano anterior', onclick: () => { ano--; recarregar(); } }),
      el('strong', { text: String(ano) }),
      el('button', { class: 'botao secundario pequeno', type: 'button', text: '›', 'aria-label': 'Ano seguinte', onclick: () => { ano++; recarregar(); } })
    ]);
  }

  function desenhar() { gestor ? desenharGestao() : desenharMinhas(); }

  // =================== Gestão (ADMIN / Administrador) ===================
  function desenharGestao() {
    const pendentes = ausencias.filter((a) => a.estado === 'pendente');
    const nomeDe = (id) => (fichas.find((f) => f.id === id) || {}).nome || '—';
    const conteudo = [
      el('div', { class: 'barra' }, [
        el('div', {}, [el('h1', { class: 'titulo', text: 'Férias e ausências' }), el('p', { class: 'subtitulo', style: 'margin:0', text: 'Mapa da equipa, pedidos, saldos e feriados.' })]),
        el('div', { class: 'acoes-form' }, [
          el('button', { class: 'botao', type: 'button', text: '+ Registar ausência', onclick: () => abrirAusencia(null, {}) }),
          el('button', { class: 'botao secundario', type: 'button', text: '+ Férias Discovercasa', onclick: abrirEmpresa })
        ])
      ])
    ];
    if (pendentes.length) conteudo.push(el('section', { class: 'painel pedidos' }, [
      el('h2', { class: 'titulo', text: `Pedidos pendentes · ${pendentes.length}` }),
      el('ul', {}, pendentes.map((a) => el('li', {}, [
        el('strong', { text: nomeDe(a.colaborador_id) }), etiquetaTipo(a.tipo), el('span', { text: periodo(a) }),
        el('span', { class: 'ajuda', style: 'margin:0', text: `${num(diasUteis(a.data_inicio, a.data_fim, a.meio_dia))} dia(s) úteis` }),
        a.notas ? el('span', { class: 'ajuda', style: 'margin:0', text: '“' + a.notas + '”' }) : null,
        el('span', { class: 'espaco' }),
        el('button', { class: 'botao pequeno', type: 'button', text: 'Aprovar', onclick: () => decidir(a, 'aprovado') }),
        el('button', { class: 'botao perigo pequeno', type: 'button', text: 'Recusar', onclick: () => decidir(a, 'recusado') })
      ])))
    ]));
    const sub = (id, nome) => el('a', { href: '#ferias/' + id, 'aria-current': vista === id ? 'page' : false, text: nome });
    conteudo.push(el('nav', { class: 'sub-abas' }, [sub('mapa', 'Mapa'), sub('saldos', 'Saldos'), sub('feriados', 'Feriados')]));
    conteudo.push(vista === 'saldos' ? vistaSaldos() : vista === 'feriados' ? vistaFeriados() : vistaMapa());
    $('fe-conteudo').replaceChildren(...conteudo);
  }

  async function decidir(a, estado) {
    try {
      await ok(sb.from('ausencias').update({ estado, decidido_por: eu.id, decidido_em: new Date().toISOString() }).eq('id', a.id));
      aviso(estado === 'aprovado' ? 'Pedido aprovado.' : 'Pedido recusado.', 'ok');
      await recarregar();
    } catch (e) { aviso(e.message); }
  }

  function vistaMapa() {
    const nDias = new Date(ano, mes + 1, 0).getDate();
    const dias = Array.from({ length: nDias }, (_, i) => new Date(ano, mes, i + 1));
    const porDia = new Map();
    for (const a of ausencias) {
      if (a.estado === 'recusado') continue;
      for (const d of dias) { const k = iso(d); if (k >= a.data_inicio && k <= a.data_fim) porDia.set(a.colaborador_id + '|' + k, a); }
    }
    const classeDia = (d) => (feriados.has(iso(d)) ? 'feriado' : d.getDay() % 6 === 0 ? 'fds' : '');
    const cabeca = el('tr', {}, [el('th', { class: 'nome', text: 'Colaborador' }), ...dias.map((d) => el('th', {
      class: classeDia(d), title: feriados.has(iso(d)) ? feriados.get(iso(d)).nome : ''
    }, [el('small', { text: SEMANA[d.getDay()] }), String(d.getDate())]))]);
    const linhas = fichas.map((f) => el('tr', {}, [el('th', { class: 'nome', scope: 'row', text: f.nome }), ...dias.map((d) => {
      const k = iso(d), a = porDia.get(f.id + '|' + k);
      if (!a) return el('td', { class: classeDia(d), title: `${f.nome} · ${dataPT(k)}`, onclick: () => abrirAusencia(null, { colaborador_id: f.id, data_inicio: k, data_fim: k }) });
      const t = TIPOS[a.tipo];
      return el('td', {
        class: 'marcado ' + (a.estado === 'pendente' ? 'pendente ' : '') + classeDia(d), style: `--cor:${t.cor}`,
        title: `${f.nome} · ${t.nome} · ${periodo(a)}${a.estado === 'pendente' ? ' (pendente)' : ''}`,
        onclick: () => abrirAusencia(a)
      }, el('span', { text: a.meio_dia ? '½' : t.sigla }));
    })]));
    return el('div', {}, [
      el('div', { class: 'navega' }, [
        el('button', { class: 'botao secundario pequeno', type: 'button', text: '‹', 'aria-label': 'Mês anterior', onclick: () => { if (mes === 0) { mes = 11; ano--; recarregar(); } else { mes--; desenhar(); } } }),
        el('strong', { class: 'titulo', text: `${MESES[mes]} ${ano}` }),
        el('button', { class: 'botao secundario pequeno', type: 'button', text: '›', 'aria-label': 'Mês seguinte', onclick: () => { if (mes === 11) { mes = 0; ano++; recarregar(); } else { mes++; desenhar(); } } })
      ]),
      el('div', { class: 'tabela-envolvente mapa-envolvente' }, el('table', { class: 'mapa' }, [el('thead', {}, cabeca), el('tbody', {}, linhas)])),
      el('div', { class: 'legenda' }, [...Object.values(TIPOS).map((t) => el('span', {}, [el('i', { style: `--cor:${t.cor}`, text: t.sigla }), t.nome])),
        el('span', {}, [el('i', { class: 'pendente', style: '--cor:#ffcd34', text: 'F' }), 'Pendente']),
        el('span', {}, [el('i', { class: 'feriado' }), 'Feriado']), el('span', {}, [el('i', { class: 'fds' }), 'Fim de semana'])]),
      el('p', { class: 'ajuda', text: 'Carregue num dia para registar uma ausência, ou numa marcação para a ver ou alterar.' })
    ]);
  }

  function vistaSaldos() {
    const linhas = saldos.map((s) => {
      const dias = el('input', { type: 'number', min: 0, step: 0.5, value: s.dias, 'aria-label': 'Dias por ano de ' + s.nome });
      const trans = el('input', { type: 'number', min: 0, step: 0.5, value: s.transitados, 'aria-label': 'Dias transitados de ' + s.nome });
      const guardar = async () => {
        try {
          await ok(sb.from('ferias_saldos').upsert({ colaborador_id: s.colaborador_id, ano, dias: +dias.value || 0, transitados: +trans.value || 0 }));
          aviso(`Saldo de ${s.nome} guardado.`, 'ok'); await recarregar();
        } catch (e) { aviso(e.message); }
      };
      dias.addEventListener('change', guardar); trans.addEventListener('change', guardar);
      return el('tr', {}, [el('td', { text: s.nome }), el('td', {}, dias), el('td', {}, trans), el('td', { text: num(s.gozados) }),
        el('td', { text: num(s.pendentes) }), el('td', {}, el('strong', { class: s.disponivel < 0 ? 'negativo' : '', text: num(s.disponivel) }))]);
    });
    return el('div', {}, [
      el('div', { class: 'navega' }, [seletorAno()]),
      el('div', { class: 'tabela-envolvente' }, el('table', { class: 'saldos' }, [
        el('thead', {}, el('tr', {}, ['Colaborador', 'Dias por ano', 'Transitados', 'Gozados', 'Pendentes', 'Disponível'].map((t) => el('th', { text: t })))),
        el('tbody', {}, linhas)])),
      el('p', { class: 'ajuda', text: 'Descontam do saldo as férias pessoais e as Férias Discovercasa aprovadas, em dias úteis (sem fins de semana nem feriados).' })
    ]);
  }

  function vistaFeriados() {
    const data = el('input', { type: 'date', 'aria-label': 'Data do feriado' });
    const nome = el('input', { placeholder: 'Nome (ex.: Feriado municipal)', 'aria-label': 'Nome do feriado' });
    return el('div', {}, [
      el('div', { class: 'navega' }, [seletorAno()]),
      el('div', { class: 'filtros' }, [data, nome, el('button', { class: 'botao', type: 'button', text: '+ Feriado municipal', onclick: async () => {
        if (!data.value || !nome.value.trim()) return aviso('Indique a data e o nome do feriado.');
        try { await ok(sb.from('feriados').insert({ data: data.value, nome: nome.value.trim(), ambito: 'municipal' }), 'Não foi possível guardar (já existe um feriado nesse dia?).'); aviso('Feriado acrescentado.', 'ok'); await recarregar(); }
        catch (e) { aviso(e.message); }
      } })]),
      el('div', { class: 'tabela-envolvente' }, el('table', {}, [
        el('thead', {}, el('tr', {}, ['Data', 'Feriado', 'Tipo', ''].map((t) => el('th', { text: t })))),
        el('tbody', {}, [...feriados.values()].map((f) => el('tr', {}, [
          el('td', { text: dataPT(f.data) }), el('td', { text: f.nome }), el('td', { text: f.ambito === 'municipal' ? 'Municipal' : 'Nacional' }),
          el('td', {}, el('button', { class: 'botao secundario pequeno', type: 'button', text: 'Apagar', onclick: async () => {
            if (!confirm(`Apagar o feriado ${f.nome} (${dataPT(f.data)})?`)) return;
            try { await ok(sb.from('feriados').delete().eq('data', f.data), 'Não foi possível apagar.'); await recarregar(); } catch (e) { aviso(e.message); }
          } }))
        ])))
      ]))
    ]);
  }

  // ---------- registar / editar ausência (gestores) ----------
  let emEdicao = null;
  function abrirAusencia(a, pre = {}) {
    emEdicao = a;
    const v = a || { tipo: 'ferias', estado: 'aprovado', meio_dia: false, ...pre };
    $('da-titulo').textContent = a ? 'Ausência' : 'Registar ausência';
    $('da-colaborador').replaceChildren(...fichas.map((f) => el('option', { value: f.id, text: f.nome, selected: f.id === v.colaborador_id })));
    $('da-tipo').replaceChildren(...Object.entries(TIPOS).map(([k, t]) => el('option', { value: k, text: t.nome, selected: k === v.tipo })));
    $('da-estado').replaceChildren(...Object.entries(ESTADOS).map(([k, t]) => el('option', { value: k, text: t, selected: k === v.estado })));
    $('da-inicio').value = v.data_inicio || iso(new Date()); $('da-fim').value = v.data_fim || $('da-inicio').value;
    $('da-meio').checked = !!v.meio_dia; $('da-notas').value = v.notas || '';
    $('da-apagar').hidden = !a; $('da-mensagem').textContent = '';
    atualizarContagem('da');
    $('d-ausencia').showModal();
  }

  function atualizarContagem(p) {
    const ini = $(p + '-inicio').value, fim = $(p + '-fim').value, meio = $(p + '-meio') && $(p + '-meio').checked;
    if (meio && ini) $(p + '-fim').value = ini;
    const n = ini && fim && fim >= ini ? diasUteis(ini, $(p + '-fim').value, meio) : null;
    $(p + '-contagem').textContent = n == null ? '' : `${num(n)} dia(s) úteis`;
  }

  async function abrirEmpresa() {
    $('dfe-inicio').value = ''; $('dfe-fim').value = ''; $('dfe-notas').value = ''; $('dfe-mensagem').textContent = ''; $('dfe-contagem').textContent = '';
    $('d-ferias-empresa').showModal();
  }

  // ---------- As minhas férias (quem tem ficha) ----------
  function desenharMinhas() {
    const s = saldos[0];
    if (!s) { $('fe-conteudo').replaceChildren(el('div', { class: 'vazio', text: 'Ainda não tem ficha de colaborador. Fale com um administrador.' })); return; }
    const cartao = (rotulo, valor, destaque) => el('div', { class: 'saldo' + (destaque ? ' destaque' : '') }, [el('span', { text: rotulo }), el('strong', { text: num(valor) })]);
    const minhas = ausencias.filter((a) => a.colaborador_id === s.colaborador_id);
    $('fe-conteudo').replaceChildren(
      el('div', { class: 'barra' }, [
        el('div', {}, [el('h1', { class: 'titulo', text: 'As minhas férias' }), el('p', { class: 'subtitulo', style: 'margin:0', text: 'Saldo, pedidos e ausências registadas.' })]),
        el('button', { class: 'botao', type: 'button', text: '+ Pedir', onclick: abrirPedido })
      ]),
      el('div', { class: 'navega' }, [seletorAno()]),
      el('div', { class: 'saldos-cartoes' }, [cartao('Dias do ano', s.dias), cartao('Transitados', s.transitados), cartao('Gozados', s.gozados), cartao('Pendentes', s.pendentes), cartao('Disponíveis', s.disponivel, true)]),
      el('div', { class: 'tabela-envolvente' }, el('table', {}, [
        el('thead', {}, el('tr', {}, ['Tipo', 'Período', 'Dias úteis', 'Estado', ''].map((t) => el('th', { text: t })))),
        el('tbody', {}, minhas.length ? minhas.map((a) => el('tr', {}, [
          el('td', {}, etiquetaTipo(a.tipo)), el('td', { text: periodo(a) }), el('td', { text: num(diasUteis(a.data_inicio, a.data_fim, a.meio_dia)) }),
          el('td', {}, etiquetaEstado(a.estado)),
          el('td', {}, a.estado === 'pendente' ? el('button', { class: 'botao secundario pequeno', type: 'button', text: 'Cancelar pedido', onclick: async () => {
            if (!confirm('Cancelar este pedido?')) return;
            try { await ok(sb.from('ausencias').delete().eq('id', a.id), 'Não foi possível cancelar.'); aviso('Pedido cancelado.', 'ok'); await recarregar(); } catch (e) { aviso(e.message); }
          } }) : null)
        ])) : [el('tr', {}, el('td', { colspan: 5, text: `Sem ausências em ${ano}.` }))])
      ]))
    );
  }

  function abrirPedido() {
    $('dp-tipo').replaceChildren(...PEDIVEIS.map((k) => el('option', { value: k, text: TIPOS[k].nome })));
    $('dp-inicio').value = ''; $('dp-fim').value = ''; $('dp-meio').checked = false; $('dp-notas').value = '';
    $('dp-mensagem').textContent = ''; $('dp-contagem').textContent = '';
    $('d-pedido').showModal();
  }

  // ---------- eventos dos diálogos ----------
  document.addEventListener('DOMContentLoaded', () => {
    for (const p of ['da', 'dp', 'dfe']) for (const c of ['inicio', 'fim', 'meio']) {
      const x = $(`${p}-${c}`); if (x) x.addEventListener('change', () => atualizarContagem(p));
    }

    $('f-ausencia').addEventListener('submit', async (ev) => {
      if (!ev.submitter || ev.submitter.value !== 'ok') return;
      ev.preventDefault();
      const r = { colaborador_id: $('da-colaborador').value, tipo: $('da-tipo').value, data_inicio: $('da-inicio').value, data_fim: $('da-fim').value,
        meio_dia: $('da-meio').checked, estado: $('da-estado').value, notas: $('da-notas').value.trim() || null };
      if (!r.data_inicio || !r.data_fim || r.data_fim < r.data_inicio) { $('da-mensagem').textContent = 'Datas inválidas.'; return; }
      if (r.meio_dia && r.data_fim !== r.data_inicio) { $('da-mensagem').textContent = 'Meio dia só num dia.'; return; }
      if (!emEdicao || emEdicao.estado !== r.estado) Object.assign(r, { decidido_por: eu.id, decidido_em: new Date().toISOString() });
      try {
        await ok(emEdicao ? sb.from('ausencias').update(r).eq('id', emEdicao.id) : sb.from('ausencias').insert(r));
        $('d-ausencia').close(); aviso('Guardado.', 'ok'); await recarregar();
      } catch (e) { $('da-mensagem').textContent = e.message; }
    });
    $('da-apagar').addEventListener('click', async () => {
      if (!confirm('Apagar esta ausência?')) return;
      try { await ok(sb.from('ausencias').delete().eq('id', emEdicao.id), 'Não foi possível apagar.'); $('d-ausencia').close(); await recarregar(); }
      catch (e) { $('da-mensagem').textContent = e.message; }
    });

    $('f-ferias-empresa').addEventListener('submit', async (ev) => {
      if (!ev.submitter || ev.submitter.value !== 'ok') return;
      ev.preventDefault();
      const ini = $('dfe-inicio').value, fim = $('dfe-fim').value;
      if (!ini || !fim || fim < ini) { $('dfe-mensagem').textContent = 'Datas inválidas.'; return; }
      try {
        await ok(sb.from('ausencias').insert(fichas.map((f) => ({ colaborador_id: f.id, tipo: 'ferias_empresa', data_inicio: ini, data_fim: fim,
          estado: 'aprovado', notas: $('dfe-notas').value.trim() || null, decidido_por: eu.id, decidido_em: new Date().toISOString() }))));
        $('d-ferias-empresa').close(); aviso(`Férias Discovercasa registadas para ${fichas.length} colaboradores.`, 'ok'); await recarregar();
      } catch (e) { $('dfe-mensagem').textContent = e.message; }
    });

    $('f-pedido').addEventListener('submit', async (ev) => {
      if (!ev.submitter || ev.submitter.value !== 'ok') return;
      ev.preventDefault();
      const s = saldos[0];
      const r = { colaborador_id: s.colaborador_id, tipo: $('dp-tipo').value, data_inicio: $('dp-inicio').value, data_fim: $('dp-fim').value,
        meio_dia: $('dp-meio').checked, estado: 'pendente', pedido_por: eu.id, notas: $('dp-notas').value.trim() || null };
      if (!r.data_inicio || !r.data_fim || r.data_fim < r.data_inicio) { $('dp-mensagem').textContent = 'Datas inválidas.'; return; }
      const n = diasUteis(r.data_inicio, r.data_fim, r.meio_dia);
      if (r.tipo === 'ferias' && n > s.disponivel - s.pendentes && !confirm(`Este pedido (${num(n)} dias) ultrapassa os dias disponíveis. Enviar mesmo assim?`)) return;
      try { await ok(sb.from('ausencias').insert(r), 'Não foi possível enviar o pedido.'); $('d-pedido').close(); aviso('Pedido enviado. Fica pendente até ser aprovado.', 'ok'); await recarregar(); }
      catch (e) { $('dp-mensagem').textContent = e.message; }
    });
  });

  async function pendentes() {
    const { count } = await sb.from('ausencias').select('id', { count: 'exact', head: true }).eq('estado', 'pendente');
    return count || 0;
  }

  window.FeriasHub = { mostrar, pendentes, TIPOS };
})();
