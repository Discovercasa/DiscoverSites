// Edge Function "drive": pastas e ficheiros das obras no Google Drive.
// Quem vê cada pasta decide-se no Hub (tabela drive_pastas + RLS); a Drive só é acedida por aqui.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { admin, tokenAcesso, g, gj, pastaFilha, Erro, SB_URL, SB_ANON, G_ID, REDIRECT, PASTA } from "./google.ts";

const ORIGENS = ["https://hub.discovercasa.pt", "https://discoversites.pages.dev"];
function cors(req: Request) {
  const o = req.headers.get("Origin") ?? "";
  const ok = ORIGENS.includes(o) || /^https:\/\/[a-z0-9-]+\.discoversites\.pages\.dev$/.test(o);
  return {
    "Access-Control-Allow-Origin": ok ? o : ORIGENS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Expose-Headers": "content-disposition",
    "Vary": "Origin",
  };
}

const CAMPOS = "id,name,mimeType,size,modifiedTime,hasThumbnail,iconLink";

Deno.serve(async (req) => {
  const h = cors(req);
  const json = (estado: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status: estado, headers: { ...h, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json(405, { erro: "Método não permitido." });

  try {
    // Quem pede: cliente Supabase com a sessão da pessoa (as regras RLS aplicam-se)
    const quem = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: { user } } = await quem.auth.getUser();
    if (!user) throw new Erro(401, "Sessão inválida. Volte a entrar.");
    const adm = admin();
    const { data: eu } = await adm.from("profiles").select("papel, ativo").eq("id", user.id).single();
    if (!eu?.ativo) throw new Erro(403, "Conta inativa.");
    const gestor = ["admin", "administrador"].includes(eu.papel);
    const b = await req.json().catch(() => ({}));

    // Pasta que a pessoa pode ver (a RLS decide), com a área (documentos/fotografias)
    const pastaVisivel = async (id: string) => {
      const { data } = await quem.from("drive_pastas").select("id, obra_id, parent_id, drive_id, nome, area, vis_papeis, vis_utilizadores").eq("id", id).maybeSingle();
      if (!data) throw new Erro(404, "Pasta não encontrada ou sem acesso.");
      return data;
    };
    const podeCarregar = (area: string) =>
      area === "fotografias" ? true : area === "documentos" ? (gestor || eu.papel === "obra") : false;
    // Ficheiro que a pessoa pode ver: o pai tem de ser uma pasta visível do Hub
    const ficheiroVisivel = async (token: string, ficheiroId: string) => {
      const f = await gj(token, `files/${encodeURIComponent(ficheiroId)}?fields=id,name,mimeType,size,parents,thumbnailLink,trashed`);
      if (f.trashed || !f.parents?.length) throw new Erro(404, "Ficheiro não encontrado.");
      const { data: p } = await quem.from("drive_pastas").select("id, area").in("drive_id", f.parents).limit(1);
      if (!p?.length) throw new Erro(403, "Sem acesso a este ficheiro.");
      return { f, pasta: p[0] };
    };

    switch (b.acao) {
      case "estado": {
        const { data } = await adm.from("drive_config").select("refresh_token, email, ligado_em").eq("id", 1).maybeSingle();
        return json(200, { ligado: !!data?.refresh_token, email: gestor ? data?.email ?? null : null });
      }

      case "ligar_url": {
        if (eu.papel !== "admin") throw new Erro(403, "Só um ADMIN pode ligar o Google Drive.");
        if (!G_ID) throw new Erro(500, "Faltam os Secrets GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no Supabase.");
        const estado = crypto.randomUUID();
        await adm.from("drive_config").upsert({ id: 1, estado_oauth: estado, estado_criado: new Date().toISOString(), ligado_por: user.id });
        const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        u.search = new URLSearchParams({
          client_id: G_ID, redirect_uri: REDIRECT, response_type: "code", access_type: "offline", prompt: "consent",
          scope: "https://www.googleapis.com/auth/drive", state: estado,
        }).toString();
        return json(200, { url: u.toString() });
      }

      // Garante as pastas da obra: <código · nome>/Documentos e Fotografias
      case "preparar_obra": {
        if (!gestor) throw new Erro(403, "Só ADMIN e Administrador.");
        const token = await tokenAcesso(adm);
        const { data: cfg } = await adm.from("drive_config").select("obras_id").eq("id", 1).single();
        const { data: o } = await adm.from("obras").select("id, codigo, nome").eq("id", b.obra_id).single();
        if (!o) throw new Erro(404, "Obra não encontrada.");
        const nomePasta = (o.codigo ? `${o.codigo} · ${o.nome}` : o.nome).replace(/[\/\\]/g, "-");
        let { data: raiz } = await adm.from("drive_pastas").select("*").eq("obra_id", o.id).eq("area", "raiz").maybeSingle();
        if (!raiz) {
          const id = await pastaFilha(token, cfg!.obras_id, nomePasta);
          raiz = (await adm.from("drive_pastas").insert({ obra_id: o.id, drive_id: id, nome: nomePasta, area: "raiz" }).select("*").single()).data;
        } else if (raiz.nome !== nomePasta) {
          await g(token, `files/${raiz.drive_id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nomePasta }) });
          await adm.from("drive_pastas").update({ nome: nomePasta }).eq("id", raiz.id);
        }
        const res: Record<string, string> = {};
        for (const [area, nome] of [["documentos", "Documentos"], ["fotografias", "Fotografias"]]) {
          let { data: p } = await adm.from("drive_pastas").select("id").eq("parent_id", raiz!.id).eq("area", area).maybeSingle();
          if (!p) {
            const id = await pastaFilha(token, raiz!.drive_id, nome);
            p = (await adm.from("drive_pastas").insert({ obra_id: o.id, parent_id: raiz!.id, drive_id: id, nome, area }).select("id").single()).data;
          }
          res[area] = p!.id;
        }
        return json(200, res);
      }

      // Pasta de topo de uma área (documentos/fotografias) de uma obra
      case "raiz_area": {
        const { data: raiz } = await quem.from("drive_pastas").select("id").eq("obra_id", b.obra_id).eq("area", "raiz").maybeSingle();
        const { data: p } = raiz ? await quem.from("drive_pastas").select("id").eq("parent_id", raiz.id).eq("area", b.area).maybeSingle() : { data: null };
        return json(200, { id: p?.id ?? null });
      }

      // Conteúdo de uma pasta: subpastas visíveis (Hub) + ficheiros (Drive)
      case "listar": {
        const pasta = await pastaVisivel(b.pasta_id);
        const token = await tokenAcesso(adm);
        const q = `'${pasta.drive_id}' in parents and trashed=false`;
        const itens: any[] = [];
        let pagina = "";
        do {
          const r = await gj(token, `files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(${CAMPOS})&pageSize=200&orderBy=folder,name${pagina ? "&pageToken=" + pagina : ""}`);
          itens.push(...r.files); pagina = r.nextPageToken ?? "";
        } while (pagina);
        // Pastas criadas diretamente na Drive passam a ser conhecidas (herdam a visibilidade da pasta-mãe)
        const pastasDrive = itens.filter((f) => f.mimeType === PASTA);
        if (pastasDrive.length) {
          const { data: conhecidas } = await adm.from("drive_pastas").select("drive_id").in("drive_id", pastasDrive.map((f) => f.id));
          const novas = pastasDrive.filter((f) => !(conhecidas ?? []).some((c) => c.drive_id === f.id));
          if (novas.length) await adm.from("drive_pastas").insert(novas.map((f) => ({
            obra_id: pasta.obra_id, parent_id: pasta.id, drive_id: f.id, nome: f.name, area: pasta.area,
            vis_papeis: pasta.vis_papeis, vis_utilizadores: pasta.vis_utilizadores })));
        }
        const { data: subpastas } = await quem.from("drive_pastas").select("id, nome, vis_papeis, vis_utilizadores").eq("parent_id", pasta.id).order("nome");
        // caminho (migalhas) até à pasta de topo da área
        const caminho: any[] = [];
        for (let p: any = pasta; p && p.area !== "raiz"; ) {
          caminho.unshift({ id: p.id, nome: p.nome });
          if (!p.parent_id) break;
          const { data } = await quem.from("drive_pastas").select("id, parent_id, nome, area").eq("id", p.parent_id).maybeSingle();
          p = data;
        }
        return json(200, {
          pasta: { id: pasta.id, nome: pasta.nome, area: pasta.area, vis_papeis: pasta.vis_papeis, vis_utilizadores: pasta.vis_utilizadores },
          caminho, subpastas: subpastas ?? [],
          ficheiros: itens.filter((f) => f.mimeType !== PASTA),
          pode_carregar: podeCarregar(pasta.area), pode_gerir: gestor,
        });
      }

      case "miniatura": {
        const token = await tokenAcesso(adm);
        const { f } = await ficheiroVisivel(token, b.ficheiro_id);
        if (!f.thumbnailLink) throw new Erro(404, "Sem miniatura.");
        const r = await g(token, f.thumbnailLink.replace(/=s\d+$/, "=s400"));
        if (!r.ok) throw new Erro(404, "Sem miniatura.");
        return new Response(r.body, { headers: { ...h, "Content-Type": r.headers.get("Content-Type") ?? "image/jpeg", "Cache-Control": "private, max-age=3600" } });
      }

      case "descarregar": {
        const token = await tokenAcesso(adm);
        const { f } = await ficheiroVisivel(token, b.ficheiro_id);
        const googleDoc = f.mimeType.startsWith("application/vnd.google-apps");
        const r = await g(token, googleDoc
          ? `files/${f.id}/export?mimeType=application/pdf`
          : `files/${f.id}?alt=media`);
        if (!r.ok) throw new Erro(502, "Não foi possível descarregar o ficheiro.");
        const nome = googleDoc ? `${f.name}.pdf` : f.name;
        return new Response(r.body, { headers: { ...h,
          "Content-Type": googleDoc ? "application/pdf" : (f.mimeType || "application/octet-stream"),
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nome)}` } });
      }

      // Carregamento direto do browser para a Drive (sessão "resumable"), sem passar o ficheiro por aqui
      case "iniciar_carregamento": {
        const pasta = await pastaVisivel(b.pasta_id);
        if (!podeCarregar(pasta.area)) throw new Erro(403, pasta.area === "documentos"
          ? "Só ADMIN, Administrador e Obra podem carregar documentos." : "Não pode carregar ficheiros aqui.");
        const nome = String(b.nome ?? "").trim().slice(0, 200), tipo = String(b.tipo ?? "") || "application/octet-stream";
        if (!nome) throw new Erro(400, "Ficheiro sem nome.");
        if (pasta.area === "fotografias" && !/^(image|video)\//.test(tipo)) throw new Erro(400, "Nas Fotos só se podem carregar fotografias e vídeos.");
        const token = await tokenAcesso(adm);
        const r = await g(token, "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name", {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": tipo,
            ...(b.tamanho ? { "X-Upload-Content-Length": String(b.tamanho) } : {}), "Origin": req.headers.get("Origin") ?? ORIGENS[0] },
          body: JSON.stringify({ name: nome, parents: [pasta.drive_id] }),
        });
        const url = r.headers.get("Location");
        if (!r.ok || !url) { console.error("resumable", r.status, await r.text()); throw new Erro(502, "Não foi possível iniciar o envio."); }
        return json(200, { url });
      }

      case "criar_pasta": {
        if (!gestor) throw new Erro(403, "Só ADMIN e Administrador criam pastas.");
        const pai = await pastaVisivel(b.pasta_id);
        if (pai.area === "raiz") throw new Erro(400, "Crie as pastas dentro de Documentos ou Fotografias.");
        const nome = String(b.nome ?? "").trim().replace(/[\/\\]/g, "-").slice(0, 120);
        if (!nome) throw new Erro(400, "Indique o nome da pasta.");
        const token = await tokenAcesso(adm);
        const nova = await gj(token, "files?fields=id", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: nome, mimeType: PASTA, parents: [pai.drive_id] }) });
        const { data } = await adm.from("drive_pastas").insert({ obra_id: pai.obra_id, parent_id: pai.id, drive_id: nova.id, nome, area: pai.area,
          vis_papeis: pai.vis_papeis, vis_utilizadores: pai.vis_utilizadores }).select("id").single();
        return json(200, { id: data!.id });
      }

      case "apagar_ficheiro": {
        if (!gestor) throw new Erro(403, "Só ADMIN e Administrador apagam ficheiros.");
        const token = await tokenAcesso(adm);
        const { f } = await ficheiroVisivel(token, b.ficheiro_id);
        await gj(token, `files/${f.id}?fields=id`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) });
        return json(200, { ok: true });
      }

      case "apagar_pasta": {
        if (!gestor) throw new Erro(403, "Só ADMIN e Administrador apagam pastas.");
        const pasta = await pastaVisivel(b.pasta_id);
        if (pasta.area === "raiz" || !pasta.parent_id) throw new Erro(400, "Esta pasta não pode ser apagada.");
        const { data: pai } = await adm.from("drive_pastas").select("area").eq("id", pasta.parent_id).single();
        if (pai?.area === "raiz") throw new Erro(400, "As pastas Documentos e Fotografias não podem ser apagadas.");
        const token = await tokenAcesso(adm);
        await gj(token, `files/${pasta.drive_id}?fields=id`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) });
        await adm.from("drive_pastas").delete().eq("id", pasta.id);
        return json(200, { ok: true });
      }

      default:
        throw new Erro(400, "Ação desconhecida.");
    }
  } catch (e) {
    if (e instanceof Erro) return json(e.estado, { erro: e.message });
    console.error(e);
    return json(500, { erro: "Erro inesperado no Google Drive." });
  }
});
