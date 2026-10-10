// Leitura do Excel "Valores de material" (folha "Geral Materiais") para importar no Hub.
// Funciona no browser (window.LerMateriais) e em Node (para os testes).
(function (raiz) {
  const COL = { material: 0, nomenclatura: 1, dimensoes: 2, detalhes: 3, preco: 4, unidade: 5, desconto: 6, iva: 8, pagamento: 10,
    empresa: 11, sede: 12, armazens: 13, transporte: 14, transportePago: 15, disponibilidade: 16, prazo: 17, contacto: 19, telefone: 20, email: 21, data: 22, obs: 23 };
  const ERROS = /^#(NAME\?|REF!|N\/A|VALUE!|DIV\/0!)$/;

  const limpo = (v) => {
    if (v == null) return null;
    if (typeof v === 'string') { v = v.trim(); if (!v || ERROS.test(v) || v === '0' || v === '-') return null; }
    return v;
  };
  const texto = (v) => { v = limpo(v); return v == null ? null : String(v).trim(); };
  const numero = (v) => { v = limpo(v); if (v == null) return null; const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };
  const fracao = (v) => { const n = numero(v); if (n == null) return null; return n > 1 ? n / 100 : n; }; // 35 ou 0,35 → 0,35
  function data(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'number') { const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000); return d.toISOString().slice(0, 10); } // número de série do Excel
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/) || String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    return m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  const UNIDADES = { un: 'un', und: 'un', unid: 'un', ml: 'ml', m2: 'm2', 'm²': 'm2', m3: 'm3', 'm³': 'm3', cx: 'cx', caixa: 'cx', kg: 'kg', tonelada: 't', ton: 't', t: 't', l: 'L', lt: 'L' };
  const unidade = (v) => { const t = texto(v); if (!t) return null; return UNIDADES[t.toLowerCase()] || t; };

  // Dimensões / quantidade num só campo: "3/0,11/0,075" → C/L/A (metros); "25kg", "100ml" → quantidade; número → depende da unidade
  function medidas(bruto, un, designacao) {
    const r = { comprimento: null, largura: null, espessura: null, qtd_embalagem: null, qtd_unidade: null, resto: null };
    const t = texto(bruto);
    if (!t) return r;
    const s = t.replace(/\s+/g, '').replace(/,/g, '.').replace(/mm$/i, '');
    // "3/0.11/0.075" ou "8000x1200x100": valores acima de 30 são milímetros; "015" quer dizer 0,15
    // a granel (m³, t, kg) com duas medidas é granulometria (ex.: brita 11/22), não dimensões
    if (['m3', 't', 'kg'].includes(un) && /^\d+(\.\d+)?[\/x×]\d+(\.\d+)?$/i.test(s)) { r.resto = t; return r; }
    if (/^\d+(\.\d+)?([\/x×]\d+(\.\d+)?){1,2}$/i.test(s)) {
      const metros = (p) => { let n = /^0\d+$/.test(p) ? Number('0.' + p.slice(1)) : Number(p); if (n > 30) n = n / 1000; return Math.round(n * 10000) / 10000 || null; };
      const [c, l, a] = s.split(/[\/x×]/i).map(metros);
      Object.assign(r, { comprimento: c, largura: l ?? null, espessura: a ?? null });
      return r;
    }
    const m = s.match(/^(\d+(?:\.\d+)?)(kg|ml|m2|m3|un|l|lt|m|t)?$/i);
    if (m) {
      const n = Number(m[1]), suf = (m[2] || '').toLowerCase();
      if (suf) { r.qtd_embalagem = n; r.qtd_unidade = suf === 'm' ? 'ml' : (UNIDADES[suf] || suf); return r; }
      if (!Number.isInteger(n)) { r.resto = t; return r; }                     // número decimal sem unidade: não é claro
      if (un === 'cx') { r.qtd_embalagem = n; r.qtd_unidade = 'un'; return r; }
      if (un === 'ml') { r.qtd_embalagem = n; r.qtd_unidade = 'ml'; return r; }
      if (un === 'un' && n <= 12 && /metro|\bmt\b|\d\s?m\b/i.test(designacao || '')) { r.comprimento = n; return r; }
      r.resto = t; return r;
    }
    r.resto = t;
    return r;
  }
  const TRANSPORTE = { sim: 'sim', 'não': 'nao', nao: 'nao', 'por definir': 'por_definir' };
  const INCLUIDO = { sim: 'sim', 'não': 'nao', nao: 'nao' };
  const PAGAMENTO = { 'conta corrente': 'conta_corrente', 'pronto pagamento': 'pronto_pagamento', 'antes do levantamento': 'antes_levantamento' };

  // linhas: matriz da folha (1.ª linha = cabeçalho). Devolve { precos, fornecedores, ignoradas }
  function ler(linhas) {
    const precos = [], fornecedores = new Map(), ignoradas = [];
    linhas.slice(1).forEach((l, i) => {
      if (!l || !texto(l[COL.material])) return;
      const empresa = texto(l[COL.empresa]), preco = numero(l[COL.preco]);
      const designacao = texto(l[COL.material]), nome = texto(l[COL.nomenclatura]) || designacao;
      if (!empresa || preco == null || preco <= 0) { ignoradas.push({ linha: i + 2, designacao, motivo: !empresa ? 'sem fornecedor' : 'sem preço' }); return; }
      const un = unidade(l[COL.unidade]);
      const md = medidas(l[COL.dimensoes], un, designacao);
      const tp = texto(l[COL.transportePago]);
      const detalhes = [texto(l[COL.detalhes]), md.resto ? `Medidas (Excel): ${md.resto}` : null].filter(Boolean).join(' · ') || null;
      precos.push({
        linha: i + 2, material: nome, fornecedor: empresa, designacao, detalhes, preco, unidade: un,
        desconto: Math.min(fracao(l[COL.desconto]) || 0, 0.99), iva: fracao(l[COL.iva]) ?? 0.23,
        comprimento: md.comprimento, largura: md.largura, espessura: md.espessura, qtd_embalagem: md.qtd_embalagem, qtd_unidade: md.qtd_unidade,
        transporte: TRANSPORTE[(texto(l[COL.transporte]) || '').toLowerCase()] || null,
        transporte_incluido: tp ? (INCLUIDO[tp.toLowerCase()] || (/m[ií]nima/i.test(tp) ? 'qtd_minima' : null)) : null,
        disponibilidade: { imediata: 'imediata', encomenda: 'encomenda' }[(texto(l[COL.disponibilidade]) || '').toLowerCase()] || null,
        prazo_dias: Number.isInteger(numero(l[COL.prazo])) ? numero(l[COL.prazo]) : null,
        data_atualizacao: data(l[COL.data]), observacoes: texto(l[COL.obs])
      });
      if (!fornecedores.has(empresa.toLowerCase())) fornecedores.set(empresa.toLowerCase(), { nome: empresa });
      const f = fornecedores.get(empresa.toLowerCase());
      const preencher = (campo, valor) => { if (f[campo] == null && valor != null) f[campo] = valor; };
      preencher('sede', texto(l[COL.sede])); preencher('armazens', texto(l[COL.armazens]));
      preencher('pagamento', PAGAMENTO[(texto(l[COL.pagamento]) || '').toLowerCase()] || null);
      preencher('contacto_nome', texto(l[COL.contacto])); preencher('contacto_telefone', texto(l[COL.telefone])); preencher('contacto_email', texto(l[COL.email]));
    });
    // a mesma linha (fornecedor + nome no fornecedor) repetida: fica a mais recente
    const unicos = new Map();
    for (const p of precos) {
      const k = `${p.fornecedor.toLowerCase()}|${p.designacao.toLowerCase()}`;
      const ja = unicos.get(k);
      if (!ja || (p.data_atualizacao || '') >= (ja.data_atualizacao || '')) unicos.set(k, p);
    }
    return { precos: [...unicos.values()], repetidas: precos.length - unicos.size, fornecedores: [...fornecedores.values()], ignoradas };
  }

  const api = { ler, medidas };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else raiz.LerMateriais = api;
})(typeof window !== 'undefined' ? window : globalThis);
