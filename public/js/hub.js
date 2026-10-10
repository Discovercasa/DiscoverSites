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
    return { id: user.id, ...data };
  }

  function separadores(eu) {
    return [
      { id: 'inicio', nome: 'Início', href: '/#inicio' },
      { id: 'obras', nome: 'Obras', href: '/#obras' },
      { id: 'checklist', nome: 'Checklist', href: '/#checklist' },
      ehGestor(eu) && { id: 'colaboradores', nome: 'Colaboradores', href: '/#colaboradores' },
      { id: 'novidades', nome: 'Novidades', href: '/#novidades' }
    ].filter(Boolean);
  }

  function desenharTopo(eu, ativa) {
    const topo = $('topo');
    topo.replaceChildren(el('div', { class: 'topo-linha' }, [
      el('a', { class: 'topo-logo', href: '/#inicio' }, el('img', { src: '/img/logo.png', alt: 'Discovercasa — início' })),
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

  window.Hub = { sb, PAPEIS, $, el, ehGestor, perfilAtual, separadores, desenharTopo, marcarAba, sair, gerarSenha, guardar, ler };
})();
