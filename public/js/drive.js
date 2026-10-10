// Abas Documentos e Fotos da obra, ligadas ao Google Drive (através da função "drive").
// Quem vê cada pasta decide-se no Hub; ninguém precisa de conta Google.
(function () {
  const { sb, $, el, PAPEIS } = Hub;
  const AREAS = { documentos: { aba: 'documentos', nome: 'Documentos' }, fotografias: { aba: 'fotos', nome: 'Fotos' } };
  const PAPEIS_RESTRINGIVEIS = ['obra', 'subempreiteiro', 'cliente'];
  let pessoas = null;

  async function chamar(corpo) {
    const { data, error } = await sb.functions.invoke('drive', { body: corpo });
    if (error) { let t = 'Erro no Google Drive.'; try { t = (await error.context.json()).erro || t; } catch (_) {} throw new Error(t); }
    return data;
  }
  // Pedidos que devolvem ficheiros (miniaturas, descarregar)
  async function binario(corpo) {
    const { data: { session } } = await sb.auth.getSession();
    const r = await fetch(`${PlataformaCore.url}/functions/v1/drive`, {
      method: 'POST', body: JSON.stringify(corpo),
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: PlataformaCore.chave, 'Content-Type': 'application/json' }
    });
    if (!r.ok) { let t = 'Não foi possível obter o ficheiro.'; try { t = (await r.json()).erro || t; } catch (_) {} throw new Error(t); }
    return r;
  }

  const tamanho = (b) => { b = +b || 0; return b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : b < 1073741824 ? `${(b / 1048576).toFixed(1)} MB` : `${(b / 1073741824).toFixed(2)} GB`; };
  const dataPT = (s) => new Date(s).toLocaleDateString('pt-PT');
  const ehVideo = (f) => f.mimeType.startsWith('video/');
  const restricao = (p) => {
    const t = (p.vis_papeis || []).map((x) => PAPEIS[x] || x).concat((p.vis_utilizadores || []).map((id) => (pessoas || []).find((x) => x.id === id)?.nome || '?'));
    return t.length ? el('span', { class: 'etiqueta', title: 'Visível só para', text: '👁 ' + t.join(', ') }) : null;
  };

  // ---------- memória das listas (mostra logo o que já se viu; atualiza em segundo plano) ----------
  const chaveLista = (obraId, area, pastaId) => `hub.drive.${obraId}.${pastaId || area}`;
  function lerLista(chave) { try { const v = localStorage.getItem(chave); return v ? JSON.parse(v) : null; } catch (_) { return null; } }
  function guardarLista(chave, d) { try { localStorage.setItem(chave, JSON.stringify(d)); } catch (_) {} }
  const emCurso = new Map(); // pedidos de lista em curso (evita repetir o mesmo pedido)
  function pedirLista(obraId, area, pastaId) {
    const chave = chaveLista(obraId, area, pastaId);
    if (!emCurso.has(chave)) {
      emCurso.set(chave, chamar(pastaId ? { acao: 'listar', pasta_id: pastaId } : { acao: 'listar', obra_id: obraId, area })
        .then((d) => { guardarLista(chave, d); guardarLista(chaveLista(obraId, area, d.pasta.id), d); return d; })
        .finally(() => emCurso.delete(chave)));
    }
    return emCurso.get(chave);
  }

  // ---------- miniaturas: memória → Cache do browser → servidor (12 de cada vez) ----------
  const miniaturas = new Map(); // id@data → URL do blob
  const CACHE = 'hub-miniaturas-v1';
  const chaveMini = (f) => `/miniatura/${f.id}?v=${encodeURIComponent(f.modifiedTime || '')}`;
  let pendentes = [], aPedir = false;
  async function pedirMiniatura(f, pastaId, img) {
    const k = chaveMini(f);
    if (miniaturas.has(k)) { img.src = miniaturas.get(k); return; }
    try {
      const c = await caches.open(CACHE); const r = await c.match(k);
      if (r) { const url = URL.createObjectURL(await r.blob()); miniaturas.set(k, url); img.src = url; return; }
    } catch (_) {}
    pendentes.push({ f, pastaId, img, k });
    if (!aPedir) { aPedir = true; setTimeout(esvaziar, 0); }
  }
  async function esvaziar() {
    while (pendentes.length) {
      const pasta = pendentes[0].pastaId;
      const lote = pendentes.filter((p) => p.pastaId === pasta).slice(0, 12);
      pendentes = pendentes.filter((p) => !lote.includes(p));
      const lotes = [lote];
      // até 2 lotes em paralelo
      if (pendentes.length) { const p2 = pendentes[0].pastaId; const l2 = pendentes.filter((p) => p.pastaId === p2).slice(0, 12); pendentes = pendentes.filter((p) => !l2.includes(p)); lotes.push(l2); }
      await Promise.all(lotes.map(async (l) => {
        try {
          const { miniaturas: m } = await chamar({ acao: 'miniaturas', pasta_id: l[0].pastaId, ids: l.map((p) => p.f.id) });
          let c = null; try { c = await caches.open(CACHE); } catch (_) {}
          for (const p of l) {
            const dados = m[p.f.id];
            if (!dados) { p.img.closest('.miniatura')?.classList.add('sem-miniatura'); continue; }
            const blob = await (await fetch(dados)).blob();
            const url = URL.createObjectURL(blob); miniaturas.set(p.k, url);
            document.querySelectorAll(`img[data-mini="${CSS.escape(p.k)}"]`).forEach((i) => { i.src = url; });
            if (c) c.put(p.k, new Response(blob, { headers: { 'Content-Type': blob.type } })).catch(() => {});
          }
        } catch (_) { l.forEach((p) => p.img.closest('.miniatura')?.classList.add('sem-miniatura')); }
      }));
    }
    aPedir = false;
  }

  async function descarregar(f, botao) {
    const texto = botao && botao.textContent; if (botao) { botao.disabled = true; botao.textContent = 'A descarregar…'; }
    try {
      const r = await binario({ acao: 'descarregar', ficheiro_id: f.id });
      const url = URL.createObjectURL(await r.blob());
      const a = el('a', { href: url, download: f.mimeType.startsWith('application/vnd.google-apps') ? f.name + '.pdf' : f.name });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { alert(e.message); }
    finally { if (botao) { botao.disabled = false; botao.textContent = texto; } }
  }

  async function ver(f) {
    const d = $('d-ver'), c = $('dv-conteudo');
    $('dv-titulo').textContent = f.name;
    c.replaceChildren(el('p', { class: 'carregar', text: 'A carregar…' }));
    $('dv-descarregar').onclick = (ev) => descarregar(f, ev.target);
    d.showModal();
    try {
      const r = await binario({ acao: 'descarregar', ficheiro_id: f.id });
      const url = URL.createObjectURL(await r.blob());
      c.replaceChildren(ehVideo(f) ? el('video', { src: url, controls: true, autoplay: true, playsinline: true }) : el('img', { src: url, alt: f.name }));
      d.addEventListener('close', () => URL.revokeObjectURL(url), { once: true });
    } catch (e) { c.replaceChildren(el('p', { class: 'mensagem erro', text: e.message })); }
  }

  // ---------- mostrar uma pasta ----------
  let vistaAtual = 0;
  async function mostrar(o, alvo, eu, area, pastaId) {
    const gestor = Hub.ehGestor(eu);
    const base = `/obras/${o.id}/${AREAS[area].aba}`;
    const vista = ++vistaAtual;
    const chave = chaveLista(o.id, area, pastaId);
    const guardada = lerLista(chave);

    // 1) Desenha já: com a lista guardada, ou só a barra (as permissões sabem-se sem perguntar ao servidor)
    const provisoria = guardada || {
      pasta: { id: pastaId, nome: AREAS[area].nome, area, vis_papeis: [], vis_utilizadores: [] },
      caminho: [{ id: pastaId, nome: AREAS[area].nome }], subpastas: [], ficheiros: [], aCarregar: true,
      pode_carregar: area === 'fotografias' || gestor || eu.papel === 'obra', pode_gerir: gestor
    };
    desenhar(o, alvo, eu, area, provisoria, base);
    if (gestor && pessoas === null) sb.rpc('listar_pessoas').then(({ data }) => { pessoas = data || []; });

    // 2) Atualiza em segundo plano e só redesenha se algo mudou
    try {
      const d = await pedirLista(o.id, area, pastaId);
      if (vista !== vistaAtual) return;
      if (!guardada || JSON.stringify(guardada) !== JSON.stringify(d)) desenhar(o, alvo, eu, area, d, base);
    } catch (e) {
      if (vista !== vistaAtual) return;
      if (guardada) return; // fica a lista guardada; o erro não impede de ver
      alvo.replaceChildren(el('div', { class: 'vazio' }, [e.message, gestor && /não está ligado/.test(e.message) ? el('p', {}, el('a', { href: '/obras', text: 'Ligar o Google Drive na página Obras' })) : null].filter(Boolean)));
    }
  }

  // Ao abrir uma obra, prepara as listas de Documentos e Fotos (e "acorda" o servidor)
  function preparar(o) {
    for (const area of ['documentos', 'fotografias']) pedirLista(o.id, area, null).catch(() => {});
  }

  function desenhar(o, alvo, eu, area, d, base) {
    const fotos = area === 'fotografias';
    const nivelTopo = d.caminho.length <= 1;
    const recarregar = () => {
      try { localStorage.removeItem(chaveLista(o.id, area, d.pasta.id)); if (nivelTopo) localStorage.removeItem(chaveLista(o.id, area, null)); } catch (_) {}
      return mostrar(o, alvo, eu, area, d.pasta.id);
    };

    const migalhas = el('nav', { class: 'migalhas', 'aria-label': 'Pastas' }, d.caminho.flatMap((p, i) => [
      i ? el('span', { text: ' / ' }) : null,
      i === d.caminho.length - 1 ? el('strong', { text: i === 0 ? AREAS[area].nome : p.nome }) : el('a', { href: i === 0 ? base : `${base}/${p.id}`, text: i === 0 ? AREAS[area].nome : p.nome })
    ]).filter(Boolean));

    const entrada = el('input', { type: 'file', multiple: true, hidden: true, accept: fotos ? 'image/*,video/*' : '' });
    entrada.addEventListener('change', () => carregar([...entrada.files], d.pasta.id, progresso, recarregar));
    const progresso = el('div', { class: 'progresso-envio' });

    const barra = el('div', { class: 'barra-drive' }, [
      migalhas, el('span', { class: 'espaco' }),
      restricao(d.pasta),
      d.pode_carregar ? el('button', { class: 'botao pequeno', type: 'button', text: fotos ? '+ Fotos ou vídeos' : '+ Carregar ficheiros', disabled: !!d.aCarregar, onclick: () => entrada.click() }) : null,
      d.pode_gerir ? el('button', { class: 'botao secundario pequeno', type: 'button', text: '+ Pasta', disabled: !!d.aCarregar, onclick: () => novaPasta(d.pasta.id, recarregar) }) : null,
      d.pode_gerir && !d.aCarregar ? el('button', { class: 'botao secundario pequeno', type: 'button', text: 'Quem vê', onclick: () => abrirVisibilidade(d.pasta, recarregar) }) : null,
      d.pode_gerir && !nivelTopo && !d.aCarregar ? el('button', { class: 'botao perigo pequeno', type: 'button', text: 'Apagar pasta', onclick: async () => {
        if (!confirm(`Apagar a pasta "${d.pasta.nome}" e tudo o que está dentro?\n\nVai para o lixo da Google Drive (pode ser recuperada lá durante 30 dias).`)) return;
        const nivelPai = d.caminho.length - 2, pai = d.caminho[nivelPai];
        try { await chamar({ acao: 'apagar_pasta', pasta_id: d.pasta.id }); Hub.ir((nivelPai === 0 ? base : `${base}/${pai.id}`).slice(1)); }
        catch (e) { alert(e.message); }
      } }) : null,
      entrada
    ].filter(Boolean));

    const pastas = d.subpastas.length ? el('div', { class: 'grelha-pastas' }, d.subpastas.map((p) =>
      el('a', { class: 'pasta', href: `${base}/${p.id}` }, [el('span', { class: 'icone', 'aria-hidden': 'true', text: '📁' }), el('span', { class: 'nome', text: p.nome }), restricao(p)]))) : null;

    const apagarFicheiro = (f) => async () => {
      if (!confirm(`Apagar "${f.name}"?\n\nVai para o lixo da Google Drive (pode ser recuperado lá durante 30 dias).`)) return;
      try { await chamar({ acao: 'apagar_ficheiro', ficheiro_id: f.id }); await recarregar(); } catch (e) { alert(e.message); }
    };

    let ficheiros;
    if (d.aCarregar) ficheiros = el('p', { class: 'ajuda a-carregar', text: fotos ? 'A carregar fotos…' : 'A carregar documentos…' });
    else if (!d.ficheiros.length) ficheiros = el('p', { class: 'ajuda', text: d.subpastas.length ? 'Sem ficheiros nesta pasta.' : (fotos ? 'Ainda sem fotos nem vídeos.' : 'Ainda sem documentos.') });
    else if (fotos) {
      ficheiros = el('div', { class: 'grelha-fotos' }, d.ficheiros.map((f) => {
        const img = el('img', { alt: f.name, 'data-mini': chaveMini(f) });
        if (f.hasThumbnail) pedirMiniatura(f, d.pasta.id, img);
        return el('figure', { class: 'miniatura' + (f.hasThumbnail ? '' : ' sem-miniatura') }, [
          el('button', { type: 'button', class: 'abrir', title: f.name, onclick: () => ver(f) }, [img, ehVideo(f) ? el('span', { class: 'play', text: '▶' }) : null]),
          el('figcaption', {}, [el('span', { text: dataPT(f.modifiedTime) }),
            d.pode_gerir ? el('button', { type: 'button', class: 'apagar', title: 'Apagar', 'aria-label': 'Apagar ' + f.name, text: '✕', onclick: apagarFicheiro(f) }) : null])
        ]);
      }));
    } else {
      ficheiros = el('div', { class: 'tabela-envolvente' }, el('table', { class: 'ficheiros' }, [
        el('thead', {}, el('tr', {}, ['Nome', 'Tamanho', 'Alterado', ''].map((t) => el('th', { text: t })))),
        el('tbody', {}, d.ficheiros.map((f) => el('tr', {}, [
          el('td', {}, [f.iconLink ? el('img', { src: f.iconLink, alt: '', class: 'icone-tipo' }) : null, f.name]),
          el('td', { text: f.size ? tamanho(f.size) : '—' }), el('td', { text: dataPT(f.modifiedTime) }),
          el('td', {}, el('div', { class: 'acoes' }, [
            el('button', { class: 'botao secundario pequeno', type: 'button', text: 'Descarregar', onclick: (ev) => descarregar(f, ev.target) }),
            d.pode_gerir ? el('button', { class: 'botao perigo pequeno', type: 'button', text: 'Apagar', onclick: apagarFicheiro(f) }) : null
          ].filter(Boolean)))
        ])))
      ]));
    }
    alvo.replaceChildren(...[barra, progresso, pastas, ficheiros].filter(Boolean));
  }

  // ---------- carregar (direto do browser para a Drive) ----------
  async function carregar(lista, pastaId, progresso, aoTerminar) {
    if (!lista.length) return;
    for (const f of lista) {
      const linha = el('div', { class: 'envio' }, [el('span', { class: 'nome', text: f.name }), el('progress', { max: 100, value: 0 }), el('span', { class: 'pct', text: '0%' })]);
      progresso.append(linha);
      try {
        const { url } = await chamar({ acao: 'iniciar_carregamento', pasta_id: pastaId, nome: f.name, tipo: f.type || 'application/octet-stream', tamanho: f.size });
        await new Promise((ok, falha) => {
          const x = new XMLHttpRequest();
          x.open('PUT', url);
          x.setRequestHeader('Content-Type', f.type || 'application/octet-stream');
          x.upload.onprogress = (e) => { if (e.lengthComputable) { const p = Math.round((e.loaded / e.total) * 100); linha.querySelector('progress').value = p; linha.querySelector('.pct').textContent = p + '%'; } };
          x.onload = () => (x.status >= 200 && x.status < 300 ? ok() : falha(new Error('O envio falhou.')));
          x.onerror = () => falha(new Error('O envio falhou (ligação).'));
          x.send(f);
        });
        linha.querySelector('.pct').textContent = '✓';
      } catch (e) { linha.classList.add('falhou'); linha.querySelector('.pct').textContent = e.message; }
    }
    if (![...progresso.querySelectorAll('.envio')].some((l) => l.classList.contains('falhou'))) await aoTerminar();
  }

  async function novaPasta(paiId, aoCriar) {
    const nome = prompt('Nome da nova pasta:');
    if (!nome || !nome.trim()) return;
    try { await chamar({ acao: 'criar_pasta', pasta_id: paiId, nome: nome.trim() }); await aoCriar(); } catch (e) { alert(e.message); }
  }

  // ---------- quem vê a pasta ----------
  let pastaVis = null;
  function abrirVisibilidade(p, aoGuardar) {
    pastaVis = { p, aoGuardar };
    $('dpv-nome').textContent = p.nome;
    const caixas = (c, lista, sel) => c.replaceChildren(...lista.map(([v, t]) => el('label', {}, [el('input', { type: 'checkbox', value: v, checked: sel.includes(v) }), t])));
    caixas($('dpv-papeis'), PAPEIS_RESTRINGIVEIS.map((x) => [x, PAPEIS[x]]), p.vis_papeis || []);
    caixas($('dpv-pessoas'), (pessoas || []).filter((x) => !['admin', 'administrador'].includes(x.papel)).map((x) => [x.id, x.nome || x.utilizador]), p.vis_utilizadores || []);
    $('dpv-mensagem').textContent = '';
    $('d-pasta-vis').showModal();
  }

  // ---------- estado da ligação (página Obras) ----------
  async function estado() { return chamar({ acao: 'estado' }); }
  async function ligar() { const { url } = await chamar({ acao: 'ligar_url' }); location.href = url; }
  async function prepararObra(obraId) { return chamar({ acao: 'preparar_obra', obra_id: obraId }); }

  document.addEventListener('DOMContentLoaded', () => {
    $('f-pasta-vis').addEventListener('submit', async (ev) => {
      if (!ev.submitter || ev.submitter.value !== 'ok') return;
      ev.preventDefault();
      const marcados = (c) => [...$(c).querySelectorAll('input:checked')].map((x) => x.value);
      const { error } = await sb.from('drive_pastas').update({ vis_papeis: marcados('dpv-papeis'), vis_utilizadores: marcados('dpv-pessoas') }).eq('id', pastaVis.p.id);
      if (error) { $('dpv-mensagem').textContent = 'Não foi possível guardar.'; return; }
      $('d-pasta-vis').close(); await pastaVis.aoGuardar();
    });
  });

  // ---------- escolher uma fotografia da obra (para a capa) ----------
  async function escolherFoto(o, contentor, aoEscolher, pastaId = null) {
    try {
      const d = await pedirLista(o.id, 'fotografias', pastaId);
      const imagens = d.ficheiros.filter((f) => f.mimeType.startsWith('image/'));
      contentor.replaceChildren(...[
        d.caminho.length > 1 ? el('button', { class: 'botao secundario pequeno', type: 'button', text: '← ' + d.caminho[d.caminho.length - 2].nome,
          onclick: () => escolherFoto(o, contentor, aoEscolher, d.caminho.length > 2 ? d.caminho[d.caminho.length - 2].id : null) }) : null,
        d.subpastas.length ? el('div', { class: 'grelha-pastas' }, d.subpastas.map((p) => el('button', { class: 'pasta', type: 'button', onclick: () => escolherFoto(o, contentor, aoEscolher, p.id) },
          [el('span', { class: 'icone', text: '📁' }), el('span', { class: 'nome', text: p.nome })]))) : null,
        imagens.length ? el('div', { class: 'grelha-fotos' }, imagens.map((f) => {
          const img = el('img', { alt: f.name, 'data-mini': chaveMini(f) });
          if (f.hasThumbnail) pedirMiniatura(f, d.pasta.id, img);
          return el('figure', { class: 'miniatura' }, el('button', { type: 'button', class: 'abrir', title: 'Usar como capa', onclick: () => aoEscolher(f) }, img));
        })) : el('p', { class: 'ajuda', text: 'Não há fotografias nesta pasta.' })
      ].filter(Boolean));
    } catch (e) { contentor.replaceChildren(el('p', { class: 'ajuda', text: e.message })); }
  }
  const capaDaDrive = (obraId, ficheiroId) => chamar({ acao: 'capa_da_drive', obra_id: obraId, ficheiro_id: ficheiroId });

  window.ObraDrive = { mostrar, estado, ligar, prepararObra, preparar, escolherFoto, capaDaDrive };
})();
