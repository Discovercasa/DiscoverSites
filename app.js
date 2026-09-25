// --- Configuração do Supabase ---
const SUPABASE_URL = "https://swpqelomnbmytwoppccb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3cHFlbG9tbmJteXR3b3BwY2NiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzMjc5OTcsImV4cCI6MjEwNTkwMzk5N30.lVVpzaL21oak28tjnsHhzfi6ABWe3IrHU40RCxwx0sk";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Alternar entre separadores Entrar / Criar conta ---
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`${btn.dataset.tab}-form`).classList.add("active");
  });
});

// --- Se já estiver autenticado, salta logo para o dashboard ---
supabaseClient.auth.getSession().then(({ data }) => {
  if (data.session) window.location.href = "dashboard.html";
});

// --- Login ---
document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("login-error");
  errorEl.textContent = "";

  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    errorEl.textContent = "Email ou palavra-passe incorretos.";
    return;
  }
  window.location.href = "dashboard.html";
});

// --- Registo ---
document.getElementById("registo-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById("registo-error");
  const successEl = document.getElementById("registo-success");
  errorEl.textContent = "";
  successEl.textContent = "";

  const email = document.getElementById("registo-email").value;
  const password = document.getElementById("registo-password").value;

  const { data, error } = await supabaseClient.auth.signUp({ email, password });

  if (error) {
    errorEl.textContent = "Não foi possível criar a conta. " + error.message;
    return;
  }

  // Cria já a "obra" inicial do utilizador, com uma checklist por omissão em cada fase
  if (data.user) {
    const { data: obra } = await supabaseClient
      .from("obras")
      .insert({ user_id: data.user.id })
      .select()
      .single();

    if (obra) {
      const DEFAULT_ITEMS = {
        preparacao: [
          "Definir orçamento",
          "Pedir licenças e autorizações",
          "Escolher empreiteiro/equipa",
          "Contratar seguro de obra",
        ],
        obra: [
          "Demolições e preparação do terreno",
          "Estrutura e alvenaria",
          "Instalações elétricas e canalização",
          "Acabamentos",
        ],
        continuidade: [
          "Vistoria final",
          "Guardar garantias e documentação",
          "Agendar manutenção preventiva",
          "Registar contactos úteis",
        ],
      };

      const rows = Object.entries(DEFAULT_ITEMS).flatMap(([fase, items]) =>
        items.map((titulo, i) => ({ obra_id: obra.id, fase, titulo, ordem: i }))
      );

      await supabaseClient.from("checklist_items").insert(rows);
    }
  }

  successEl.textContent = "Conta criada! A entrar...";
  setTimeout(() => (window.location.href = "dashboard.html"), 800);
});
