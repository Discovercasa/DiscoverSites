// Edge Function "drive-ligar": recebe o regresso da autorização Google (OAuth) e guarda a ligação.
// Pública (o Google chama-a sem sessão do Hub); protegida pelo "state" de uso único criado por um ADMIN.
import { admin, gj, pastaFilha, G_ID, G_SEGREDO, REDIRECT, HUB } from "./google.ts";

const voltar = (resultado: string) => Response.redirect(`${HUB}/obras?drive=${resultado}`, 302);

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const code = u.searchParams.get("code"), state = u.searchParams.get("state");
  if (u.searchParams.get("error") || !code || !state) return voltar("cancelado");

  const adm = admin();
  const { data: c } = await adm.from("drive_config").select("estado_oauth, estado_criado, ligado_por").eq("id", 1).maybeSingle();
  const valido = c?.estado_oauth && c.estado_oauth === state && Date.now() - new Date(c.estado_criado).getTime() < 15 * 60_000;
  if (!valido) return voltar("invalido");

  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: G_ID, client_secret: G_SEGREDO, redirect_uri: REDIRECT, grant_type: "authorization_code" }),
    });
    const t = await r.json();
    if (!r.ok || !t.refresh_token) { console.error("token", r.status, t.error); return voltar("erro"); }

    const sobre = await gj(t.access_token, "about?fields=user(emailAddress)");
    const raiz = await pastaFilha(t.access_token, "root", "Discovercasa Sites");
    const obras = await pastaFilha(t.access_token, raiz, "Obras");

    await adm.from("drive_config").update({
      refresh_token: t.refresh_token, access_token: t.access_token,
      access_expira: new Date(Date.now() + t.expires_in * 1000).toISOString(),
      email: sobre.user?.emailAddress ?? null, raiz_id: raiz, obras_id: obras,
      ligado_em: new Date().toISOString(), estado_oauth: null, estado_criado: null,
    }).eq("id", 1);
    return voltar("ligado");
  } catch (e) {
    console.error(e);
    return voltar("erro");
  }
});
