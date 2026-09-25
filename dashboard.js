const SUPABASE_URL = "https://swpqelomnbmytwoppccb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3cHFlbG9tbmJteXR3b3BwY2NiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzMjc5OTcsImV4cCI6MjEwNTkwMzk5N30.lVVpzaL21oak28tjnsHhzfi6ABWe3IrHU40RCxwx0sk";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const FASES = [
  { key: "preparacao", label: "Preparação" },
  { key: "obra", label: "Obra" },
  { key: "continuidade", label: "Continuidade" },
];

let currentObra = null;

async function init() {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  if (!sessionData.session) {
    window.location.href = "index.html";
    return;
  }
  document.getElementById("user-email").textContent = sessionData.session.user.email;

  const { data: obra } = await supabaseClient
    .from("obras")
    .select("*")
    .eq("user_id", sessionData.session.user.id)
    .single();

  currentObra = obra;

  const { data: items } = await supabaseClient
    .from("checklist_items")
    .select("*")
    .eq("obra_id", obra.id)
    .order("ordem", { ascending: true });

  render(items || []);
}

function render(items) {
  const container = document.getElementById("fases-container");
  container.innerHTML = "";

  FASES.forEach((fase, index) => {
    const faseItems = items.filter((i) => i.fase === fase.key);
    const done = faseItems.filter((i) => i.concluido).length;

    const section = document.createElement("section");
    section.className = "fase-card";

    const header = document.createElement("button");
    header.type = "button";
    header.className = "fase-header";
    header.innerHTML = `
      <span class="fase-title">${fase.label}</span>
      <span class="fase-progress">${done}/${faseItems.length}</span>
    `;

    const body = document.createElement("div");
    body.className = "fase-body";

    faseItems.forEach((item) => {
      const row = document.createElement("label");
      row.className = "checklist-row";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = item.concluido;
      checkbox.addEventListener("change", async () => {
        await toggleItem(item.id, checkbox.checked);
        item.concluido = checkbox.checked;
        const newDone = faseItems.filter((i) => i.concluido).length;
        header.querySelector(".fase-progress").textContent = `${newDone}/${faseItems.length}`;
      });

      const span = document.createElement("span");
      span.textContent = item.titulo;
      if (item.concluido) span.classList.add("done");
      checkbox.addEventListener("change", () => span.classList.toggle("done", checkbox.checked));

      row.appendChild(checkbox);
      row.appendChild(span);
      body.appendChild(row);
    });

    // Primeira fase começa aberta, as outras minimizadas
    if (index === 0) section.classList.add("open");

    header.addEventListener("click", () => section.classList.toggle("open"));

    section.appendChild(header);
    section.appendChild(body);
    container.appendChild(section);
  });
}

async function toggleItem(itemId, concluido) {
  await supabaseClient.from("checklist_items").update({ concluido }).eq("id", itemId);
}

document.getElementById("logout-btn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
});

init();
