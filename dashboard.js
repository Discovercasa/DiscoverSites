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
let fases = [];
let items = [];
let status = new Map(); // item_id -> linha de item_status (do projeto atual)
let nomes = new Map(); // user_id -> nome
let membros = []; // membros do projeto atual (só admins veem)
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

function fmtDia(iso) {
  return new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const byOrdem = (a, b) => a.ordem - b.ordem || a.created_at.localeCompare(b.created_at);
const irmaos = (faseId, parentId) =>
  items.filter((i) => i.fase_id === faseId && (i.parent_id || null) === (parentId || null)).sort(byOrdem);
const filhos = (id) => items.filter((i) => i.parent_id === id);

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
  isAdmin = p.role === "admin" || p.role === "super_admin";
  isSuper = p.role === "super_admin";
  applyTheme(profile.dark_mode);
}

async function loadObras() {
  obras = await run(supabaseClient.from("obras").select("id, nome, criado_por").order("nome"));
}

async function loadObraData() {
  // A checklist (fases e itens) é única e igual em todos os projetos
  fases = await run(supabaseClient.from("fases").select("*").order("ordem"));
  items = await run(supabaseClient.from("items").select("*"));

  // Os checks são por projeto
  const st = obraAtual
    ? await run(supabaseClient.from("item_status").select("*").eq("obra_id", obraAtual.id))
    : [];
  status = new Map(st.map((s) => [s.item_id, s]));

  membros = obraAtual && isAdmin
    ? await run(supabaseClient.rpc("listar_membros", { p_obra: obraAtual.id }))
    : [];

  const pids = [...new Set(st.map((s) => s.concluido_por))];
  const ps = pids.length ? await run(supabaseClient.from("profiles").select("id, nome").in("id", pids)) : [];
  nomes = new Map(ps.map((p) => [p.id, p.nome || "Sem nome"]));
  nomes.set(me.id, profile.nome || me.email.split("@")[0]);
}

async function criarObra(nome) {
  const obra = await run(supabaseClient.from("obras").insert({ nome }).select().single());
  await loadObras();
  return obra;
}

async function selecionarObra(id) {
  obraAtual = obras.find((o) => o.id === id) || obras[0] || null;
  if (obraAtual) localStorage.setItem("obraAtual", obraAtual.id);
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

// ---------- Ações: itens (só admins) ----------
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

// ---------- Checks (por projeto) ----------
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

// ---------- Ações: fases (só admins) ----------
async function addFase() {
  const txt = prompt("Nome da nova fase:");
  if (!txt || !txt.trim()) return;
  const nova = await run(
    supabaseClient.from("fases").insert({ titulo: txt.trim(), ordem: fases.length }).select().single()
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
  $("btn-projeto-menu").classList.toggle("hidden", !isAdmin || !obraAtual);
  $("tabs-main").classList.toggle("hidden", !isSuper);
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

  if (isAdmin) {
    row.appendChild(
      btn("menu-btn", "⋯", (_e, b) =>
        showMenu(b, [
          { label: "+ Sub-item", fn: () => addItem(it.fase_id, it.id, "item") },
          { label: "+ Item abaixo", fn: () => addItem(it.fase_id, it.parent_id, "item", it.id) },
          { label: "+ Título abaixo", fn: () => addItem(it.fase_id, it.parent_id, "titulo", it.id) },
          { label: "Renomear", fn: () => renomearItem(it) },
          { label: "Mover para cima", fn: () => moverItem(it, -1) },
          { label: "Mover para baixo", fn: () => moverItem(it, 1) },
          { label: "Apagar", danger: true, fn: () => apagarItem(it) },
        ])
      )
    );
  }

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
  if (isAdmin) {
    t.appendChild(
      btn("menu-btn", "⋯", (_e, b) =>
        showMenu(b, [
          { label: "+ Item abaixo", fn: () => addItem(it.fase_id, it.parent_id, "item", it.id) },
          { label: "+ Título abaixo", fn: () => addItem(it.fase_id, it.parent_id, "titulo", it.id) },
          { label: "Renomear", fn: () => renomearItem(it) },
          { label: "Mover para cima", fn: () => moverItem(it, -1) },
          { label: "Mover para baixo", fn: () => moverItem(it, 1) },
          { label: "Apagar", danger: true, fn: () => apagarItem(it) },
        ])
      )
    );
  }
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

  if (isAdmin) {
    head.appendChild(
      btn("menu-btn", "⋯", (_e, b) =>
        showMenu(b, [
          { label: "+ Item", fn: () => addItem(f.id, null, "item") },
          { label: "+ Título", fn: () => addItem(f.id, null, "titulo") },
          { label: "Renomear fase", fn: () => renomearFase(f) },
          { label: "Mover para cima", fn: () => moverFase(f, -1) },
          { label: "Mover para baixo", fn: () => moverFase(f, 1) },
          { label: "Apagar fase", danger: true, fn: () => apagarFase(f) },
        ])
      )
    );
  }
  card.appendChild(head);

  const body = el("div", "fase-body");
  renderLista(body, f.id, null);
  if (isAdmin) {
    const bar = el("div", "fase-toolbar");
    bar.appendChild(btn("btn-ghost", "+ Item", () => addItem(f.id, null, "item")));
    bar.appendChild(btn("btn-ghost", "+ Título (grupo)", () => addItem(f.id, null, "titulo")));
    body.appendChild(bar);
  }
  card.appendChild(body);
  return card;
}

function render() {
  const c = $("fases-container");
  c.innerHTML = "";
  if (!obraAtual) {
    c.appendChild(
      el(
        "p",
        "empty",
        isAdmin
          ? "Ainda não há projetos. Cria o primeiro com “+ Projeto”."
          : "Ainda não tens acesso a nenhum projeto. Pede a um administrador para te adicionar."
      )
    );
    return;
  }
  [...fases].sort(byOrdem).forEach((f) => c.appendChild(renderFase(f)));
  if (isAdmin) c.appendChild(btn("btn-ghost btn-add-fase", "+ Nova fase", addFase));
}

// ---------- Definições ----------
function abrirDefinicoes() {
  $("set-nome").value = profile.nome || "";
  $("set-email").textContent = me.email;
  $("set-dark").checked = profile.dark_mode;
  $("settings-modal").classList.remove("hidden");
}

function fecharDefinicoes() {
  applyTheme(profile.dark_mode); // desfaz a pré-visualização se cancelou
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

// ---------- Acesso ao projeto (só admins) ----------
function renderPartilha() {
  const list = $("share-list");
  list.innerHTML = "";
  list.appendChild(
    el("p", "hint", "Os admins veem sempre todos os projetos. Aqui adicionas quem não é admin (ex: empreiteiro).")
  );
  membros.forEach((m) => {
    const row = el("div", "share-row");
    row.appendChild(el("span", "", m.email + (m.nome ? ` (${m.nome})` : "")));
    row.appendChild(
      btn("btn-link", "Remover", async () => {
        if (!confirm(`Remover ${m.email} deste projeto?`)) return;
        try {
          await run(
            supabaseClient.from("obra_membros").delete().eq("obra_id", obraAtual.id).eq("user_id", m.user_id)
          );
          await loadObraData();
          renderPartilha();
        } catch (e) { /* erro já mostrado */ }
      })
    );
    list.appendChild(row);
  });
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

// ---------- Projetos (só admins) ----------
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

// ---------- Gestão de contas (só super admin) ----------
async function carregarGestao() {
  const box = $("gestao-lista");
  box.textContent = "A carregar…";
  let lista;
  try {
    lista = await run(supabaseClient.rpc("listar_utilizadores"));
  } catch (e) {
    box.textContent = "";
    return;
  }
  box.innerHTML = "";
  lista.forEach((u) => {
    const row = el("div", "gestao-row");
    const info = el("div", "gestao-info");
    info.appendChild(el("span", "gestao-email", u.email));
    info.appendChild(
      el("span", "gestao-sub", (u.nome ? u.nome + " · " : "") + "conta criada em " + fmtDia(u.criado_em))
    );
    row.appendChild(info);

    const label = u.role === "super_admin" ? "Super admin" : u.role === "admin" ? "Admin" : "Utilizador";
    row.appendChild(el("span", "badge" + (u.role !== "utilizador" ? " badge-on" : ""), label));

    if (u.role !== "super_admin") {
      const tornar = u.role !== "admin";
      row.appendChild(
        btn("btn-secondary", tornar ? "Tornar admin" : "Remover admin", async () => {
          const acao = tornar ? "Dar permissões de admin a" : "Retirar permissões de admin a";
          if (!confirm(`${acao} ${u.email}?`)) return;
          try {
            await run(
              supabaseClient.rpc("definir_role", { p_user: u.id, p_role: tornar ? "admin" : "utilizador" })
            );
            carregarGestao();
          } catch (e) { /* erro já mostrado */ }
        })
      );
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
  if (!data.session) {
    window.location.href = "index.html";
    return;
  }
  me = data.session.user;
  await loadProfile();
  await loadObras();
  const guardada = localStorage.getItem("obraAtual");
  obraAtual = obras.find((o) => o.id === guardada) || obras[0] || null;
  await loadObraData();
  renderTopbar();
  render();
}

$("obra-select").addEventListener("change", (e) => selecionarObra(e.target.value));
$("btn-novo-projeto").addEventListener("click", () => novoProjeto().catch(() => {}));
$("btn-projeto-menu").addEventListener("click", (e) => {
  e.stopPropagation();
  showMenu(e.currentTarget, [
    { label: "Quem tem acesso…", fn: () => { renderPartilha(); $("share-modal").classList.remove("hidden"); } },
    { label: "Renomear projeto", fn: () => renomearProjeto().catch(() => {}) },
    { label: "Apagar projeto", danger: true, fn: () => apagarProjeto().catch(() => {}) },
  ]);
});
document.querySelectorAll(".nav-tab").forEach((b) =>
  b.addEventListener("click", () => mostrarVista(b.dataset.view))
);
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

init().catch((e) => console.error(e));
