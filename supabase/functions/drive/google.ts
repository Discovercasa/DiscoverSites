// Utilitários Google Drive partilhados pelas funções "drive" e "drive-ligar".
// Credenciais: só dos Secrets do Supabase (Deno.env). O refresh token fica na tabela privada drive_config.
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export const SB_URL = Deno.env.get("SUPABASE_URL")!;
export const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SB_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const G_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
export const G_SEGREDO = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
export const REDIRECT = `${SB_URL}/functions/v1/drive-ligar`;
export const HUB = "https://hub.discovercasa.pt";
export const PASTA = "application/vnd.google-apps.folder";

export const admin = (): SupabaseClient => createClient(SB_URL, SB_SERVICO, { auth: { persistSession: false } });

export class Erro extends Error { constructor(public estado: number, msg: string) { super(msg); } }

// Token de acesso válido (renova com o refresh token quando expira)
export async function tokenAcesso(adm: SupabaseClient): Promise<string> {
  const { data: c } = await adm.from("drive_config").select("*").eq("id", 1).maybeSingle();
  if (!c?.refresh_token) throw new Erro(409, "O Google Drive ainda não está ligado.");
  if (c.access_token && new Date(c.access_expira).getTime() > Date.now() + 60_000) return c.access_token;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: G_ID, client_secret: G_SEGREDO, refresh_token: c.refresh_token, grant_type: "refresh_token" }),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Erro(502, "A autorização do Google Drive expirou. Um ADMIN tem de voltar a ligar a Drive.");
  await adm.from("drive_config").update({ access_token: j.access_token, access_expira: new Date(Date.now() + j.expires_in * 1000).toISOString() }).eq("id", 1);
  return j.access_token;
}

export async function g(token: string, caminho: string, opcoes: RequestInit = {}): Promise<Response> {
  const url = caminho.startsWith("http") ? caminho : `https://www.googleapis.com/drive/v3/${caminho}`;
  return await fetch(url, { ...opcoes, headers: { Authorization: `Bearer ${token}`, ...(opcoes.headers ?? {}) } });
}
export async function gj(token: string, caminho: string, opcoes: RequestInit = {}) {
  const r = await g(token, caminho, opcoes);
  if (!r.ok) { console.error(caminho, r.status, await r.text()); throw new Erro(502, "O Google Drive não respondeu como esperado."); }
  return await r.json();
}

const aspas = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

// Encontra (ou cria) uma pasta com este nome dentro de outra
export async function pastaFilha(token: string, paiId: string, nome: string): Promise<string> {
  const q = `name='${aspas(nome)}' and mimeType='${PASTA}' and '${paiId}' in parents and trashed=false`;
  const lista = await gj(token, `files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1`);
  if (lista.files?.length) return lista.files[0].id;
  const nova = await gj(token, "files?fields=id", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: nome, mimeType: PASTA, parents: [paiId] }),
  });
  return nova.id;
}
