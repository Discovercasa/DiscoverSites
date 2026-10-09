// Edge Function "gerir-contas": criar e gerir contas do Hub.
// Só ADMIN e Administrador. A chave de serviço vem do ambiente do Supabase
// (Deno.env), nunca do código nem do site.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ORIGENS = ["https://hub.discovercasa.pt", "https://discoversites.pages.dev"];
const PAPEIS = ["admin", "administrador", "obra", "subempreiteiro", "cliente"];
const RE_UTILIZADOR = /^[a-z0-9._-]{3,30}$/;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cors(req: Request) {
  const o = req.headers.get("Origin") ?? "";
  const permitida = ORIGENS.includes(o) || /^https:\/\/[a-z0-9-]+\.discoversites\.pages\.dev$/.test(o);
  return {
    "Access-Control-Allow-Origin": permitida ? o : ORIGENS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const h = cors(req);
  const responder = (estado: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status: estado, headers: { ...h, "Content-Type": "application/json" } });
  const erro = (estado: number, mensagem: string) => responder(estado, { erro: mensagem });

  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return erro(405, "Método não permitido.");

  // Quem está a pedir?
  const quem = createClient(URL, ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await quem.auth.getUser();
  if (!user) return erro(401, "Sessão inválida. Volte a entrar.");

  const adm = createClient(URL, SERVICO, { auth: { persistSession: false } });
  const { data: eu } = await adm.from("profiles").select("papel, ativo").eq("id", user.id).single();
  if (!eu?.ativo || !["admin", "administrador"].includes(eu.papel)) return erro(403, "Sem permissão para gerir contas.");
  const souAdmin = eu.papel === "admin";

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return erro(400, "Pedido inválido."); }

  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const alvoPermitido = async (id: string) => {
    const { data: alvo } = await adm.from("profiles").select("papel").eq("id", id).single();
    if (!alvo) return "Conta não encontrada.";
    if (alvo.papel === "admin" && !souAdmin) return "Só um ADMIN pode alterar contas ADMIN.";
    return null;
  };

  switch (b.acao) {
    case "criar": {
      const nome = texto(b.nome), email = texto(b.email).toLowerCase();
      const utilizador = texto(b.utilizador).toLowerCase(), papel = texto(b.papel), senha = String(b.senha ?? "");
      if (!nome) return erro(400, "Indique o nome.");
      if (!RE_EMAIL.test(email)) return erro(400, "Email inválido.");
      if (!RE_UTILIZADOR.test(utilizador)) return erro(400, "Utilizador: 3 a 30 caracteres (letras minúsculas, números, . _ -).");
      if (!PAPEIS.includes(papel)) return erro(400, "Tipo de utilizador inválido.");
      if (papel === "admin" && !souAdmin) return erro(403, "Só um ADMIN pode criar contas ADMIN.");
      if (senha.length < 8) return erro(400, "A palavra-passe tem de ter pelo menos 8 caracteres.");

      const { data: existe } = await adm.from("profiles").select("id").ilike("utilizador", utilizador).maybeSingle();
      if (existe) return erro(409, "Esse nome de utilizador já existe.");

      const { data: criado, error: e1 } = await adm.auth.admin.createUser({ email, password: senha, email_confirm: true });
      if (e1 || !criado.user) return erro(400, e1?.message?.includes("registered") ? "Já existe uma conta com esse email." : "Não foi possível criar a conta.");

      const { error: e2 } = await adm.from("profiles").update({ nome, utilizador, papel }).eq("id", criado.user.id);
      if (e2) { await adm.auth.admin.deleteUser(criado.user.id); return erro(500, "Não foi possível guardar o perfil."); }
      return responder(200, { ok: true, id: criado.user.id });
    }

    case "atualizar": {
      const id = texto(b.id);
      const proibido = await alvoPermitido(id);
      if (proibido) return erro(403, proibido);
      const campos: Record<string, string> = {};
      if (b.nome !== undefined) { if (!texto(b.nome)) return erro(400, "Indique o nome."); campos.nome = texto(b.nome); }
      if (b.papel !== undefined) {
        const papel = texto(b.papel);
        if (!PAPEIS.includes(papel)) return erro(400, "Tipo de utilizador inválido.");
        if (papel === "admin" && !souAdmin) return erro(403, "Só um ADMIN pode atribuir o tipo ADMIN.");
        if (id === user.id && papel !== eu.papel) return erro(400, "Não pode alterar o seu próprio tipo de utilizador.");
        campos.papel = papel;
      }
      const { error } = await adm.from("profiles").update(campos).eq("id", id);
      return error ? erro(500, "Não foi possível guardar.") : responder(200, { ok: true });
    }

    case "senha": {
      const id = texto(b.id), senha = String(b.senha ?? "");
      const proibido = await alvoPermitido(id);
      if (proibido) return erro(403, proibido);
      if (senha.length < 8) return erro(400, "A palavra-passe tem de ter pelo menos 8 caracteres.");
      const { error } = await adm.auth.admin.updateUserById(id, { password: senha });
      return error ? erro(500, "Não foi possível alterar a palavra-passe.") : responder(200, { ok: true });
    }

    case "ativo": {
      const id = texto(b.id), ativo = b.ativo === true;
      if (id === user.id) return erro(400, "Não pode desativar a sua própria conta.");
      const proibido = await alvoPermitido(id);
      if (proibido) return erro(403, proibido);
      const { error: e1 } = await adm.auth.admin.updateUserById(id, { ban_duration: ativo ? "none" : "876000h" });
      if (e1) return erro(500, "Não foi possível alterar o estado.");
      const { error: e2 } = await adm.from("profiles").update({ ativo }).eq("id", id);
      return e2 ? erro(500, "Não foi possível alterar o estado.") : responder(200, { ok: true });
    }

    default:
      return erro(400, "Ação desconhecida.");
  }
});
