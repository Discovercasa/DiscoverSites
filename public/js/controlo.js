// Separador "Controlo" (só ADMIN e Administrador): GPS (deslocações) e Horas extra.
(function () {
  const { sb, $, el } = Hub;
  let eu = null, aba = 'gps', carregado = false;
  let colabs = [], veiculos = [], obras = [], gps = [], horas = [];
  let filtroGps = Hub.recordar('controlo.gps', { mes: new Date().toLocaleDateString('sv').slice(0, 7), condutor: '', veiculo: '' });
  let filtroHoras = Hub.recordar('controlo.horas', { mes: '', colab: '', estado: '' });
  const VALOR_HORA = 8.5;

  async function ok(p, msg = 'Não foi possível guardar.') { const { data, error } = await p; if (error) { console.error(error); throw new Error(msg); } return data; }
  const dataPT = (s) => new Date(s + 'T00:00:00').toLocaleDateString('pt-PT');
  const euros = (n) => Number(n || 0).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });
  const hm = (t) => (t ? t.slice(0, 5) : '');
  const minutos = (a, b) => (a && b ? (+b.slice(0, 2) * 60 + +b.slice(3, 5)) - (+a.slice(0, 2) * 60 + +a.slice(3, 5)) : 0);
  const duracao = (m) => (m > 0 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : '—');
  function aviso(t, tipo = 'erro') { const m = $('ct-aviso'); m.textContent = t || ''; m.className = 'mensagem ' + (t ? tipo : ''); }
  const nomeColab = (r, campo = 'colaborador') => (colabs.find((c) => c.id === r[campo + '_id']) || {}).nome || r[campo + '_texto'] || '—';
  const nomeVeiculo = (r) => { const v = veiculos.find((x) => x.id === r.veiculo_id); return v ? `${v.nome}${v.matricula && v.matricula !== v.nome ? ' · ' + v.matricula : ''}` : r.veiculo_texto || '—'; };
  const nomeObra = (r) => { const o = obras.find((x) => x.id === r.obra_id); return o ? (o.codigo ? `${o.codigo} · ${o.nome}` : o.nome) : r.obra_texto || '—'; };

  async function carregar() {
    const [c, v, o, g, h] = await Promise.all([
      ok(sb.from('colaboradores').select('id, nome').order('nome'), 'Não foi possível carregar a equipa.'),
      ok(sb.from('veiculos').select('id, nome, matricula').order('nome'), 'Não foi possível carregar os veículos.'),
      ok(sb.from('obras').select('id, codigo, nome').order('nome'), 'Não foi possível carregar as obras.'),
      ok(sb.from('gps_registos').select('*').order('data', { ascending: false }), 'Não foi possível carregar o GPS.'),
      ok(sb.from('horas_extra').select('*').order('data', { ascending: false }), 'Não foi possível carregar as horas extra.')
    ]);
    colabs = c; veiculos = v; obras = o; gps = g; horas = h;
  }

  async function mostrar(rota, utilizador) {
    eu = utilizador; aviso('');
    aba = rota.split('/')[1] === 'horas' ? 'horas' : 'gps';
    document.querySelectorAll('#aba-controlo .sub-abas a').forEach((a) => a.dataset.sub === aba ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
    if (!carregado) {
      $('ct-conteudo').replaceChildren(el('p', { class: 'carregar', text: 'A carregar…' }));
      try { await carregar(); carregado = true; } catch (e) { $('ct-conteudo').replaceChildren(); return aviso(e.message); }
    } else {
      const antes = JSON.stringify([gps, horas]);
      carregar().then(() => { if (JSON.stringify([gps, horas]) !== antes && Hub.rota().startsWith('controlo')) desenhar(); }).catch(() => {});
    }
    desenhar();
  }
  async function recarregar() { try { await carregar(); desenhar(); } catch (e) { aviso(e.message); } }
  const desenhar = () => (aba === 'horas' ? desenharHoras() : desenharGps());

  const opcoes = (lista, valor, vazio) => [el('option', { value: '', text: vazio }), ...lista.map(([v, t]) => el('option', { value: v, text: t, selected: v === valor }))];

  // ======================= GPS =======================
  function desenharGps() {
    const f = filtroGps;
    const mes = el('input', { type: 'month', value: f.mes, 'aria-label': 'Mês' });
    const cond = el('select', { 'aria-label': 'Condutor' }, opcoes(colabs.map((c) => [c.id, c.nome]), f.condutor, 'Todos os condutores'));
    const vei = el('select', { 'aria-label': 'Veículo' }, opcoes(veiculos.map((v) => [v.id, `${v.nome}${v.matricula && v.matricula !== v.nome ? ' · ' + v.matricula : ''}`]), f.veiculo, 'Todos os veículos'));
    const mudar = () => { filtroGps = { mes: mes.value, condutor: cond.value, veiculo: vei.value }; Hub.lembrar('controlo.gps', filtroGps); desenharGps(); };
    [mes, cond, vei].forEach((x) => x.addEventListener('change', mudar));

    const lista = gps.filter((r) => (!f.mes || r.data.startsWith(f.mes)) && (!f.condutor || r.condutor_id === f.condutor) && (!f.veiculo || r.veiculo_id === f.veiculo));
    const total = (r) => minutos(r.manha_partida, r.manha_chegada) + minutos(r.almoco_partida, r.almoco_chegada) + minutos(r.tarde_partida, r.tarde_chegada);
    const seg = (a, b) => (a || b ? `${hm(a) || '—'} → ${hm(b) || '—'}` : '—');
    $('ct-conteudo').replaceChildren(
      el('div', { class: 'barra' }, [
        el('div', {}, [el('h1', { class: 'titulo', text: 'GPS' }), el('p', { class: 'subtitulo', style: 'margin:0', text: 'Deslocações diárias: condutor, veículo e horas de partida e chegada.' })]),
        el('button', { class: 'botao', type: 'button', text: '+ Registo', onclick: () => abrirGps(null) })
      ]),
      el('div', { class: 'filtros' }, [mes, cond, vei]),
      el('div', { class: 'tabela-envolvente' }, el('table', {}, [
        el('thead', {}, el('tr', {}, ['Data', 'Condutor', 'Veículo', 'Manhã', 'Almoço', 'Tarde', 'Condução', 'Observações'].map((t) => el('th', { text: t })))),
        el('tbody', {}, lista.length ? lista.map((r) => el('tr', { class: 'clicavel', onclick: () => abrirGps(r), title: 'Abrir' }, [
          el('td', { text: dataPT(r.data) }), el('td', { text: nomeColab(r, 'condutor') }), el('td', { text: nomeVeiculo(r) }),
          el('td', { text: seg(r.manha_partida, r.manha_chegada) }), el('td', { text: seg(r.almoco_partida, r.almoco_chegada) }), el('td', { text: seg(r.tarde_partida, r.tarde_chegada) }),
          el('td', { text: duracao(total(r)) }), el('td', { class: 'obs', text: r.observacoes || '' })
        ])) : [el('tr', {}, el('td', { colspan: 8, text: 'Sem registos neste período.' }))])
      ])),
      lista.length ? el('p', { class: 'ajuda', text: `${lista.length} registo${lista.length === 1 ? '' : 's'} · condução total ${duracao(lista.reduce((a, r) => a + total(r), 0))}` }) : null
    );
  }

  let gpsAtual = null;
  function abrirGps(r) {
    gpsAtual = r;
    $('dg-titulo').textContent = r ? 'Registo de GPS' : 'Novo registo de GPS';
    $('dg-data').value = r ? r.data : new Date().toLocaleDateString('sv');
    $('dg-condutor').replaceChildren(...opcoes(colabs.map((c) => [c.id, c.nome]), r && r.condutor_id, r && r.condutor_texto ? `— ${r.condutor_texto} (sem ficha) —` : '— Escolher —'));
    $('dg-veiculo').replaceChildren(...opcoes(veiculos.map((v) => [v.id, `${v.nome}${v.matricula && v.matricula !== v.nome ? ' · ' + v.matricula : ''}`]), r && r.veiculo_id, r && r.veiculo_texto ? `— ${r.veiculo_texto} (por identificar) —` : '— Escolher —'));
    for (const c of ['manha_partida', 'manha_chegada', 'almoco_partida', 'almoco_chegada', 'tarde_partida', 'tarde_chegada']) $('dg-' + c).value = r ? hm(r[c]) : '';
    $('dg-obs').value = r ? r.observacoes || '' : '';
    $('dg-apagar').hidden = !r; $('dg-mensagem').textContent = '';
    $('d-gps').showModal();
  }

  // ======================= HORAS EXTRA =======================
  function desenharHoras() {
    const f = filtroHoras;
    const mes = el('input', { type: 'month', value: f.mes, 'aria-label': 'Mês' });
    const colab = el('select', { 'aria-label': 'Colaborador' }, opcoes([...colabs.map((c) => [c.id, c.nome]), ...[...new Set(horas.filter((h) => !h.colaborador_id && h.colaborador_texto).map((h) => h.colaborador_texto))].map((t) => ['t:' + t, t + ' (sem ficha)'])], f.colab, 'Todos os colaboradores'));
    const estado = el('select', { 'aria-label': 'Estado' }, opcoes([['nao_pago', 'Não pago'], ['pago', 'Pago']], f.estado, 'Todos os estados'));
    const mudar = () => { filtroHoras = { mes: mes.value, colab: colab.value, estado: estado.value }; Hub.lembrar('controlo.horas', filtroHoras); desenharHoras(); };
    [mes, colab, estado].forEach((x) => x.addEventListener('change', mudar));

    const lista = horas.filter((h) => (!f.mes || h.data.startsWith(f.mes)) && (!f.estado || h.estado === f.estado)
      && (!f.colab || (f.colab.startsWith('t:') ? h.colaborador_texto === f.colab.slice(2) : h.colaborador_id === f.colab)));
    const soma = (l) => l.reduce((a, h) => a + Number(h.valor_total || 0), 0);
    const porPagar = lista.filter((h) => h.estado === 'nao_pago'), pagas = lista.filter((h) => h.estado === 'pago');
    const porColab = {};
    for (const h of lista) { const k = nomeColab(h); porColab[k] = porColab[k] || { horas: 0, total: 0, porPagar: 0 }; porColab[k].horas += Number(h.horas || 0); porColab[k].total += Number(h.valor_total || 0); if (h.estado === 'nao_pago') porColab[k].porPagar += Number(h.valor_total || 0); }

    $('ct-conteudo').replaceChildren(
      el('div', { class: 'barra' }, [
        el('div', {}, [el('h1', { class: 'titulo', text: 'Horas extra' }), el('p', { class: 'subtitulo', style: 'margin:0', text: `Valor por hora por omissão: ${euros(VALOR_HORA)}.` })]),
        el('button', { class: 'botao', type: 'button', text: '+ Registo', onclick: () => abrirHoras(null) })
      ]),
      el('div', { class: 'filtros' }, [mes, colab, estado]),
      el('div', { class: 'saldos-cartoes' }, [
        el('div', { class: 'saldo' }, [el('span', { text: 'Total' }), el('strong', { text: euros(soma(lista)) })]),
        el('div', { class: 'saldo' }, [el('span', { text: 'Pago' }), el('strong', { text: euros(soma(pagas)) })]),
        el('div', { class: 'saldo destaque' }, [el('span', { text: 'Por pagar' }), el('strong', { text: euros(soma(porPagar)) })])
      ]),
      Object.keys(porColab).length ? el('details', { class: 'resumo-colab' }, [el('summary', { text: 'Resumo por colaborador' }),
        el('div', { class: 'tabela-envolvente' }, el('table', {}, [
          el('thead', {}, el('tr', {}, ['Colaborador', 'Horas', 'Total', 'Por pagar'].map((t) => el('th', { text: t })))),
          el('tbody', {}, Object.entries(porColab).sort((a, b) => b[1].total - a[1].total).map(([n, x]) => el('tr', {}, [
            el('td', { text: n }), el('td', { text: x.horas ? x.horas.toLocaleString('pt-PT') : '—' }), el('td', { text: euros(x.total) }), el('td', { text: x.porPagar ? euros(x.porPagar) : '—' })])))
        ]))]) : null,
      el('div', { class: 'tabela-envolvente' }, el('table', {}, [
        el('thead', {}, el('tr', {}, ['Data', 'Obra', 'Colaborador', 'Horas', '€/hora', 'Total', 'Estado', 'Observações'].map((t) => el('th', { text: t })))),
        el('tbody', {}, lista.length ? lista.map((h) => el('tr', { class: 'clicavel', onclick: () => abrirHoras(h), title: 'Abrir' }, [
          el('td', { text: dataPT(h.data) }), el('td', { text: nomeObra(h) }), el('td', { text: nomeColab(h) }),
          el('td', { text: h.horas != null ? Number(h.horas).toLocaleString('pt-PT') : '—' }), el('td', { text: h.valor_hora != null ? euros(h.valor_hora) : '—' }),
          el('td', { text: euros(h.valor_total) }),
          el('td', {}, el('button', { class: 'estado ' + (h.estado === 'pago' ? 'sim' : 'aviso') + ' botao-estado', type: 'button', title: 'Mudar estado',
            text: h.estado === 'pago' ? 'Pago' : 'Não pago', onclick: async (ev) => {
              ev.stopPropagation();
              try { await ok(sb.from('horas_extra').update({ estado: h.estado === 'pago' ? 'nao_pago' : 'pago' }).eq('id', h.id)); await recarregar(); } catch (e) { aviso(e.message); }
            } })),
          el('td', { class: 'obs', text: h.observacoes || '' })
        ])) : [el('tr', {}, el('td', { colspan: 8, text: 'Sem registos com estes filtros.' }))])
      ]))
    );
  }

  let horasAtual = null;
  function abrirHoras(h) {
    horasAtual = h;
    $('dh-titulo').textContent = h ? 'Horas extra' : 'Novas horas extra';
    $('dh-data').value = h ? h.data : new Date().toLocaleDateString('sv');
    $('dh-obra').replaceChildren(...opcoes([...obras.map((o) => [o.id, o.codigo ? `${o.codigo} · ${o.nome}` : o.nome]), ['__texto', 'Outra (escrever)…']], h ? (h.obra_id || (h.obra_texto ? '__texto' : '')) : '', '— Sem obra —'));
    $('dh-obra-texto').value = h ? h.obra_texto || '' : '';
    $('dh-colab').replaceChildren(...opcoes([...colabs.map((c) => [c.id, c.nome]), ['__texto', 'Outra pessoa (escrever)…']], h ? (h.colaborador_id || (h.colaborador_texto ? '__texto' : '')) : '', '— Escolher —'));
    $('dh-colab-texto').value = h ? h.colaborador_texto || '' : '';
    $('dh-horas').value = h && h.horas != null ? h.horas : '';
    $('dh-valor-hora').value = h ? (h.valor_hora != null ? h.valor_hora : '') : VALOR_HORA;
    $('dh-total').value = h ? h.valor_total : '';
    $('dh-estado').value = h ? h.estado : 'nao_pago';
    $('dh-obs').value = h ? h.observacoes || '' : '';
    $('dh-apagar').hidden = !h; $('dh-mensagem').textContent = '';
    textos(); $('d-horas').showModal();
  }
  function textos() {
    $('dh-obra-texto').hidden = $('dh-obra').value !== '__texto';
    $('dh-colab-texto').hidden = $('dh-colab').value !== '__texto';
  }
  function calcularTotal() {
    const h = parseFloat($('dh-horas').value), v = parseFloat($('dh-valor-hora').value);
    if (!isNaN(h) && !isNaN(v)) $('dh-total').value = (Math.round(h * v * 100) / 100).toFixed(2);
  }

  document.addEventListener('DOMContentLoaded', () => {
    // --- GPS ---
    $('f-gps').addEventListener('submit', async (ev) => {
      if (!ev.submitter || ev.submitter.value !== 'ok') return;
      ev.preventDefault();
      const v = (id) => $(id).value || null;
      const r = { data: v('dg-data'), condutor_id: v('dg-condutor'), veiculo_id: v('dg-veiculo'), observacoes: $('dg-obs').value.trim() || null };
      for (const c of ['manha_partida', 'manha_chegada', 'almoco_partida', 'almoco_chegada', 'tarde_partida', 'tarde_chegada']) r[c] = v('dg-' + c);
      if (!r.data) { $('dg-mensagem').textContent = 'Indique a data.'; return; }
      if (r.condutor_id) r.condutor_texto = null; else if (gpsAtual) r.condutor_texto = gpsAtual.condutor_texto;
      if (r.veiculo_id) r.veiculo_texto = null; else if (gpsAtual) r.veiculo_texto = gpsAtual.veiculo_texto;
      try { await ok(gpsAtual ? sb.from('gps_registos').update(r).eq('id', gpsAtual.id) : sb.from('gps_registos').insert(r)); $('d-gps').close(); await recarregar(); }
      catch (e) { $('dg-mensagem').textContent = e.message; }
    });
    $('dg-apagar').addEventListener('click', async () => {
      if (!confirm('Apagar este registo de GPS?')) return;
      try { await ok(sb.from('gps_registos').delete().eq('id', gpsAtual.id), 'Não foi possível apagar.'); $('d-gps').close(); await recarregar(); }
      catch (e) { $('dg-mensagem').textContent = e.message; }
    });

    // --- Horas extra ---
    $('dh-obra').addEventListener('change', textos);
    $('dh-colab').addEventListener('change', textos);
    $('dh-horas').addEventListener('input', calcularTotal);
    $('dh-valor-hora').addEventListener('input', calcularTotal);
    $('f-horas').addEventListener('submit', async (ev) => {
      if (!ev.submitter || ev.submitter.value !== 'ok') return;
      ev.preventDefault();
      const num = (id) => ($(id).value === '' ? null : parseFloat($(id).value));
      const obra = $('dh-obra').value, colab = $('dh-colab').value;
      const r = {
        data: $('dh-data').value || null,
        obra_id: obra && obra !== '__texto' ? obra : null, obra_texto: obra === '__texto' ? $('dh-obra-texto').value.trim() || null : null,
        colaborador_id: colab && colab !== '__texto' ? colab : null, colaborador_texto: colab === '__texto' ? $('dh-colab-texto').value.trim() || null : null,
        horas: num('dh-horas'), valor_hora: num('dh-valor-hora'), valor_total: num('dh-total'),
        estado: $('dh-estado').value, observacoes: $('dh-obs').value.trim() || null
      };
      if (!r.data) { $('dh-mensagem').textContent = 'Indique a data.'; return; }
      if (!r.colaborador_id && !r.colaborador_texto) { $('dh-mensagem').textContent = 'Indique o colaborador.'; return; }
      if (r.valor_total == null || isNaN(r.valor_total)) { $('dh-mensagem').textContent = 'Indique o valor total (ou as horas e o valor por hora).'; return; }
      try { await ok(horasAtual ? sb.from('horas_extra').update(r).eq('id', horasAtual.id) : sb.from('horas_extra').insert(r)); $('d-horas').close(); await recarregar(); }
      catch (e) { $('dh-mensagem').textContent = e.message; }
    });
    $('dh-apagar').addEventListener('click', async () => {
      if (!confirm('Apagar este registo de horas extra?')) return;
      try { await ok(sb.from('horas_extra').delete().eq('id', horasAtual.id), 'Não foi possível apagar.'); $('d-horas').close(); await recarregar(); }
      catch (e) { $('dh-mensagem').textContent = e.message; }
    });
  });

  window.ControloHub = { mostrar };
})();
