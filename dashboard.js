const SUPABASE_URL = "https://swpqelomnbmytwoppccb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3cHFlbG9tbmJteXR3b3BwY2NiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzMjc5OTcsImV4cCI6MjEwNTkwMzk5N30.lVVpzaL21oak28tjnsHhzfi6ABWe3IrHU40RCxwx0sk";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- Estado ----------
let me = null;
let profile = null;
let obras = [];
let obraAtual = null;
let fases = [];
let items = [];
let status = new Map(); // item_id -> linha de item_status
let nomes = new Map(); // user_id -> nome
let membros = [];
const collapsed = new Set(JSON.parse(localStorage.getItem("collapsed") || "[]"));

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

const byOrdem = (a, b) => a.ordem - b.ordem || a.created_at.localeCompare(b.created_at);
const irmaos = (faseId, parentId) =>
  items.filter((i) => i.fase_id === faseId && (i.parent_id || null) === (parentId || null)).sort(byOrdem);
const filhos = (id) => items.filter((i) => i.parent_id === id);
const souDono = () => obraAtual && obraAtual.papel === "dono";

// ---------- Menu flutuante ----------
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

document.addEventListener("click", (e) => {
  if (!e.target.closest(".popup")) closeMenu();
});

// ---------- Carregar dados ----------
async function loadProfile() {
  let p = await run(supabaseClient.from("profiles").select("*").eq("id", me.id).maybeSingle());
  if (!p) {
    p = await run(
      supabaseClient.from("profiles").insert({ id: me.id, nome: me.email.split("@")[0] }).select().single()
    );
  }
  profile = p;
  applyTheme(profile.dark_mode);
}

async function loadObras() {
  const rows = await run(
    supabaseClient.from("obra_membros").select("papel, obras(id, nome, user_id)").eq("user_id", me.id)
  );
  obras = rows
    .filter((r) => r.obras)
    .map((r) => ({ ...r.obras, papel: r.papel }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

async function loadObraData() {
  const donoId = obraAtual.user_id;
  fases = await run(supabaseClient.from("fases").select("*").eq("dono_id", donoId).order("ordem"));
  const ids = fases.map((f) => f.id);
  items = ids.length ? await run(supabaseClient.from("items").select("*").in("fase_id", ids)) : [];
  const st = await run(supabaseClient.from("item_status").select("*").eq("obra_id", obraAtual.id));
  status = new Map(st.map((s) => [s.item_id, s]));
  membros = await run(supabaseClient.from("obra_membros").select("user_id, papel").eq("obra_id", obraAtual.id));
  const pids = [...new Set([...membros.map((m) => m.user_id), ...st.map((s) => s.concluido_por)])];
  const ps = pids.length ? await run(supabaseClient.from("profiles").select("id, nome").in("id", pids)) : [];
  nomes = new Map(ps.map((p) => [p.id, p.nome || "Sem nome"]));
  nomes.set(me.id, profile.nome || me.email.split("@")[0]);
}

async function criarObra(nome) {
  const obra = await run(supabaseClient.from("obras").insert({ user_id: me.id, nome }).select().single());
  await loadObras();
  return obra;
}

async function selecionarObra(id) {
  obraAtual = obras.find((o) => o.id === id) || obras[0];
  localStorage.setItem("obraAtual", obraAtual.id);
  await loadObraData();
  renderTopbar();
  render();
}

// ---------- Ordem ----------
async function gravarOrdem(lista, tabela) {
  await Promise.all(
    lista.map((x, i) => {
      if (x.ordem === i) return null;
      return run(supabaseClient.from(tabela).update({ ordem: i }).eq("id", x.id)).then(() => { x.ordem = i; });
    })
  );
}

// ---------- Ações: itens ----------
async function addItem(faseId, parentId, tipo, afterId) {
  const txt = prompt(tipo === "titulo" ? "Nome do título (grupo):" : "Nome do item:");
  if (!txt || !txt.trim()) return;
  const sibs = irmaos(faseId, parentId);
  const idx = afterId ? sibs.findIndex((s) => s.id === afterId) + 1 : sibs.length;
  const novo = await run(
    supabaseClient
      .from("items")
      .insert({ fase_id: faseId, parent_id: parentId || null, titulo: txt.trim(), tipo, ordem: idx })
      .select()
      .single()
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

async function moverItem(it, dir) {
  const sibs = irmaos(it.fase_id, it.parent_id);
  const i = sibs.findIndex((s) => s.id === it.id);
  const j = i + dir;
  if (j < 0 || j >= sibs.length) return;
  [sibs[i], sibs[j]] = [sibs[j], sibs[i]];
  await gravarOrdem(sibs, "items");
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
      const row = {
        obra_id: obraAtual.id,
        item_id: it.id,
        concluido: true,
        concluido_em: new Date().toISOString(),
        concluido_por: me.id,
      };
      await run(supabaseClient.from("item_status").upsert(row));
      status.set(it.id, row);
    } else {
      await run(
        supabaseClient.from("item_status").delete().eq("obra_id", obraAtual.id).eq("item_id", it.id)
      );
      status.delete(it.id);
    }
  } catch (e) { /* erro já mostrado */ }
  render();
}

// ---------- Ações: fases ----------
async function addFase() {
  const txt = prompt("Nome da nova fase:");
  if (!txt || !txt.trim()) return;
  const nova = await run(
    supabaseClient
      .from("fases")
      .insert({ dono_id: obraAtual.user_id, titulo: txt.trim(), ordem: fases.length })
      .select()
      .single()
  );
  fases.push(nova);
  render();
}

async function renomearFase(f) {
  const txt = prompt("Novo nome da fase:", f.titulo);
  if (!txt || !txt.trim() || txt.trim() === f.titulo) return;
  await run(supabaseClient.from("fases").update({ titulo: txt.trim() }).eq("id", f.id));
  f.titulo = txt.trim();
  render();
}

async function moverFase(f, dir) {
  const lista = [...fases].sort(byOrdem);
  const i = lista.findIndex((x) => x.id === f.id);
  const j = i + dir;
  if (j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  await gravarOrdem(lista, "fases");
  fases = lista;
  render();
}

async function apagarFase(f) {
  if (!confirm(`Apagar a fase "${f.titulo}" e todos os seus itens? Isto aplica-se a todos os projetos.`)) return;
  await run(supabaseClient.from("fases").delete().eq("id", f.id));
  await loadObraData();
  render();
}

// ---------- Renderização ----------
function renderTopbar() {
  $("ola").textContent = "Olá, " + (profile.nome || me.email);
  const sel = $("obra-select");
  sel.innerHTML = "";
  obras.forEach((o) => {
    const opt = el("option", "", o.nome + (o.papel === "dono" ? "" : " (partilhado)"));
    opt.value = o.id;
    sel.appendChild(opt);
  });
  sel.value = obraAtual.id;
}

function donoTemplate() {
  return obraAtual.user_id === me.id;
}

function renderItem(it) {
  const wrap = el("div", "item");
  const row = el("div", "item-row");
  const kids = filhos(it.id);
  const aberto = !collapsed.has(it.id);

  const chev = btn("chev-btn" + (kids.length ? "" : " placeholder"), aberto ? "▾" : "▸", () => {
    if (aberto) collapsed.add(it.id); else collapsed.delete(it.id);
    saveCollapsed();
    render();
  });
  row.appendChild(chev);

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = status.has(it.id);
  cb.addEventListener("change", () => marcar(it, cb.checked));
  row.appendChild(cb);

  const text = el("div", "item-text");
  text.appendChild(el("span", "item-title" + (cb.checked ? " done" : ""), it.titulo));
  const s = status.get(it.id);
  if (s) {
    text.appendChild(
      el("span", "item-meta", `✓ ${nomes.get(s.concluido_por) || "Alguém"} · ${fmtData(s.concluido_em)}`)
    );
  }
  if (kids.length) {
    const feitos = kids.filter((k) => k.tipo === "item" && status.has(k.id)).length;
    const total = kids.filter((k) => k.tipo === "item").length;
    if (total) text.appendChild(el("span", "item-count", `${feitos}/${total} sub-itens`));
  }
  row.appendChild(text);

  row.appendChild(
    btn("menu-btn", "⋯", (_e, b) =>
      showMenu(b, [
        { label: "+ Sub-item", fn: () => addItem(it.fase_id, it.id, "item") },
        { label: "+ Item abaixo", fn: () => addItem(it.fase_id, it.parent_id, "item", it.id) },
        { label: "+ Título abaixo", fn: () => addItem(it.fase_id, it.parent_id, "titulo", it.id) },
        { label: "Renomear", fn: () => renomearItem(it) },
        { label: "Mover para cima", fn: () => moverItem(it, -1) },
        { label: "Mover para baixo", fn: () => moverItem(it, 1) },
        donoTemplate() && { label: "Apagar", danger: true, fn: () => apagarItem(it) },
      ])
    )
  );

  wrap.appendChild(row);
  if (kids.length && aberto) {
    const sub = el("div", "sub");
    renderLista(sub, it.fase_id, it.id);
    wrap.appendChild(sub);
  }
  return wrap;
}

function renderTitulo(it) {
  const t = el("div", "grupo-titulo");
  t.appendChild(el("span", "", it.titulo));
  t.appendChild(
    btn("menu-btn", "⋯", (_e, b) =>
      showMenu(b, [
        { label: "+ Item abaixo", fn: () => addItem(it.fase_id, it.parent_id, "item", it.id) },
        { label: "+ Título abaixo", fn: () => addItem(it.fase_id, it.parent_id, "titulo", it.id) },
        { label: "Renomear", fn: () => renomearItem(it) },
        { label: "Mover para cima", fn: () => moverItem(it, -1) },
        { label: "Mover para baixo", fn: () => moverItem(it, 1) },
        donoTemplate() && { label: "Apagar", danger: true, fn: () => apagarItem(it) },
      ])
    )
  );
  return t;
}

function renderLista(parentEl, faseId, parentId) {
  irmaos(faseId, parentId).forEach((it) => {
    parentEl.appendChild(it.tipo === "titulo" ? renderTitulo(it) : renderItem(it));
  });
}

function renderFase(f) {
  const aberta = !collapsed.has(f.id);
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

  const todos = items.filter((i) => i.fase_id === f.id && i.tipo === "item");
  const feitos = todos.filter((i) => status.has(i.id)).length;
  head.appendChild(el("span", "fase-progress", `${feitos}/${todos.length}`));

  head.appendChild(
    btn("menu-btn", "⋯", (_e, b) =>
      showMenu(b, [
        { label: "+ Item", fn: () => addItem(f.id, null, "item") },
        { label: "+ Título", fn: () => addItem(f.id, null, "titulo") },
        { label: "Renomear fase", fn: () => renomearFase(f) },
        { label: "Mover para cima", fn: () => moverFase(f, -1) },
        { label: "Mover para baixo", fn: () => moverFase(f, 1) },
        donoTemplate() && { label: "Apagar fase", danger: true, fn: () => apagarFase(f) },
      ])
    )
  );
  card.appendChild(head);

  const body = el("div", "fase-body");
  renderLista(body, f.id, null);
  const bar = el("div", "fase-toolbar");
  bar.appendChild(btn("btn-ghost", "+ Item", () => addItem(f.id, null, "item")));
  bar.appendChild(btn("btn-ghost", "+ Título (grupo)", () => addItem(f.id, null, "titulo")));
  body.appendChild(bar);
  card.appendChild(body);
  return card;
}

function render() {
  const c = $("fases-container");
  c.innerHTML = "";
  [...fases].sort(byOrdem).forEach((f) => c.appendChild(renderFase(f)));
  c.appendChild(btn("btn-ghost btn-add-fase", "+ Nova fase", addFase));
}

// ---------- Definições ----------
function abrirDefinicoes() {
  $("set-nome").value = profile.nome || "";
  $("set-email").textContent = me.email;
  $("set-dark").checked = profile.dark_mode;
  $("settings-modal").classList.remove("hidden");
}

function fecharDefinicoes() {
  applyTheme(profile.dark_mode); // desfaz pré-visualização se cancelou
  $("settings-modal").classList.add("hidden");
}

async function guardarDefinicoes() {
  const nome = $("set-nome").value.trim() || me.email.split("@")[0];
  const dark = $("set-dark").checked;
  await run(supabaseClient.from("profiles").update({ nome, dark_mode: dark }).eq("id", me.id));
  profile.nome = nome;
  profile.dark_mode = dark;
  nomes.set(me.id, nome);
  applyTheme(dark);
  $("settings-modal").classList.add("hidden");
  renderTopbar();
  render();
}

// ---------- Partilha ----------
function renderPartilha() {
  const list = $("share-list");
  list.innerHTML = "";
  membros.forEach((m) => {
    const row = el("div", "share-row");
    const nome = (nomes.get(m.user_id) || "Sem nome") + (m.user_id === me.id ? " (tu)" : "");
    row.appendChild(el("span", "", nome));
    row.appendChild(el("span", "tag", m.papel === "dono" ? "Dono" : "Membro"));
    list.appendChild(row);
  });
  $("share-invite").classList.toggle("hidden", !souDono());
  $("share-leave").classList.toggle("hidden", souDono());
  $("share-msg").textContent = "";
}

async function convidar() {
  const email = $("share-email").value.trim();
  if (!email) return;
  const res = await run(supabaseClient.rpc("convidar_membro", { p_obra_id: obraAtual.id, p_email: email }));
  if (res === "sem_conta") {
    $("share-msg").textContent = "Essa pessoa ainda não tem conta. Pede-lhe para se registar primeiro com esse email.";
    return;
  }
  $("share-email").value = "";
  await loadObraData();
  renderPartilha();
  $("share-msg").textContent = "Pessoa adicionada ao projeto.";
}

async function sairDoProjeto() {
  if (!confirm("Sair deste projeto? Deixas de o ver.")) return;
  await run(supabaseClient.from("obra_membros").delete().eq("obra_id", obraAtual.id).eq("user_id", me.id));
  $("share-modal").classList.add("hidden");
  await loadObras();
  await selecionarObra(obras[0] && obras[0].id);
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
  if (!confirm(`Apagar o projeto "${obraAtual.nome}" e todos os checks? Não dá para desfazer.`)) return;
  await run(supabaseClient.from("obras").delete().eq("id", obraAtual.id));
  await loadObras();
  if (!obras.length) await criarObra("A minha obra");
  await selecionarObra(obras[0].id);
}

// ---------- Arranque ----------
async function init() {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) {
    window.location.href = "index.html";
    return;
  }
  me = data.session.user;
  await loadProfile();
  await loadObras();
  if (!obras.length) await criarObra("A minha obra");
  const guardada = localStorage.getItem("obraAtual");
  obraAtual = obras.find((o) => o.id === guardada) || obras[0];
  await loadObraData();
  renderTopbar();
  render();
}

$("obra-select").addEventListener("change", (e) => selecionarObra(e.target.value));
$("btn-novo-projeto").addEventListener("click", novoProjeto);
$("btn-projeto-menu").addEventListener("click", (e) => {
  e.stopPropagation();
  showMenu(e.currentTarget, [
    { label: "Partilhar…", fn: () => { renderPartilha(); $("share-modal").classList.remove("hidden"); } },
    souDono() && { label: "Renomear projeto", fn: renomearProjeto },
    souDono() && { label: "Apagar projeto", danger: true, fn: apagarProjeto },
  ]);
});
$("btn-settings").addEventListener("click", abrirDefinicoes);
$("set-dark").addEventListener("change", (e) => applyTheme(e.target.checked));
$("set-save").addEventListener("click", () => guardarDefinicoes().catch(() => {}));
$("set-close").addEventListener("click", fecharDefinicoes);
$("set-logout").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
});
$("share-btn").addEventListener("click", () => convidar().catch(() => {}));
$("share-close").addEventListener("click", () => $("share-modal").classList.add("hidden"));
$("share-leave").addEventListener("click", () => sairDoProjeto().catch(() => {}));

init().catch((e) => console.error(e));
