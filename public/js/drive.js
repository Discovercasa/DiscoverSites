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

  // Miniaturas: carregadas aos poucos (no máximo 4 de cada vez)
  let fila = [], ativos = 0;
  function pedirMiniatura(ficheiroId, img) {
    fila.push({ ficheiroId, img }); proxima();
  }
  async function proxima() {
    if (ativos >= 4 || !fila.length) return;
    const { ficheiroId, img } = fila.shift(); ativos++;
    try { const r = await binario({ acao: 'miniatura', ficheiro_id: ficheiroId }); img.src = URL.createObjectURL(await r.blob()); }
    catch (_) { img.closest('.miniatura')?.classList.add('sem-miniatura'); }
    finally { ativos--; proxima(); }
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
  async function mostrar(o, alvo, eu, area, pastaId) {
    const gestor = Hub.ehGestor(eu);
    const base = `/obras/${o.id}/${AREAS[area].aba}`;
    alvo.replaceChildren(el('p', { class: 'carregar', text: 'A carregar…' }));
    fila = [];
    try {
      if (gestor && pessoas === null) pessoas = (await sb.rpc('listar_pessoas')).data || [];
      if (!pastaId) {
        let { id } = await chamar({ acao: 'raiz_area', obra_id: o.id, area });
        if (!id && gestor) id = (await chamar({ acao: 'preparar_obra', obra_id: o.id }))[area];
        if (!id) { alvo.replaceChildren(el('div', { class: 'vazio', text: 'As pastas desta obra ainda não foram criadas na Google Drive. Peça a um ADMIN ou Administrador para abrir esta aba.' })); return; }
        pastaId = id;
      }
      const d = await chamar({ acao: 'listar', pasta_id: pastaId });
      desenhar(o, alvo, eu, area, d, base);
    } catch (e) {
      alvo.replaceChildren(el('div', { class: 'vazio' }, [e.message, gestor && /não está ligado/.test(e.message) ? el('p', {}, el('a', { href: '/obras', text: 'Ligar o Google Drive na página Obras' })) : null]));
    }
  }

  function desenhar(o, alvo, eu, area, d, base) {
    const fotos = area === 'fotografias';
    const recarregar = () => mostrar(o, alvo, eu, area, d.pasta.id);
    const nivelTopo = d.caminho.length <= 1;

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
      d.pode_carregar ? el('button', { class: 'botao pequeno', type: 'button', text: fotos ? '+ Fotos ou vídeos' : '+ Carregar ficheiros', onclick: () => entrada.click() }) : null,
      d.pode_gerir ? el('button', { class: 'botao secundario pequeno', type: 'button', text: '+ Pasta', onclick: () => novaPasta(d.pasta.id, recarregar) }) : null,
      d.pode_gerir ? el('button', { class: 'botao secundario pequeno', type: 'button', text: 'Quem vê', onclick: () => abrirVisibilidade(d.pasta, recarregar) }) : null,
      d.pode_gerir && !nivelTopo ? el('button', { class: 'botao perigo pequeno', type: 'button', text: 'Apagar pasta', onclick: async () => {
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
    if (!d.ficheiros.length) ficheiros = el('p', { class: 'ajuda', text: d.subpastas.length ? 'Sem ficheiros nesta pasta.' : (fotos ? 'Ainda sem fotos nem vídeos.' : 'Ainda sem documentos.') });
    else if (fotos) {
      ficheiros = el('div', { class: 'grelha-fotos' }, d.ficheiros.map((f) => {
        const img = el('img', { alt: f.name, loading: 'lazy' });
        if (f.hasThumbnail) pedirMiniatura(f.id, img);
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

  window.ObraDrive = { mostrar, estado, ligar, prepararObra };
})();
