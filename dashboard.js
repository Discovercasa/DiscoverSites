const SUPABASE_URL = "https://swpqelomnbmytwoppccb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3cHFlbG9tbmJteXR3b3BwY2NiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzMjc5OTcsImV4cCI6MjEwNTkwMzk5N30.lVVpzaL21oak28tjnsHhzfi6ABWe3IrHU40RCxwx0sk";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- Estado ----------
let me = null;
let profile = null;
let isAdmin = false;
let isSuper = false;
let obras = [];
let obraAtual = null;
let acessoCompleto = false; // false = só vê itens partilhados diretamente
let meusItensPartilhados = []; // ids partilhados diretamente comigo (quando acessoCompleto=false)

let fases = [];
let items = [];
let status = new Map(); // item_id -> item_status
let responsaveis = new Map(); // item_id -> { user_id, texto, nome }
let ignorados = new Map(); // item_id -> item_ignorados
let nomes = new Map(); // user_id -> nome
let membros = [];

let editMode = false;
const collapsed = new Set(JSON.parse(localStorage.getItem("collapsed") || "[]"));
const filtros = { busca: "", estado: "todos", fase: "", resp: "", meus: false };

let dragItem = null;
let itemShareAlvo = null;
let respAlvo = null;

const $ = (id) => document.getElementById(id);

// ---------- Utilitários ----------
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function btn(cls, text, onclick, title) {
  const b = el("button", cls, text);
  b.type = "button";
  if (title) b.title = title;
  b.addEventListener("click", (ev) => {
    ev.stopPropagation();
    onclick(ev, b);
  });
  return b;
}

async function run(promise) {
  const { data, error } = await promise;
  if (error) {
    console.error(error);
    alert("Erro: " + error.message);
    throw error;
  }
  return data;
}

function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch (e) {}
}

function saveCollapsed() {
  localStorage.setItem("collapsed", JSON.stringify([...collapsed]));
}

function fmtData(iso) {
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
function fmtDia(iso) {
  return new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function normaliza(s) {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const byOrdem = (a, b) => a.ordem - b.ordem || a.created_at.localeCompare(b.created_at);
const todosIrmaos = (faseId, parentId) =>
  items.filter((i) => i.fase_id === faseId && (i.parent_id || null) === (parentId || null)).sort(byOrdem);
const filhos = (id) => items.filter((i) => i.parent_id === id);
const item = (id) => items.find((i) => i.id === id);

function ancestrais(it) {
  const r = [];
  let p = it.parent_id ? item(it.parent_id) : null;
  while (p) { r.unshift(p); p = p.parent_id ? item(p.parent_id) : null; }
  return r;
}
function descendentes(id) {
  const r = [];
  const stack = filhos(id);
  while (stack.length) {
    const it = stack.pop();
    r.push(it);
    stack.push(...filhos(it.id));
  }
  return r;
}

function respLabel(id) {
  const r = responsaveis.get(id);
  if (!r) return null;
  return r.user_id ? r.nome || "Conta sem nome" : r.texto;
}

// ---------- Menu flutuante (só usado no menu do projeto) ----------
function closeMenu() {
  const p = $("popup");
  if (p) p.remove();
}
function showMenu(anchor, options) {
  closeMenu();
  const m = el("div", "popup");
  m.id = "popup";
  options.filter(Boolean).forEach((o) => {
    m.appendChild(btn(o.danger ? "danger" : "", o.label, () => { closeMenu(); o.fn(); }));
  });
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  m.style.top = window.scrollY + r.bottom + 4 + "px";
  const left = window.scrollX + r.right - m.offsetWidth;
  m.style.left = Math.max(8, Math.min(left, window.innerWidth - m.offsetWidth - 8)) + "px";
}
document.addEventListener("click", (e) => { if (!e.target.closest(".popup")) closeMenu(); });

// ---------- Carregar dados ----------
async function loadProfile() {
  let p = await run(supabaseClient.from("profiles").select("*").eq("id", me.id).maybeSingle());
  if (!p) {
    p = await run(supabaseClient.from("profiles").insert({ id: me.id, nome: me.email.split("@")[0] }).select().single());
  }
  profile = p;
  isAdmin = p.role === "admin" || p.role === "super_admin";
  isSuper = p.role === "super_admin";
  applyTheme(profile.dark_mode);
}

async function loadObras() {
  obras = await run(supabaseClient.from("obras").select("id, nome, criado_por").order("nome"));
}

async function loadObraData() {
  fases = await run(supabaseClient.from("fases").select("*").order("ordem"));
  items = await run(supabaseClient.from("items").select("*"));

  acessoCompleto = isAdmin;
  meusItensPartilhados = [];
  if (obraAtual && !isAdmin) {
    const minha = await run(
      supabaseClient.from("obra_membros").select("user_id").eq("obra_id", obraAtual.id).eq("user_id", me.id).maybeSingle()
    );
    acessoCompleto = !!minha;
    if (!acessoCompleto) {
      const ps = await run(
        supabaseClient.from("item_partilhas").select("item_id").eq("obra_id", obraAtual.id).eq("user_id", me.id)
      );
      meusItensPartilhados = ps.map((p) => p.item_id);
    }
  }

  const st = obraAtual ? await run(supabaseClient.from("item_status").select("*").eq("obra_id", obraAtual.id)) : [];
  status = new Map(st.map((s) => [s.item_id, s]));

  const rs = obraAtual ? await run(supabaseClient.from("item_responsaveis").select("*").eq("obra_id", obraAtual.id)) : [];
  const ig = obraAtual ? await run(supabaseClient.from("item_ignorados").select("*").eq("obra_id", obraAtual.id)) : [];
  ignorados = new Map(ig.map((i) => [i.item_id, i]));

  membros = obraAtual && isAdmin ? await run(supabaseClient.rpc("listar_membros", { p_obra: obraAtual.id })) : [];

  const pids = [...new Set([...st.map((s) => s.concluido_por), ...rs.filter((r) => r.user_id).map((r) => r.user_id)])];
  const ps = pids.length ? await run(supabaseClient.from("profiles").select("id, nome").in("id", pids)) : [];
  nomes = new Map(ps.map((p) => [p.id, p.nome || "Sem nome"]));
  nomes.set(me.id, profile.nome || me.email.split("@")[0]);

  responsaveis = new Map(rs.map((r) => [r.item_id, { ...r, nome: r.user_id ? nomes.get(r.user_id) : null }]));
}

async function criarObra(nome) {
  const obra = await run(supabaseClient.from("obras").insert({ nome }).select().single());
  await loadObras();
  return obra;
}

async function selecionarObra(id) {
  obraAtual = obras.find((o) => o.id === id) || obras[0] || null;
  if (obraAtual) localStorage.setItem("obraAtual", obraAtual.id);
  editMode = false;
  limparFiltros();
  await loadObraData();
  renderTopbar();
  renderFiltrosSelects();
  render();
}

// ---------- Ordem / mover ----------
async function gravarOrdem(lista, tabela) {
  await Promise.all(
    lista.map((x, i) => {
      if (x.ordem === i) return null;
      return run(supabaseClient.from(tabela).update({ ordem: i }).eq("id", x.id)).then(() => { x.ordem = i; });
    })
  );
}

async function reordenarFase(f, dir) {
  const lista = [...fases].sort(byOrdem);
  const i = lista.findIndex((x) => x.id === f.id);
  const j = i + dir;
  if (j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  await gravarOrdem(lista, "fases");
  fases = lista;
  render();
}

async function reordenarItem(it, dir) {
  const sibs = todosIrmaos(it.fase_id, it.parent_id);
  const i = sibs.findIndex((s) => s.id === it.id);
  const j = i + dir;
  if (j < 0 || j >= sibs.length) return;
  [sibs[i], sibs[j]] = [sibs[j], sibs[i]];
  await gravarOrdem(sibs, "items");
  render();
}

async function moverParaDentro(it, novoParentId) {
  if (it.id === novoParentId) return;
  if ([it.id, ...descendentes(it.id).map((d) => d.id)].includes(novoParentId)) return; // não pode entrar em si mesmo
  const alvo = item(novoParentId);
  await run(supabaseClient.from("items").update({ fase_id: alvo.fase_id, parent_id: novoParentId }).eq("id", it.id));
  it.parent_id = novoParentId;
  it.fase_id = alvo.fase_id;
  const sibs = todosIrmaos(it.fase_id, novoParentId);
  await gravarOrdem(sibs, "items");
  if (collapsed.has(novoParentId)) { collapsed.delete(novoParentId); saveCollapsed(); }
  render();
}

// ---------- Ações: itens ----------
async function addItem(faseId, parentId, tipo, afterId) {
  const txt = prompt(tipo === "titulo" ? "Nome do título (grupo):" : "Nome do item:");
  if (!txt || !txt.trim()) return;
  const sibs = todosIrmaos(faseId, parentId);
  const idx = afterId ? sibs.findIndex((s) => s.id === afterId) + 1 : sibs.length;
  const novo = await run(
    supabaseClient.from("items").insert({ fase_id: faseId, parent_id: parentId || null, titulo: txt.trim(), tipo, ordem: idx }).select().single()
  );
  items.push(novo);
  sibs.splice(idx, 0, novo);
  await gravarOrdem(sibs, "items");
  if (parentId && collapsed.has(parentId)) { collapsed.delete(parentId); saveCollapsed(); }
  render();
}

async function renomearItem(it) {
  const txt = prompt("Novo nome:", it.titulo);
  if (!txt || !txt.trim() || txt.trim() === it.titulo) return;
  await run(supabaseClient.from("items").update({ titulo: txt.trim() }).eq("id", it.id));
  it.titulo = txt.trim();
  render();
}

async function apagarItem(it) {
  const extra = filhos(it.id).length ? " Os sub-itens também serão apagados." : "";
  if (!confirm(`Apagar "${it.titulo}"?${extra} Isto aplica-se a todos os projetos.`)) return;
  await run(supabaseClient.from("items").delete().eq("id", it.id));
  await loadObraData();
  render();
}

async function marcar(it, checked) {
  try {
    if (checked) {
      const row = { obra_id: obraAtual.id, item_id: it.id, concluido: true, concluido_em: new Date().toISOString(), concluido_por: me.id };
      await run(supabaseClient.from("item_status").upsert(row));
      status.set(it.id, row);
    } else {
      await run(supabaseClient.from("item_status").delete().eq("obra_id", obraAtual.id).eq("item_id", it.id));
      status.delete(it.id);
    }
  } catch (e) {}
  render();
}

async function ignorarItem(it) {
  if (!confirm(`Ignorar "${it.titulo}" neste projeto? Fica escondido até reativares no modo editar.`)) return;
  const row = { obra_id: obraAtual.id, item_id: it.id, ignorado_por: me.id, ignorado_em: new Date().toISOString() };
  await run(supabaseClient.from("item_ignorados").upsert(row));
  ignorados.set(it.id, row);
  render();
}

async function reativarItem(it) {
  await run(supabaseClient.from("item_ignorados").delete().eq("obra_id", obraAtual.id).eq("item_id", it.id));
  ignorados.delete(it.id);
  render();
}

// ---------- Ações: fases ----------
async function addFase() {
  const txt = prompt("Nome da nova fase:");
  if (!txt || !txt.trim()) return;
  const nova = await run(supabaseClient.from("fases").insert({ titulo: txt.trim(), ordem: fases.length }).select().single());
  fases.push(nova);
  renderFiltrosSelects();
  render();
}
async function renomearFase(f) {
  const txt = prompt("Novo nome da fase:", f.titulo);
  if (!txt || !txt.trim() || txt.trim() === f.titulo) return;
  await run(supabaseClient.from("fases").update({ titulo: txt.trim() }).eq("id", f.id));
  f.titulo = txt.trim();
  renderFiltrosSelects();
  render();
}
async function apagarFase(f) {
  if (!confirm(`Apagar a fase "${f.titulo}" e todos os seus itens? Isto aplica-se a todos os projetos.`)) return;
  await run(supabaseClient.from("fases").delete().eq("id", f.id));
  await loadObraData();
  renderFiltrosSelects();
  render();
}

// ---------- Responsável ----------
function abrirResponsavel(it) {
  respAlvo = it;
  const r = responsaveis.get(it.id);
  $("resp-nome").textContent = `Item: ${it.titulo}`;
  $("resp-conta").value = "";
  $("resp-texto").value = r && !r.user_id ? r.texto : "";
  $("resp-modal").classList.remove("hidden");
}
async function guardarResponsavel() {
  const email = $("resp-conta").value.trim();
  const texto = $("resp-texto").value.trim();
  if (!email && !texto) { alert("Preenche o email ou o texto."); return; }
  const res = await run(supabaseClient.rpc("definir_responsavel", { p_obra: obraAtual.id, p_item: respAlvo.id, p_email: email || null, p_texto: texto || null }));
  if (res === "sem_conta") { alert("Não existe nenhuma conta com esse email."); return; }
  await loadObraData();
  $("resp-modal").classList.add("hidden");
  render();
}
async function removerResponsavel() {
  await run(supabaseClient.from("item_responsaveis").delete().eq("obra_id", obraAtual.id).eq("item_id", respAlvo.id));
  responsaveis.delete(respAlvo.id);
  $("resp-modal").classList.add("hidden");
  renderFiltrosSelects();
  render();
}

// ---------- Partilha de item ----------
function abrirPartilhaItem(it) {
  itemShareAlvo = it;
  $("item-share-nome").textContent = `Item: ${it.titulo}`;
  $("item-share-email").value = "";
  $("item-share-msg").textContent = "";
  carregarPartilhasItem();
  $("item-share-modal").classList.remove("hidden");
}
async function carregarPartilhasItem() {
  const list = $("item-share-list");
  list.innerHTML = "A carregar…";
  try {
    const rows = await run(supabaseClient.rpc("listar_partilhas_item", { p_obra: obraAtual.id, p_item: itemShareAlvo.id }));
    list.innerHTML = "";
    if (!rows.length) list.appendChild(el("p", "hint", "Ainda não partilhaste este item com ninguém."));
    rows.forEach((r) => {
      const row = el("div", "share-row");
      row.appendChild(el("span", "", r.email + (r.nome ? ` (${r.nome})` : "")));
      row.appendChild(btn("btn-link", "Remover", async () => {
        await run(supabaseClient.from("item_partilhas").delete().eq("obra_id", obraAtual.id).eq("item_id", itemShareAlvo.id).eq("user_id", r.user_id));
        carregarPartilhasItem();
      }));
      list.appendChild(row);
    });
  } catch (e) { list.innerHTML = ""; }
}
async function partilharItem() {
  const email = $("item-share-email").value.trim();
  if (!email) return;
  const res = await run(supabaseClient.rpc("partilhar_item", { p_obra_id: obraAtual.id, p_item_id: itemShareAlvo.id, p_email: email }));
  if (res === "sem_conta") { $("item-share-msg").textContent = "Essa pessoa ainda não tem conta neste site."; return; }
  $("item-share-email").value = "";
  $("item-share-msg").textContent = "Partilhado.";
  carregarPartilhasItem();
}

// ---------- Filtros / pesquisa ----------
function limparFiltros() {
  filtros.busca = ""; filtros.estado = "todos"; filtros.fase = ""; filtros.resp = ""; filtros.meus = false;
  $("busca") && ($("busca").value = "");
  $("filtro-estado") && ($("filtro-estado").value = "todos");
  $("filtro-fase") && ($("filtro-fase").value = "");
  $("filtro-resp") && ($("filtro-resp").value = "");
  $("filtro-meus") && $("filtro-meus").classList.remove("active");
  atualizarBotaoLimpar();
}
function filtrosAtivos() {
  return !!(filtros.busca || filtros.estado !== "todos" || filtros.fase || filtros.resp || filtros.meus);
}
function atualizarBotaoLimpar() {
  $("filtro-limpar").classList.toggle("hidden", !filtrosAtivos());
}
function renderFiltrosSelects() {
  const fSel = $("filtro-fase");
  const val = fSel.value;
  fSel.innerHTML = '<option value="">Todas as fases</option>';
  [...fases].sort(byOrdem).forEach((f) => {
    const o = el("option", "", f.titulo);
    o.value = f.id;
    fSel.appendChild(o);
  });
  fSel.value = val;

  const rSel = $("filtro-resp");
  const rVal = rSel.value;
  const vistos = new Set();
  rSel.innerHTML = '<option value="">Todos os responsáveis</option>';
  responsaveis.forEach((r) => {
    const label = respLabelFrom(r);
    const key = r.user_id || "t:" + r.texto;
    if (!label || vistos.has(key)) return;
    vistos.add(key);
    const o = el("option", "", label);
    o.value = key;
    rSel.appendChild(o);
  });
  rSel.value = rVal;
}
function respLabelFrom(r) { return r.user_id ? r.nome || "Conta sem nome" : r.texto; }
function respKey(id) {
  const r = responsaveis.get(id);
  if (!r) return null;
  return r.user_id || "t:" + r.texto;
}

// Devolve o conjunto de ids de itens que passam nos filtros diretamente (sem contar contexto de antepassados)
function calcularCorrespondencias() {
  const q = normaliza(filtros.busca);
  const set = new Set();
  items.forEach((it) => {
    if (it.tipo !== "item") return;
    if (ignorados.has(it.id) && !editMode) return;
    if (q && !normaliza(it.titulo).includes(q)) return;
    if (filtros.estado === "pendentes" && status.has(it.id)) return;
    if (filtros.estado === "feitos" && !status.has(it.id)) return;
    if (filtros.fase && it.fase_id !== filtros.fase) return;
    if (filtros.resp && respKey(it.id) !== filtros.resp) return;
    if (filtros.meus && respKey(it.id) !== me.id && !responsaveisSouEu(it.id)) return;
    set.add(it.id);
  });
  return set;
}
function responsaveisSouEu(id) {
  const r = responsaveis.get(id);
  return !!(r && r.user_id === me.id);
}

// ---------- Renderização ----------
function renderTopbar() {
  const papel = isSuper ? " · Super admin" : isAdmin ? " · Admin" : "";
  $("ola").textContent = "Olá, " + (profile.nome || me.email) + papel;

  const sel = $("obra-select");
  sel.innerHTML = "";
  obras.forEach((o) => {
    const opt = el("option", "", o.nome);
    opt.value = o.id;
    sel.appendChild(opt);
  });
  sel.classList.toggle("hidden", !obras.length);
  if (obraAtual) sel.value = obraAtual.id;

  $("btn-novo-projeto").classList.toggle("hidden", !isAdmin);
  $("btn-editar").classList.toggle("hidden", !isAdmin || !obraAtual);
  $("btn-editar").textContent = editMode ? "✓ Concluir edição" : "✎ Editar";
  $("btn-editar").classList.toggle("btn-primary", editMode);
  $("btn-editar").classList.toggle("btn-secondary", !editMode);
  $("btn-projeto-menu").classList.toggle("hidden", !isAdmin || !obraAtual);
  $("tabs-main").classList.toggle("hidden", !isSuper);
  $("filtros-bar").classList.toggle("hidden", !obraAtual);
}

function acoesItem(it) {
  const wrap = el("div", "edit-actions");
  wrap.appendChild(btn("", "➕", () => addItem(it.fase_id, it.parent_id, "item", it.id), "Item abaixo"));
  wrap.appendChild(btn("", "📑", () => addItem(it.fase_id, it.parent_id, "titulo", it.id), "Título abaixo"));
  wrap.appendChild(btn("", "↳➕", () => addItem(it.fase_id, it.id, "item"), "Sub-item"));
  wrap.appendChild(btn("", "✎", () => renomearItem(it), "Renomear"));
  wrap.appendChild(btn("", "👤", () => abrirResponsavel(it), "Responsável"));
  wrap.appendChild(btn("", "🔗", () => abrirPartilhaItem(it), "Partilhar este item"));
  if (ignorados.has(it.id)) {
    wrap.appendChild(btn("", "♻", () => reativarItem(it), "Reativar"));
  } else {
    wrap.appendChild(btn("", "🚫", () => ignorarItem(it), "Ignorar nesta obra"));
  }
  wrap.appendChild(btn("danger", "🗑", () => apagarItem(it), "Apagar (todos os projetos)"));
  return wrap;
}

function tornarArrastavel(row, it) {
  if (!editMode) return;
  const handle = el("span", "drag-handle", "⠿");
  handle.draggable = true;
  handle.addEventListener("dragstart", (e) => {
    dragItem = it;
    row.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  handle.addEventListener("dragend", () => { row.classList.remove("dragging"); dragItem = null; });
  row.prepend(handle);

  row.addEventListener("dragover", (e) => {
    if (!dragItem || dragItem.id === it.id) return;
    e.preventDefault();
    row.classList.add("drop-target");
  });
  row.addEventListener("dragleave", () => row.classList.remove("drop-target"));
  row.addEventListener("drop", (e) => {
    e.preventDefault();
    row.classList.remove("drop-target");
    if (!dragItem || dragItem.id === it.id) return;
    moverParaDentro(dragItem, it.id);
  });
}

function passaNosFiltros(id, matches, mostrarTudo) {
  if (mostrarTudo) return true;
  if (matches.has(id)) return true;
  return descendentes(id).some((d) => matches.has(d.id));
}

function renderItem(it, matches, mostrarTudo) {
  if (!passaNosFiltros(it.id, matches, mostrarTudo)) return null;
  const ignorado = ignorados.has(it.id);
  if (ignorado && !editMode) return null;

  const wrap = el("div", "item");
  const row = el("div", "item-row" + (ignorado ? " ignorado" : ""));
  const kids = filhos(it.id);
  const forcarAberto = filtros.busca || filtros.fase || filtros.resp || filtros.meus || filtros.estado !== "todos";
  const aberto = forcarAberto ? true : !collapsed.has(it.id);

  const chev = btn("chev-btn" + (kids.length ? "" : " placeholder"), aberto ? "▾" : "▸", () => {
    if (aberto) collapsed.add(it.id); else collapsed.delete(it.id);
    saveCollapsed();
    render();
  });
  row.appendChild(chev);

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = status.has(it.id);
  cb.disabled = ignorado;
  cb.addEventListener("change", () => marcar(it, cb.checked));
  row.appendChild(cb);

  const text = el("div", "item-text");
  text.appendChild(el("span", "item-title" + (cb.checked ? " done" : ""), it.titulo));
  const s = status.get(it.id);
  if (s) text.appendChild(el("span", "item-meta", `✓ ${nomes.get(s.concluido_por) || "Alguém"} · ${fmtData(s.concluido_em)}`));
  const rl = respLabel(it.id);
  if (rl) text.appendChild(el("span", "tag-resp", "👤 " + rl));
  if (kids.length) {
    const kf = kids.filter((k) => k.tipo === "item" && !ignorados.has(k.id));
    const feitos = kf.filter((k) => status.has(k.id)).length;
    if (kf.length) text.appendChild(el("span", "item-count", `${feitos}/${kf.length} sub-itens`));
  }
  row.appendChild(text);

  if (editMode) row.appendChild(acoesItem(it));

  wrap.appendChild(row);
  tornarArrastavel(row, it);

  if (kids.length && aberto) {
    const sub = el("div", "sub");
    renderLista(sub, it.fase_id, it.id, matches, mostrarTudo);
    wrap.appendChild(sub);
  }
  return wrap;
}

function renderTitulo(it, matches, mostrarTudo) {
  if (!passaNosFiltros(it.id, matches, mostrarTudo)) return null;
  const t = el("div", "grupo-titulo");
  t.appendChild(el("span", "", it.titulo));
  if (editMode) t.appendChild(acoesItem(it));
  return t;
}

function renderLista(parentEl, faseId, parentId, matches, mostrarTudo) {
  todosIrmaos(faseId, parentId).forEach((it) => {
    const node = it.tipo === "titulo" ? renderTitulo(it, matches, mostrarTudo) : renderItem(it, matches, mostrarTudo);
    if (node) parentEl.appendChild(node);
  });
}

function renderFase(f, matches, mostrarTudo) {
  const todosDaFase = items.filter((i) => i.fase_id === f.id);
  const algumVisivel = mostrarTudo || todosDaFase.some((i) => matches.has(i.id));
  if (!algumVisivel) return null;

  const forcarAberto = filtros.busca || filtros.fase || filtros.resp || filtros.meus || filtros.estado !== "todos";
  const aberta = forcarAberto ? true : !collapsed.has(f.id);
  const card = el("section", "fase-card" + (aberta ? " open" : ""));

  const head = el("div", "fase-head");
  const toggle = btn("fase-toggle", "", () => {
    if (aberta) collapsed.add(f.id); else collapsed.delete(f.id);
    saveCollapsed();
    render();
  });
  toggle.appendChild(el("span", "chev", "▸"));
  toggle.appendChild(el("span", "fase-title", f.titulo));
  head.appendChild(toggle);

  const todos = todosDaFase.filter((i) => i.tipo === "item" && !ignorados.has(i.id));
  const feitos = todos.filter((i) => status.has(i.id)).length;
  head.appendChild(el("span", "fase-progress", `${feitos}/${todos.length}`));

  if (editMode) {
    const acoes = el("div", "edit-actions");
    acoes.appendChild(btn("", "➕", () => addItem(f.id, null, "item"), "Item"));
    acoes.appendChild(btn("", "📑", () => addItem(f.id, null, "titulo"), "Título"));
    acoes.appendChild(btn("", "✎", () => renomearFase(f), "Renomear fase"));
    acoes.appendChild(btn("", "▲", () => reordenarFase(f, -1), "Mover para cima"));
    acoes.appendChild(btn("", "▼", () => reordenarFase(f, 1), "Mover para baixo"));
    acoes.appendChild(btn("danger", "🗑", () => apagarFase(f), "Apagar fase (todos os projetos)"));
    head.appendChild(acoes);
  }
  card.appendChild(head);

  const body = el("div", "fase-body");
  renderLista(body, f.id, null, matches, mostrarTudo);
  card.appendChild(body);
  return card;
}

function renderVistaParcial() {
  const c = $("fases-container");
  c.innerHTML = "";
  if (!meusItensPartilhados.length) {
    c.appendChild(el("p", "empty", "Ainda não tens nenhum item partilhado contigo neste projeto."));
    return;
  }
  meusItensPartilhados.forEach((id) => {
    const it = item(id);
    if (!it) return;
    const card = el("div", "item-partilhado-card");
    const caminho = [...ancestrais(it), it].map((x) => x.titulo).join(" › ");
    card.appendChild(el("div", "breadcrumb", caminho));
    const box = el("div", "");
    const node = it.tipo === "titulo" ? renderTitulo(it, new Set(), true) : renderItem(it, new Set(), true);
    if (node) box.appendChild(node);
    card.appendChild(box);
    c.appendChild(card);
  });
}

function render() {
  atualizarBotaoLimpar();
  if (!obraAtual) {
    const c = $("fases-container");
    c.innerHTML = "";
    c.appendChild(el("p", "empty", isAdmin ? "Ainda não há projetos. Cria o primeiro com “+ Projeto”." : "Ainda não tens acesso a nenhum projeto. Pede a um administrador."));
    return;
  }
  if (!acessoCompleto) { renderVistaParcial(); return; }

  const c = $("fases-container");
  c.innerHTML = "";
  const temFiltros = filtrosAtivos();
  const matches = temFiltros ? calcularCorrespondencias() : new Set();
  [...fases].sort(byOrdem).forEach((f) => {
    const node = renderFase(f, matches, !temFiltros);
    if (node) c.appendChild(node);
  });
  if (editMode) c.appendChild(btn("btn-ghost btn-add-fase", "+ Nova fase", addFase));
}

// ---------- Definições ----------
function abrirDefinicoes() {
  $("set-nome").value = profile.nome || "";
  $("set-email").textContent = me.email;
  $("set-dark").checked = profile.dark_mode;
  $("settings-modal").classList.remove("hidden");
}
function fecharDefinicoes() {
  applyTheme(profile.dark_mode);
  $("settings-modal").classList.add("hidden");
}
async function guardarDefinicoes() {
  const nome = $("set-nome").value.trim() || me.email.split("@")[0];
  const dark = $("set-dark").checked;
  await run(supabaseClient.from("profiles").update({ nome, dark_mode: dark }).eq("id", me.id));
  profile.nome = nome; profile.dark_mode = dark; nomes.set(me.id, nome);
  applyTheme(dark);
  $("settings-modal").classList.add("hidden");
  renderTopbar();
  render();
}

// ---------- Acesso ao projeto ----------
function renderPartilha() {
  const list = $("share-list");
  list.innerHTML = "";
  list.appendChild(el("p", "hint", "Os admins veem sempre todos os projetos. Isto dá acesso total ao projeto (todos os itens)."));
  membros.forEach((m) => {
    const row = el("div", "share-row");
    row.appendChild(el("span", "", m.email + (m.nome ? ` (${m.nome})` : "")));
    row.appendChild(btn("btn-link", "Remover", async () => {
      if (!confirm(`Remover ${m.email} deste projeto?`)) return;
      try {
        await run(supabaseClient.from("obra_membros").delete().eq("obra_id", obraAtual.id).eq("user_id", m.user_id));
        await loadObraData();
        renderPartilha();
      } catch (e) {}
    }));
    list.appendChild(row);
  });
  $("share-msg").textContent = "";
}
async function convidar() {
  const email = $("share-email").value.trim();
  if (!email) return;
  const res = await run(supabaseClient.rpc("convidar_membro", { p_obra_id: obraAtual.id, p_email: email }));
  if (res === "sem_conta") { $("share-msg").textContent = "Essa pessoa ainda não tem conta. Pede-lhe para se registar primeiro."; return; }
  $("share-email").value = "";
  await loadObraData();
  renderPartilha();
  $("share-msg").textContent = "Pessoa adicionada ao projeto.";
}

// ---------- Projetos ----------
async function novoProjeto() {
  const nome = prompt("Nome do novo projeto:");
  if (!nome || !nome.trim()) return;
  const obra = await criarObra(nome.trim());
  await selecionarObra(obra.id);
}
async function renomearProjeto() {
  const nome = prompt("Novo nome do projeto:", obraAtual.nome);
  if (!nome || !nome.trim() || nome.trim() === obraAtual.nome) return;
  await run(supabaseClient.from("obras").update({ nome: nome.trim() }).eq("id", obraAtual.id));
  await loadObras();
  await selecionarObra(obraAtual.id);
}
async function apagarProjeto() {
  if (!confirm(`Apagar o projeto "${obraAtual.nome}" e todos os seus checks? Não dá para desfazer.`)) return;
  await run(supabaseClient.from("obras").delete().eq("id", obraAtual.id));
  await loadObras();
  await selecionarObra(obras[0] && obras[0].id);
}

// ---------- Gestão de contas ----------
async function carregarGestao() {
  const box = $("gestao-lista");
  box.textContent = "A carregar…";
  let lista;
  try { lista = await run(supabaseClient.rpc("listar_utilizadores")); } catch (e) { box.textContent = ""; return; }
  box.innerHTML = "";
  lista.forEach((u) => {
    const row = el("div", "gestao-row");
    const info = el("div", "gestao-info");
    info.appendChild(el("span", "gestao-email", u.email));
    info.appendChild(el("span", "gestao-sub", (u.nome ? u.nome + " · " : "") + "conta criada em " + fmtDia(u.criado_em)));
    row.appendChild(info);
    const label = u.role === "super_admin" ? "Super admin" : u.role === "admin" ? "Admin" : "Utilizador";
    row.appendChild(el("span", "badge" + (u.role !== "utilizador" ? " badge-on" : ""), label));
    if (u.role !== "super_admin") {
      const tornar = u.role !== "admin";
      row.appendChild(btn("btn-secondary", tornar ? "Tornar admin" : "Remover admin", async () => {
        const acao = tornar ? "Dar permissões de admin a" : "Retirar permissões de admin a";
        if (!confirm(`${acao} ${u.email}?`)) return;
        try { await run(supabaseClient.rpc("definir_role", { p_user: u.id, p_role: tornar ? "admin" : "utilizador" })); carregarGestao(); } catch (e) {}
      }));
    }
    box.appendChild(row);
  });
}
function mostrarVista(v) {
  $("view-projetos").classList.toggle("hidden", v !== "projetos");
  $("view-gestao").classList.toggle("hidden", v !== "gestao");
  document.querySelectorAll(".nav-tab").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
  if (v === "gestao") carregarGestao();
}

// ---------- Arranque ----------
async function init() {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) { window.location.href = "index.html"; return; }
  me = data.session.user;
  await loadProfile();
  await loadObras();
  const guardada = localStorage.getItem("obraAtual");
  obraAtual = obras.find((o) => o.id === guardada) || obras[0] || null;
  await loadObraData();
  renderTopbar();
  renderFiltrosSelects();
  render();
}

$("obra-select").addEventListener("change", (e) => selecionarObra(e.target.value));
$("btn-novo-projeto").addEventListener("click", () => novoProjeto().catch(() => {}));
$("btn-editar").addEventListener("click", () => { editMode = !editMode; renderTopbar(); render(); });
$("btn-projeto-menu").addEventListener("click", (e) => {
  e.stopPropagation();
  showMenu(e.currentTarget, [
    { label: "Quem tem acesso…", fn: () => { renderPartilha(); $("share-modal").classList.remove("hidden"); } },
    { label: "Renomear projeto", fn: () => renomearProjeto().catch(() => {}) },
    { label: "Apagar projeto", danger: true, fn: () => apagarProjeto().catch(() => {}) },
  ]);
});
document.querySelectorAll(".nav-tab").forEach((b) => b.addEventListener("click", () => mostrarVista(b.dataset.view)));

$("btn-settings").addEventListener("click", abrirDefinicoes);
$("set-dark").addEventListener("change", (e) => applyTheme(e.target.checked));
$("set-save").addEventListener("click", () => guardarDefinicoes().catch(() => {}));
$("set-close").addEventListener("click", fecharDefinicoes);
$("set-logout").addEventListener("click", async () => { await supabaseClient.auth.signOut(); window.location.href = "index.html"; });

$("share-btn").addEventListener("click", () => convidar().catch(() => {}));
$("share-close").addEventListener("click", () => $("share-modal").classList.add("hidden"));

$("item-share-btn").addEventListener("click", () => partilharItem().catch(() => {}));
$("item-share-close").addEventListener("click", () => $("item-share-modal").classList.add("hidden"));

$("resp-save").addEventListener("click", () => guardarResponsavel().catch(() => {}));
$("resp-remover").addEventListener("click", () => removerResponsavel().catch(() => {}));
$("resp-close").addEventListener("click", () => $("resp-modal").classList.add("hidden"));

$("busca").addEventListener("input", (e) => { filtros.busca = e.target.value; render(); });
$("filtro-estado").addEventListener("change", (e) => { filtros.estado = e.target.value; render(); });
$("filtro-fase").addEventListener("change", (e) => { filtros.fase = e.target.value; render(); });
$("filtro-resp").addEventListener("change", (e) => { filtros.resp = e.target.value; render(); });
$("filtro-meus").addEventListener("click", () => {
  filtros.meus = !filtros.meus;
  $("filtro-meus").classList.toggle("active", filtros.meus);
  render();
});
$("filtro-limpar").addEventListener("click", () => { limparFiltros(); render(); });

init().catch((e) => console.error(e));
