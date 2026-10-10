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
      (ehGestor(eu) || (eu && eu.ficha)) && { id: 'ferias', nome: 'Férias', href: '/ferias' },
      ehGestor(eu) && { id: 'colaboradores', nome: 'Colaboradores', href: '/colaboradores' },
      { id: 'novidades', nome: 'Novidades', href: '/novidades' }
    ].filter(Boolean);
  }

  function desenharTopo(eu, ativa) {
    const topo = $('topo');
    topo.replaceChildren(el('div', { class: 'topo-linha' }, [
      el('a', { class: 'topo-logo', href: '/' }, el('img', { src: '/img/logo.png', alt: 'Discovercasa — início' })),
      el('nav', { class: 'abas', 'aria-label': 'Separadores' },
        separadores(eu).map((s) => el('a', { href: s.href, 'data-aba': s.id, text: s.nome }))),
      el('div', { class: 'quem' }, [
        `${eu.nome || eu.utilizador} · ${PAPEIS[eu.papel] || eu.papel}`, el('br'),
        el('button', { type: 'button', text: 'Sair', onclick: sair })
      ])
    ]));
    marcarAba(ativa);
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

  function guardar(chave, valor) { try { localStorage.setItem('hub.' + chave, valor); } catch (_) {} }
  function ler(chave) { try { return localStorage.getItem('hub.' + chave); } catch (_) { return null; } }

  // ---------- Endereços sem "#": /obras/<id>/pedidos ----------
  // Ligações antigas com "#" (ex.: /#obras/...) passam para o formato novo.
  if (/^#[a-z]/.test(location.hash)) history.replaceState(null, '', '/' + location.hash.slice(1));

  function rota() {
    const p = decodeURIComponent(location.pathname.replace(/^\/+|\/+$/g, ''));
    return !p || p === 'index.html' ? 'inicio' : p;
  }
  function ir(destino, substituir = false) {
    const url = '/' + (destino === 'inicio' ? '' : destino.replace(/^\/+/, ''));
    if (url !== location.pathname) history[substituir ? 'replaceState' : 'pushState'](null, '', url);
    window.dispatchEvent(new Event('rota'));
  }
  // Ligações internas (href="/...") mudam de separador sem recarregar a página
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest && ev.target.closest('a[href]');
    if (!a || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || a.target) return;
    const href = a.getAttribute('href');
    if (!href.startsWith('/') || href.startsWith('//')) return;
    ev.preventDefault();
    ir(href.slice(1) || 'inicio');
  });
  window.addEventListener('popstate', () => window.dispatchEvent(new Event('rota')));

  window.Hub = { sb, PAPEIS, $, el, ehGestor, perfilAtual, separadores, desenharTopo, marcarAba, sair, gerarSenha, guardar, ler, rota, ir };
})();
