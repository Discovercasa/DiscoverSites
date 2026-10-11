// Código comum às páginas do Hub: sessão, cabeçalho com separadores e utilitários.
(function () {
  const sb = window.PlataformaCore && PlataformaCore.cliente;
  const PAPEIS = (window.PlataformaCore && PlataformaCore.papeis) || {};

  const $ = (id) => document.getElementById(id);

  function el(tag, props = {}, filhos = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else if (v !== false && v != null) e.setAttribute(k, v);
    }
    for (const f of [].concat(filhos)) if (f != null && f !== false) e.append(f);
    return e;
  }

  const ehGestor = (eu) => !!eu && ['admin', 'administrador'].includes(eu.papel);

  async function perfilAtual() {
    if (!sb) return null;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    const { data, error } = await sb.from('profiles').select('nome, utilizador, papel, ativo').eq('id', user.id).single();
    if (error || !data || !data.ativo) return null;
    const { data: ficha } = await sb.rpc('minha_ficha_id');
    return { id: user.id, ...data, ficha: ficha || null };
  }

  function separadores(eu) {
    return [
      { id: 'inicio', nome: 'Início', href: '/' },
      { id: 'obras', nome: 'Obras', href: '/obras' },
      { id: 'checklist', nome: 'Checklist', href: '/checklist' },
      !ehGestor(eu) && eu && eu.ficha && { id: 'ferias', nome: 'As minhas férias', href: '/ferias' },
      ehGestor(eu) && { id: 'materiais', nome: 'Materiais', href: '/materiais' },
      ehGestor(eu) && { id: 'colaboradores', nome: 'Colaboradores', href: '/colaboradores' },
      ehGestor(eu) && { id: 'controlo', nome: 'Controlo', href: '/controlo' },
      { id: 'novidades', nome: 'Novidades', href: '/novidades' }
    ].filter(Boolean);
  }

  function desenharTopo(eu, ativa) {
    const topo = $('topo');
    topo.replaceChildren(el('button', { class: 'voltar-fixo', id: 'voltar-fixo', type: 'button', title: 'Voltar à página anterior', 'aria-label': 'Voltar à página anterior', text: '← Voltar', onclick: voltar }),
      el('div', { class: 'topo-linha' }, [
      el('a', { class: 'topo-logo', href: '/' }, el('img', { src: '/img/logo.png', alt: 'Discovercasa — início' })),
      el('nav', { class: 'abas', 'aria-label': 'Separadores' },
        separadores(eu).map((s) => el('a', { href: s.href, 'data-aba': s.id, text: s.nome }))),
      el('div', { class: 'quem' }, [
        `${eu.nome || eu.utilizador} · ${PAPEIS[eu.papel] || eu.papel}`, el('br'),
        el('button', { type: 'button', text: 'Sair', onclick: sair })
      ])
    ]));
    marcarAba(ativa);
    atualizarVoltar();
  }

  function marcarAba(ativa) {
    document.querySelectorAll('nav.abas a').forEach((a) =>
      a.dataset.aba === ativa ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  }

  async function sair() {
    await sb.auth.signOut();
    location.href = '/';
  }

  function gerarSenha() {
    const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from(crypto.getRandomValues(new Uint32Array(10)), (x) => letras[x % letras.length]).join('');
  }

  // ---------- Memória do dia: onde se estava em cada separador, filtros, posição na página ----------
  // No mesmo dia volta-se exatamente ao mesmo sítio; noutro dia tudo recomeça do início.
  const HOJE = new Date().toLocaleDateString('sv'); // AAAA-MM-DD (hora local)
  let mem = null;
  try { mem = JSON.parse(localStorage.getItem('hub.memoria') || 'null'); } catch (_) {}
  const diaNovo = !mem || mem.dia !== HOJE;
  if (diaNovo) {
    mem = { dia: HOJE, seccoes: {}, scroll: {}, estado: {} };
    try { for (const k of Object.keys(localStorage)) if (/^hub\.(obra|fase)$/.test(k)) localStorage.removeItem(k); } catch (_) {}
  }
  let tGuardar = 0;
  function guardarMem() { clearTimeout(tGuardar); tGuardar = setTimeout(() => { try { localStorage.setItem('hub.memoria', JSON.stringify(mem)); } catch (_) {} }, 150); }
  // estado de cada área (filtros, pesquisa, vista…)
  function lembrar(chave, valor) { mem.estado[chave] = valor; guardarMem(); }
  function recordar(chave, padrao) { return chave in mem.estado ? mem.estado[chave] : padrao; }

  function guardar(chave, valor) { try { localStorage.setItem('hub.' + chave, valor); } catch (_) {} }
  function ler(chave) { try { return localStorage.getItem('hub.' + chave); } catch (_) { return null; } }

  // ---------- Endereços sem "#": /obras/<id>/pedidos ----------
  // Ligações antigas com "#" (ex.: /#obras/...) passam para o formato novo.
  if (/^#[a-z]/.test(location.hash)) history.replaceState(null, '', '/' + location.hash.slice(1));
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  function rota() {
    const p = decodeURIComponent(location.pathname.replace(/^\/+|\/+$/g, ''));
    return !p || p === 'index.html' ? 'inicio' : p;
  }
  function ir(destino, substituir = false) {
    const url = '/' + (destino === 'inicio' ? '' : destino.replace(/^\/+/, ''));
    // marca as entradas criadas pelo Hub, para o botão "Voltar" saber se há página anterior no Hub
    if (url !== location.pathname) history[substituir ? 'replaceState' : 'pushState']({ hub: true, n: substituir ? (history.state && history.state.n) || 0 : ((history.state && history.state.n) || 0) + 1 }, '', url);
    window.dispatchEvent(new Event('rota'));
  }
  const seccaoDe = (r) => r.split('/')[0];
  // Regista a rota atual da secção (para voltar lá ao carregar no separador)
  function registarRota(r) { mem.seccoes[seccaoDe(r)] = r; mem.ultima = r; guardarMem(); }
  // Posição na página por rota
  window.addEventListener('scroll', () => { mem.scroll[rota()] = Math.round(window.scrollY); guardarMem(); }, { passive: true });
  // Repõe a posição guardada quando a página já tem altura suficiente (o conteúdo chega aos poucos)
  function reporScroll(r) {
    const alvo = mem.scroll[r] || 0;
    if (!alvo) { window.scrollTo(0, 0); return; }
    const inicio = Date.now();
    (function tentar() {
      if (rota() !== r) return;
      if (document.documentElement.scrollHeight - window.innerHeight >= alvo || Date.now() - inicio > 2500) window.scrollTo(0, alvo);
      else requestAnimationFrame(tentar);
    })();
  }
  // Ao abrir no mesmo dia sem rota (só "/"), volta à última página em que se estava
  if (!diaNovo && rota() === 'inicio' && mem.ultima && mem.ultima !== 'inicio') history.replaceState(null, '', '/' + mem.ultima);
  // Ligações internas (href="/...") mudam de separador sem recarregar a página
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest && ev.target.closest('a[href]');
    if (!a || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || a.target) return;
    const href = a.getAttribute('href');
    if (!href.startsWith('/') || href.startsWith('//')) return;
    ev.preventDefault();
    let destino = href.slice(1) || 'inicio';
    // Separador do topo de outra secção → volta onde se estava nessa secção
    if (a.closest('nav.abas') && seccaoDe(destino) !== seccaoDe(rota()) && mem.seccoes[seccaoDe(destino)]) destino = mem.seccoes[seccaoDe(destino)];
    ir(destino);
  });
  window.addEventListener('popstate', () => window.dispatchEvent(new Event('rota')));
  // "Voltar": página anterior (como o browser); se não houver nenhuma no Hub, vai para o Início
  function voltar() { if (history.state && history.state.n > 0) history.back(); else ir('inicio'); }
  function atualizarVoltar() { const b = $('voltar-fixo'); if (b) b.hidden = rota() === 'inicio' && !(history.state && history.state.n > 0); }
  window.addEventListener('rota', atualizarVoltar);

  window.Hub = { sb, PAPEIS, $, el, ehGestor, perfilAtual, separadores, desenharTopo, marcarAba, sair, gerarSenha, guardar, ler, rota, ir, lembrar, recordar, registarRota, reporScroll };
})();
