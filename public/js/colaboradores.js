// Separador "Colaboradores" → "Equipa": fichas dos colaboradores (só ADMIN e Administrador).
(function () {
  const { sb, PAPEIS, $, el, gerarSenha } = Hub;
  const AREAS = { obra: 'Obra', engenheiro: 'Engenheiro', arquiteto: 'Arquiteto', comercial: 'Comercial', administrativo: 'Administrativo', socio_gerente: 'Sócio-gerente' };
  const DOCUMENTOS = [['carta_validade', 'Carta de condução'], ['cc_validade', 'Cartão de Cidadão'], ['aptidao_validade', 'Aptidão médica']];
  const DIAS_ALERTA = 31;
  const DOMINIO_INTERNO = 'equipa.discovercasa.pt';

  let eu = null, fichas = [], contas = new Map(), carregado = false;
  let filtro = Hub.recordar('equipa.filtro', '');

  async function ok(p, msg = 'Não foi possível guardar.') { const { data, error } = await p; if (error) { console.error(error); throw new Error(msg); } return data; }
  const data = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-PT') : '—');
  function aviso(texto, tipo = 'erro') { const m = $('equipa-aviso'); if (!m) return; m.textContent = texto || ''; m.className = 'mensagem ' + (texto ? tipo : ''); }

  // ---------- validades ----------
  function estadoDoc(d) {
    if (!d) return null;
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const dias = Math.round((new Date(d + 'T00:00:00') - hoje) / 86400000);
    if (dias < 0) return { classe: 'nao', texto: 'Expirado' };
    if (dias <= DIAS_ALERTA) return { classe: 'aviso', texto: dias === 0 ? 'Expira hoje' : `Expira em ${dias} dia${dias === 1 ? '' : 's'}` };
    return { classe: 'sim', texto: 'Válido' };
  }
  function alertasDe(f) {
    return DOCUMENTOS.map(([campo, nome]) => ({ nome, estado: estadoDoc(f[campo]), data: f[campo] }))
      .filter((a) => a.estado && a.estado.classe !== 'sim');
  }

  // ---------- carregar ----------
  async function carregar() {
    const [f, c] = await Promise.all([
      ok(sb.from('colaboradores').select('*').order('nome'), 'Não foi possível carregar a equipa.'),
      ok(sb.rpc('listar_contas'), 'Não foi possível carregar as contas.')
    ]);
    fichas = f; contas = new Map(c.map((x) => [x.id, x]));
  }

  // ---------- rota: "colaboradores", "colaboradores/novo", "colaboradores/<id>" ----------
  async function mostrar(rota, utilizador) {
    eu = utilizador;
    const id = rota.split('/')[1];
    const c = $('colab-equipa');
    if (!carregado) {
      c.replaceChildren(el('p', { class: 'carregar', text: 'A carregar…' }));
      try { await carregar(); carregado = true; } catch (e) { c.replaceChildren(el('p', { class: 'mensagem erro', text: e.message })); return; }
    } else if (!id) {
      // lista: mostra já e atualiza em segundo plano
      const antes = JSON.stringify([fichas, [...contas]]);
      carregar().then(() => { if (JSON.stringify([fichas, [...contas]]) !== antes && Hub.rota() === rota) lista(); }).catch(() => {});
    } else {
      try { await carregar(); } catch (_) {} // ficha: dados frescos antes de editar
    }
    if (id === 'novo') return ficha(null);
    if (id) {
      const f = fichas.find((x) => x.id === id);
      return f ? ficha(f) : c.replaceChildren(el('div', { class: 'vazio', text: 'Colaborador não encontrado.' }));
    }
    lista();
  }

  // ---------- lista ----------
  function lista() {
    const pesquisa = el('input', { type: 'search', placeholder: 'Procurar colaborador', value: filtro, 'aria-label': 'Procurar colaborador' });
    const corpo = el('tbody');
    function desenhar() {
      const t = filtro.toLowerCase();
      const vis = fichas.filter((f) => !t || f.nome.toLowerCase().includes(t) || (AREAS[f.area] || '').toLowerCase().includes(t));
      corpo.replaceChildren(...(vis.length ? vis.map((f) => {
        const conta = f.user_id && contas.get(f.user_id);
        const alertas = alertasDe(f);
        return el('tr', {}, [
          el('td', {}, el('a', { href: '/colaboradores/' + f.id, class: 'nome-ligacao', text: f.nome })),
          el('td', { text: AREAS[f.area] || '—' }),
          el('td', {}, conta ? [conta.utilizador, ' ', el('span', { class: 'etiqueta', text: PAPEIS[conta.papel] || conta.papel })]
            : el('a', { class: 'botao secundario pequeno', href: '/colaboradores/' + f.id, text: 'Sem conta' })),
          el('td', { text: f.telefone || '—' }),
          el('td', {}, alertas.length ? alertas.map((a) => el('span', { class: 'estado ' + a.estado.classe, title: a.nome, text: `${a.nome}: ${a.estado.texto}` })) : '—')
        ]);
      }) : [el('tr', {}, el('td', { colspan: 5, text: fichas.length ? 'Nenhum colaborador encontrado.' : 'Ainda não há colaboradores.' }))]));
    }
    pesquisa.addEventListener('input', () => { filtro = pesquisa.value; Hub.lembrar('equipa.filtro', filtro); desenhar(); });

    $('colab-equipa').replaceChildren(
      el('div', { class: 'barra' }, [
        el('div', {}, [el('h1', { class: 'titulo', text: 'Equipa' }), el('p', { class: 'subtitulo', style: 'margin:0', text: `${fichas.length} colaboradores · fichas visíveis só para ADMIN e Administrador.` })]),
        el('a', { class: 'botao', href: '/colaboradores/novo', text: '+ Novo colaborador' })
      ]),
      el('p', { class: 'mensagem', id: 'equipa-aviso', role: 'status' }),
      el('div', { class: 'filtros' }, pesquisa),
      el('div', { class: 'tabela-envolvente' }, el('table', {}, [
        el('thead', {}, el('tr', {}, ['Nome', 'Área', 'Conta', 'Telefone', 'Documentos'].map((t) => el('th', { text: t })))),
        corpo
      ]))
    );
    desenhar();
  }

  // ---------- ficha ----------
  function ficha(f) {
    const novo = !f; f = f || { nacionalidade: 'Portuguesa', manobrador: false };
    const entrada = (id, rotulo, valor, extra = {}) => el('div', { class: 'campo' }, [el('label', { for: id, text: rotulo }), el('input', { id, value: valor ?? '', autocomplete: 'off', ...extra })]);
    const validade = (campo, rotulo) => {
      const e = estadoDoc(f[campo]);
      return el('div', { class: 'campo' }, [
        el('label', { for: 'cb-' + campo }, [rotulo, ' ', e ? el('span', { class: 'estado ' + e.classe, text: e.texto }) : null]),
        el('input', { id: 'cb-' + campo, type: 'date', value: f[campo] || '' })
      ]);
    };
    const secao = (titulo, campos) => el('section', { class: 'painel' }, [el('h2', { class: 'titulo', text: titulo }), el('div', { class: 'form-grelha' }, campos)]);

    const conta = f.user_id && contas.get(f.user_id);
    const caixaConta = novo ? null : el('section', { class: 'painel conta-ficha' }, [
      el('h2', { class: 'titulo', text: 'Conta de acesso' }),
      conta
        ? el('p', {}, [`Utilizador: `, el('strong', { text: conta.utilizador }), ' · ', el('span', { class: 'etiqueta', text: PAPEIS[conta.papel] }),
            conta.ativo ? '' : el('span', { class: 'estado nao', text: ' Inativa' }), ' · ', el('a', { href: '/colaboradores/contas', text: 'gerir em Contas de acesso' })])
        : el('div', {}, [el('p', { class: 'ajuda', style: 'margin-top:0', text: 'Este colaborador ainda não tem conta na plataforma.' }),
            el('button', { class: 'botao', type: 'button', text: 'Criar conta', onclick: () => abrirCriarConta(f) })])
    ]);

    const form = el('form', { novalidate: true }, [
      secao('Identificação', [
        entrada('cb-nome', 'Nome', f.nome, { required: true }),
        entrada('cb-data_nascimento', 'Data de nascimento', f.data_nascimento, { type: 'date' }),
        entrada('cb-nacionalidade', 'Nacionalidade', f.nacionalidade),
        entrada('cb-nif', 'NIF', f.nif, { inputmode: 'numeric' }),
        entrada('cb-cc_numero', 'Nº do Cartão de Cidadão', f.cc_numero),
        entrada('cb-iban', 'IBAN', f.iban, { spellcheck: 'false' })
      ]),
      secao('Contactos', [
        entrada('cb-telefone', 'Telefone', f.telefone, { type: 'tel' }),
        entrada('cb-email', 'Email', f.email, { type: 'email' }),
        entrada('cb-contacto_urgencia', 'Contacto de urgência', f.contacto_urgencia, { placeholder: 'Nome e telefone' })
      ]),
      secao('Trabalho', [
        entrada('cb-data_entrada', 'Data de entrada', f.data_entrada, { type: 'date' }),
        el('div', { class: 'campo' }, [el('label', { for: 'cb-area', text: 'Área de trabalho' }),
          el('select', { id: 'cb-area' }, [el('option', { value: '', text: '—' }), ...Object.entries(AREAS).map(([v, t]) => el('option', { value: v, text: t, selected: f.area === v }))])]),
        el('div', { class: 'campo' }, [el('span', { class: 'rotulo', text: 'Habilitação de manobrador' }),
          el('label', { class: 'interruptor' }, [el('input', { type: 'checkbox', id: 'cb-manobrador', checked: !!f.manobrador }), 'Tem habilitação'])])
      ]),
      secao(`Documentos · alerta ${DIAS_ALERTA} dias antes`, DOCUMENTOS.map(([c, n]) => validade(c, n))),
      el('div', { class: 'acoes-form' }, [
        el('button', { class: 'botao', type: 'submit', text: novo ? 'Criar ficha' : 'Guardar' }),
        el('a', { class: 'botao secundario', href: '/colaboradores', text: 'Cancelar' }),
        novo ? null : el('button', { class: 'botao perigo', type: 'button', style: 'margin-left:auto', text: 'Apagar ficha', onclick: () => apagar(f) })
      ]),
      el('p', { class: 'mensagem erro', id: 'cb-mensagem', role: 'alert' })
    ]);

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const v = (id) => { const x = $('cb-' + id); return x.value.trim() || null; };
      if (!v('nome')) { $('cb-mensagem').textContent = 'Indique o nome.'; return; }
      const iban = v('iban') ? v('iban').replace(/\s/g, '').toUpperCase() : null;
      if (iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) { $('cb-mensagem').textContent = 'IBAN inválido.'; return; }
      const registo = {
        nome: v('nome'), data_nascimento: v('data_nascimento'), nacionalidade: v('nacionalidade'), nif: v('nif'), cc_numero: v('cc_numero'), iban,
        telefone: v('telefone'), email: v('email'), contacto_urgencia: v('contacto_urgencia'), data_entrada: v('data_entrada'), area: v('area'),
        manobrador: $('cb-manobrador').checked, carta_validade: v('carta_validade'), cc_validade: v('cc_validade'), aptidao_validade: v('aptidao_validade')
      };
      try {
        if (novo) {
          const criada = await ok(sb.from('colaboradores').insert(registo).select('id').single());
          Hub.ir('colaboradores/' + criada.id);
        } else {
          await ok(sb.from('colaboradores').update(registo).eq('id', f.id));
          Hub.ir('colaboradores');
        }
      } catch (e) { $('cb-mensagem').textContent = e.message; }
    });

    $('colab-equipa').replaceChildren(
      el('a', { class: 'voltar', href: '/colaboradores', text: '← Equipa' }),
      el('h1', { class: 'titulo', text: novo ? 'Novo colaborador' : f.nome }),
      el('p', { class: 'subtitulo', text: 'Dados pessoais visíveis só para ADMIN e Administrador.' }),
      ...[caixaConta, form].filter(Boolean)
    );
  }

  async function apagar(f) {
    if (!confirm(`Apagar a ficha de ${f.nome}?\n\nA conta de acesso (se existir) não é apagada.`)) return;
    try { await ok(sb.from('colaboradores').delete().eq('id', f.id), 'Não foi possível apagar.'); Hub.ir('colaboradores'); }
    catch (e) { $('cb-mensagem').textContent = e.message; }
  }

  // ---------- criar conta a partir da ficha ----------
  function sugerirUtilizador(nome) {
    return nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').slice(0, 30) || 'colaborador';
  }
  let fichaConta = null;
  function abrirCriarConta(f) {
    fichaConta = f;
    const u = sugerirUtilizador(f.nome);
    $('cc-para').textContent = f.nome;
    $('cc-utilizador').value = u;
    $('cc-email').value = f.email || `${u}@${DOMINIO_INTERNO}`;
    $('cc-papel').replaceChildren(...['obra', 'subempreiteiro', 'administrador', 'admin'].map((p) =>
      el('option', { value: p, text: PAPEIS[p], selected: p === (f.area === 'obra' ? 'obra' : 'administrador'), disabled: p === 'admin' && eu.papel !== 'admin' })));
    $('cc-senha').value = gerarSenha();
    $('cc-mensagem').textContent = '';
    $('d-criar-conta').showModal();
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('cc-gerar').addEventListener('click', () => { $('cc-senha').value = gerarSenha(); });
    $('cc-utilizador').addEventListener('input', (e) => {
      e.target.value = e.target.value.toLowerCase().replace(/\s/g, '');
      if (!fichaConta.email) $('cc-email').value = `${e.target.value}@${DOMINIO_INTERNO}`;
    });
    $('f-criar-conta').addEventListener('submit', async (ev) => {
      if (!ev.submitter || ev.submitter.value !== 'ok') return;
      ev.preventDefault();
      const corpo = { acao: 'criar', colaborador_id: fichaConta.id, nome: fichaConta.nome, utilizador: $('cc-utilizador').value.trim(),
        email: $('cc-email').value.trim(), papel: $('cc-papel').value, senha: $('cc-senha').value };
      try {
        const { data: r, error } = await sb.functions.invoke('gerir-contas', { body: corpo });
        if (error) { let t = 'Não foi possível criar a conta.'; try { t = (await error.context.json()).erro || t; } catch (_) {} throw new Error(t); }
        $('d-criar-conta').close();
        await mostrar('colaboradores/' + fichaConta.id, eu);
        const m = el('p', { class: 'mensagem ok', text: `Conta criada. Utilizador: ${corpo.utilizador} · Palavra-passe: ${corpo.senha}${r && r.aviso ? ' · ' + r.aviso : ''}` });
        $('colab-equipa').insertBefore(m, $('colab-equipa').children[2]);
      } catch (e) { $('cc-mensagem').textContent = e.message; }
    });
  });

  // ---------- alertas para o Início ----------
  async function alertas() {
    const { data, error } = await sb.from('colaboradores').select('id, nome, carta_validade, cc_validade, aptidao_validade');
    if (error) return [];
    return data.flatMap((f) => alertasDe(f).map((a) => ({ id: f.id, nome: f.nome, documento: a.nome, estado: a.estado, data: a.data })))
      .sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  }

  window.ColaboradoresHub = { mostrar, alertas, AREAS };
})();
