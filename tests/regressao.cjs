// Testes de regressão: um teste por Decisão fixa (ver PATCH NOTES.md).
// Correr: NODE_PATH=$(npm root -g) node tests/regressao.cjs
// Tem de terminar com 0 falhas.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const ler = (f) => fs.readFileSync(path.join(RAIZ, f), 'utf8');

let falhas = 0, passos = 0;
function teste(id, nome, fn) {
  try { fn(); passos++; console.log(`  ✓ ${id} ${nome}`); }
  catch (e) { falhas++; console.log(`  ✗ ${id} ${nome}\n      → ${e.message}`); }
}
function exigir(cond, msg) { if (!cond) throw new Error(msg); }

// Todos os ficheiros de texto do repo (sem node_modules/.git)
function ficheiros(dir = RAIZ, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', '.wrangler'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) ficheiros(p, out);
    else if (/\.(html|js|cjs|mjs|ts|json|sql|toml|md)$/.test(e.name)) out.push(p);
  }
  return out;
}

const html = ler('public/index.html');
const notas = ler('PATCH NOTES.md');

console.log('Regressão — Decisões fixas\n');

teste('D1', 'nunca credenciais privadas no código', () => {
  const proibidos = [
    [/service_role/i, 'menção a service_role'],
    [/sb_secret_[A-Za-z0-9_-]+/, 'chave secreta do Supabase'],
    [/SUPABASE_SERVICE/i, 'variável de service key'],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'chave privada'],
    [/(password|passwd|senha)\s*[:=]\s*['"][^'"]{4,}['"]/i, 'password no código'],
  ];
  const ignorar = ['CLAUDE.md', 'PATCH NOTES.md', 'README.md', 'regressao.cjs'];
  const funcoes = path.join(RAIZ, 'supabase', 'functions') + path.sep;
  for (const f of ficheiros()) {
    if (ignorar.includes(path.basename(f))) continue;
    const txt = fs.readFileSync(f, 'utf8');
    const ehFuncao = f.startsWith(funcoes);
    for (const [re, desc] of proibidos) {
      // As Edge Functions podem LER a chave de serviço do ambiente do Supabase (nunca escrevê-la).
      if (ehFuncao && /service/i.test(desc)) continue;
      exigir(!re.test(txt), `${desc} em ${path.relative(RAIZ, f)}`);
    }
    if (ehFuncao)
      for (const linha of txt.split('\n').filter(l => /SERVICE_ROLE/.test(l)))
        exigir(/Deno\.env\.get\(\s*["']SUPABASE_SERVICE_ROLE_KEY["']\s*\)/.test(linha),
          `chave de serviço fora de Deno.env em ${path.relative(RAIZ, f)}`);
    // JWT com role service_role
    for (const jwt of txt.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || []) {
      const corpo = Buffer.from(jwt.split('.')[1], 'base64url').toString();
      exigir(!/service_role/.test(corpo), `JWT service_role em ${path.relative(RAIZ, f)}`);
    }
  }
  exigir(!fs.existsSync(path.join(RAIZ, '.env')), 'ficheiro .env no repositório');
});

teste('D2', 'todas as tabelas com RLS', () => {
  const dir = path.join(RAIZ, 'supabase/migrations');
  if (!fs.existsSync(dir)) return;
  const sql = fs.readdirSync(dir).filter(f => f.endsWith('.sql'))
    .map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n').toLowerCase();
  const tabelas = [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([\w."]+)/g)]
    .map(m => m[1].replace(/"/g, ''));
  for (const t of tabelas) {
    const nome = t.split('.').pop();
    const re = new RegExp(`alter\\s+table\\s+(?:only\\s+)?(?:[\\w"]+\\.)?"?${nome}"?\\s+enable\\s+row\\s+level\\s+security`);
    exigir(re.test(sql), `tabela "${t}" sem RLS`);
    // Tabelas só do servidor: RLS ligada, sem políticas e fechadas a anon e authenticated
    if (new RegExp(`revoke all on public\\.${nome} from anon, authenticated`).test(sql)) continue;
    exigir(new RegExp(`create\\s+policy[^;]*?on\\s+(?:[\\w"]+\\.)?"?${nome}"?[^;]*?(auth\\.uid\\(\\)|public\\.(eh_gestor|eh_admin|membro_obra|ve_entregas|edita_entregas|minha_ficha_id|tem_acesso\\w*|pode_ver_\\w+)\\()`).test(sql),
      `tabela "${t}" sem política com auth.uid() ou função de permissão`);
  }
});

const versaoApp = (html.match(/const\s+APP_VERSAO\s*=\s*['"]([^'"]+)['"]/) || [])[1];
const historico = notas.split(/^##\s+Histórico/m)[1] || '';
const versaoNotas = (historico.match(/^###\s+(v\d+\.\d+[a-z]?)/m) || [])[1];

teste('D3', 'APP_VERSAO igual ao topo do Histórico', () => {
  exigir(versaoApp, 'APP_VERSAO não encontrado em public/index.html');
  exigir(versaoNotas, 'nenhuma versão no Histórico do PATCH NOTES.md');
  exigir(versaoApp === versaoNotas, `APP_VERSAO=${versaoApp} mas Patch Notes=${versaoNotas}`);
});

teste('D4', 'topo de NOVIDADES igual a APP_VERSAO, com os dois grupos', () => {
  const bloco = (html.match(/const\s+NOVIDADES\s*=\s*(\[[\s\S]*?\n\s*\]);/) || [])[1];
  exigir(bloco, 'NOVIDADES não encontrado');
  const NOVIDADES = Function(`return ${bloco}`)();
  exigir(NOVIDADES.length > 0, 'NOVIDADES vazio');
  exigir(NOVIDADES[0].versao === versaoApp, `topo de NOVIDADES=${NOVIDADES[0].versao}, APP_VERSAO=${versaoApp}`);
  for (const n of NOVIDADES) {
    exigir(Array.isArray(n.novas) && Array.isArray(n.alteracoes), `${n.versao} sem "novas"/"alteracoes"`);
    exigir(n.novas.length + n.alteracoes.length > 0, `${n.versao} sem texto`);
  }
});

teste('D5', 'site estático em public/', () => {
  exigir(fs.existsSync(path.join(RAIZ, 'public/index.html')), 'falta public/index.html');
});

teste('D6', 'todas as páginas em pt-PT e ligadas pelo plataforma-core', () => {
  for (const f of fs.readdirSync(path.join(RAIZ, 'public')).filter(f => f.endsWith('.html'))) {
    const p = ler('public/' + f);
    exigir(/<html[^>]*lang="pt-PT"/.test(p), `falta lang="pt-PT" em ${f}`);
    if (/supabase-js/.test(p)) exigir(/plataforma-core\.js/.test(p), `${f} usa o Supabase sem o plataforma-core`);
    exigir(!/createClient\(/.test(p), `${f} cria o seu próprio cliente Supabase`);
  }
});

teste('D7', 'Hub em hub.discovercasa.pt', () => {
  exigir(/<link[^>]*rel="canonical"[^>]*href="https:\/\/hub\.discovercasa\.pt\/"/.test(html),
    'falta <link rel="canonical" href="https://hub.discovercasa.pt/">');
  exigir(/hub\.discovercasa\.pt/.test(ler('README.md')), 'README não indica o domínio');
});

teste('D8', 'sem registo público no site', () => {
  for (const f of ficheiros(path.join(RAIZ, 'public')))
    exigir(!/\.signUp\s*\(/.test(fs.readFileSync(f, 'utf8')), `signUp() em ${path.relative(RAIZ, f)}`);
});

teste('D9', 'README tem a matriz com os 5 papéis', () => {
  const r = ler('README.md');
  for (const p of ['ADMIN', 'Administrador', 'Obra', 'Subempreiteiro', 'Cliente'])
    exigir(new RegExp(`\\|[^\\n]*\\b${p}\\b`).test(r), `papel ${p} em falta na matriz`);
});

teste('D11', 'nenhuma coluna de PIN na base de dados', () => {
  const dir = path.join(RAIZ, 'supabase/migrations');
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sql')))
    exigir(!/\bpin\w*\s+(text|varchar|int|integer|bigint|numeric)\b/i.test(fs.readFileSync(path.join(dir, f), 'utf8')),
      `coluna de PIN em ${f}`);
});

teste('D13', 'o tipo de utilizador só muda pelo servidor', () => {
  const sql = fs.readdirSync(path.join(RAIZ, 'supabase/migrations')).filter(f => f.endsWith('.sql'))
    .map(f => ler('supabase/migrations/' + f)).join('\n');
  exigir(/profiles_proteger_e_sincronizar/.test(sql) && /current_user in \('authenticated', 'anon'\)/.test(sql),
    'falta o trigger que impede alterar o papel diretamente');
  for (const f of ficheiros(path.join(RAIZ, 'public'))) {
    const txt = fs.readFileSync(f, 'utf8');
    exigir(!/from\(['"]profiles['"]\)[\s\S]{0,200}?\.(update|upsert|insert)\(/.test(txt),
      `escrita direta em profiles em ${path.relative(RAIZ, f)}`);
  }
});

teste('D14', 'visibilidade da checklist aplicada na base de dados', () => {
  const sql = fs.readdirSync(path.join(RAIZ, 'supabase/migrations')).filter(f => f.endsWith('.sql'))
    .map(f => ler('supabase/migrations/' + f)).join('\n');
  exigir(/create policy "Ve fases visiveis" on public\.fases for select[\s\S]*?pode_ver_fase\(id\)/.test(sql), 'falta a política de leitura de fases');
  exigir(/create policy "Ve itens visiveis" on public\.items for select[\s\S]*?pode_ver_item\(id\)/.test(sql), 'falta a política de leitura de itens');
  exigir(/item_ancestros\(p_item\)[\s\S]*?cumpre_visibilidade/.test(sql), 'a visibilidade não é herdada dos pais');
});

teste('D15', 'cliente e notas da obra só pela função obras_visiveis', () => {
  const sql = fs.readdirSync(path.join(RAIZ, 'supabase/migrations')).filter(f => f.endsWith('.sql'))
    .map(f => ler('supabase/migrations/' + f)).join('\n');
  exigir(/revoke select on public\.obras from authenticated/.test(sql), 'a leitura direta de obras não está limitada');
  const grant = (sql.match(/grant select \(([^)]*)\)\s*on public\.obras to authenticated/) || [])[1];
  exigir(grant, 'falta a lista de colunas que se podem ler em obras');
  for (const proibida of ['notas', 'cliente_id'])
    exigir(!new RegExp(`\\b${proibida}\\b`).test(grant), `a coluna ${proibida} pode ser lida diretamente`);
  exigir(/raise exception 'O cliente tem de ser uma conta do tipo Cliente\.'/.test(sql), 'falta a validação do cliente');
  for (const f of fs.readdirSync(path.join(RAIZ, 'public'), { recursive: true }).filter(f => /\.(html|js)$/.test(f))) {
    const txt = ler('public/' + f);
    exigir(!/from\(['"]obras['"]\)\.select\([^)]*\b(notas|cliente_id)\b/.test(txt), `${f} lê campos sensíveis diretamente de obras`);
  }
});

teste('D10', 'dados pessoais da equipa só para ADMIN e Administrador', () => {
  const sql = fs.readdirSync(path.join(RAIZ, 'supabase/migrations')).filter(f => f.endsWith('.sql'))
    .map(f => ler('supabase/migrations/' + f)).join('\n');
  exigir(/alter table public\.colaboradores enable row level security/.test(sql), 'colaboradores sem RLS');
  const politicas = sql.match(/create policy [^;]*on public\.colaboradores[^;]*;/g) || [];
  exigir(politicas.length >= 4, 'faltam políticas em colaboradores');
  for (const p of politicas) {
    const regras = (p.match(/(using|with check)\s*\(([^;]*)\)/g) || []).join(' ');
    exigir(/eh_gestor\(\)/.test(regras) && !/\btrue\b|auth\.uid\(\)/.test(regras), `política demasiado aberta: ${p.slice(0, 60)}…`);
  }
  // Fora do módulo da equipa só se pode ler o id, o nome e as validades (nunca NIF, CC, IBAN, contactos…)
  for (const f of fs.readdirSync(path.join(RAIZ, 'public'), { recursive: true }).filter(f => /\.(js|html)$/.test(f) && !/colaboradores\.js$/.test(f)))
    for (const m of ler('public/' + f).matchAll(/from\(['"]colaboradores['"]\)\.select\(['"]([^'"]*)['"]/g)) {
      const cols = m[1].split(',').map(c => c.trim());
      exigir(cols.every(c => /^(id|nome|user_id|carta_validade|cc_validade|aptidao_validade)$/.test(c)), `${f} lê dados pessoais da equipa (${m[1]})`);
    }
});

teste('D16', 'férias: cada um vê as suas e só pede (não aprova)', () => {
  const sql = fs.readdirSync(path.join(RAIZ, 'supabase/migrations')).filter(f => f.endsWith('.sql'))
    .map(f => ler('supabase/migrations/' + f)).join('\n');
  const pol = (cmd) => (sql.match(new RegExp(`create policy [^;]*on public\\.ausencias for ${cmd}[^;]*;`)) || [''])[0];
  exigir(/eh_gestor\(\) or colaborador_id = public\.minha_ficha_id\(\)/.test(pol('select')), 'leitura de ausências demasiado aberta');
  exigir(/estado = 'pendente'/.test(pol('insert')) && /pedido_por = auth\.uid\(\)/.test(pol('insert')), 'um colaborador pode registar ausências já aprovadas');
  exigir(/using \(public\.eh_gestor\(\)\) with check \(public\.eh_gestor\(\)\)/.test(pol('update')), 'só gestores podem aprovar/alterar ausências');
  exigir(/estado = 'pendente'/.test(pol('delete')), 'um colaborador pode apagar ausências já aprovadas');
  exigir(/create policy "Gestores veem saldos" on public\.ferias_saldos for select to authenticated using \(public\.eh_gestor\(\)\)/.test(sql), 'saldos legíveis por todos');
});

teste('D17', 'abas da obra: só membros; Cliente sem entregas; pedidos fechados só por gestor ou autor', () => {
  const sql = fs.readdirSync(path.join(RAIZ, 'supabase/migrations')).filter(f => f.endsWith('.sql'))
    .map(f => ler('supabase/migrations/' + f)).join('\n');
  for (const t of ['obra_projeto', 'entregas', 'entrega_itens', 'pedidos', 'pedido_respostas'])
    exigir(new RegExp(`alter table public\\.${t} enable row level security`).test(sql), `${t} sem RLS`);
  exigir(/membro_obra\(p_obra\) and public\.papel_atual\(\) <> 'cliente'/.test(sql), 'o Cliente pode ver entregas');
  exigir(/"Gestores ou autor fecham pedidos"[^;]*eh_gestor\(\) or criado_por = auth\.uid\(\)/.test(sql), 'qualquer membro pode fechar pedidos');
  exigir(/Só ADMIN e Administrador podem alterar o pedido/.test(sql), 'o autor pode reescrever o pedido');
  exigir(/'pedidos', 'pedidos', false/.test(sql), 'as fotografias dos pedidos não estão num armazenamento privado');
  exigir(/bucket_id = 'pedidos' and public\.membro_obra/.test(sql), 'as fotografias dos pedidos não estão limitadas aos membros da obra');
});

teste('D18', 'endereços sem "#"', () => {
  for (const f of fs.readdirSync(path.join(RAIZ, 'public'), { recursive: true }).filter(f => /\.(html|js)$/.test(f))) {
    const txt = ler('public/' + f);
    exigir(!/href(:\s*|=)["'`]\/?#[a-z]/.test(txt), `${f} tem ligações com "#"`);
    exigir(!/location\.hash\s*=/.test(txt), `${f} muda de página com location.hash`);
  }
  exigir(!fs.existsSync(path.join(RAIZ, 'public/404.html')), 'um 404.html desliga o modo de página única da Cloudflare Pages');
});

teste('D19', 'Google Drive: ligação privada e pastas com visibilidade', () => {
  const sql = fs.readdirSync(path.join(RAIZ, 'supabase/migrations')).filter(f => f.endsWith('.sql'))
    .map(f => ler('supabase/migrations/' + f)).join('\n');
  exigir(/alter table public\.drive_config enable row level security/.test(sql), 'drive_config sem RLS');
  exigir(!/create policy [^;]*on public\.drive_config/.test(sql), 'drive_config não pode ter políticas (só o servidor lhe acede)');
  exigir(/revoke all on public\.drive_config from anon, authenticated/.test(sql), 'drive_config acessível a utilizadores');
  exigir(!/create policy [^;]*on public\.drive_pastas for (insert|delete|all)/.test(sql), 'pastas da Drive só se criam/apagam pelo servidor');
  exigir(/acima[\s\S]*cumpre_visibilidade\(vis_papeis, vis_utilizadores\)/.test(sql), 'a visibilidade das pastas não é herdada');
  for (const f of fs.readdirSync(path.join(RAIZ, 'public'), { recursive: true }).filter(f => /\.(html|js)$/.test(f))) {
    const txt = ler('public/' + f);
    exigir(!/refresh_token|GOOGLE_CLIENT_SECRET|client_secret/.test(txt), `${f} menciona credenciais do Google`);
    exigir(!/from\(['"]drive_config['"]\)/.test(txt), `${f} lê a ligação da Drive`);
  }
  const fn = ler('supabase/functions/drive/google.ts');
  exigir(/Deno\.env\.get\("GOOGLE_CLIENT_SECRET"\)/.test(fn), 'o segredo do Google tem de vir dos Secrets do Supabase');
});

teste('D20', 'capas das obras: privadas, só gestores mudam; memória do dia', () => {
  const sql = fs.readdirSync(path.join(RAIZ, 'supabase/migrations')).filter(f => f.endsWith('.sql'))
    .map(f => ler('supabase/migrations/' + f)).join('\n');
  exigir(/'capas', 'capas', false/.test(sql), 'as capas não estão num armazenamento privado');
  exigir(/"Membros veem capas"[^;]*membro_obra/.test(sql), 'as capas não estão limitadas aos membros da obra');
  for (const p of ['Gestores carregam capas', 'Gestores substituem capas', 'Gestores apagam capas'])
    exigir(new RegExp(`"${p}"[^;]*eh_gestor\\(\\)`).test(sql), `"${p}" não está limitado a ADMIN/Administrador`);
  const hub = ler('public/js/hub.js');
  exigir(/mem\.dia !== HOJE/.test(hub), 'a memória de onde se estava tem de recomeçar noutro dia');
});

teste('D21', 'controlo e veículos só para gestores; cartões só 4 dígitos; contactos sem Cliente', () => {
  const sql = fs.readdirSync(path.join(RAIZ, 'supabase/migrations')).filter(f => f.endsWith('.sql'))
    .map(f => ler('supabase/migrations/' + f)).join('\n');
  for (const t of ['veiculos', 'gps_registos', 'horas_extra']) {
    exigir(new RegExp(`alter table public\\.${t} enable row level security`).test(sql), `${t} sem RLS`);
    const pol = sql.match(new RegExp(`create policy [^;]*on public\\.${t}[^;]*;`, 'g')) || [];
    exigir(pol.length >= 4 && pol.every((p) => /eh_gestor\(\)/.test(p) && !/\btrue\b|auth\.uid\(\)/.test(p)), `${t} não está limitada a ADMIN/Administrador`);
  }
  exigir(/cartao_pontos_fim ~ '\^\[0-9\]\{4\}\$'/.test(sql) && /cartao_bp_fim ~ '\^\[0-9\]\{4\}\$'/.test(sql), 'os cartões podem guardar mais do que 4 dígitos');
  exigir(/case when eu\.papel <> 'cliente' then o\.contactos end/.test(sql), 'o Cliente pode ver os contactos de emergência e alojamento');
  const grant = (sql.match(/grant select \(([^)]*)\)\s*on public\.obras to authenticated/) || [])[1] || '';
  exigir(!/\bcontactos\b/.test(grant), 'os contactos podem ser lidos diretamente da tabela obras');
});

teste('D22', 'materiais e fornecedores só para gestores; histórico só pelo servidor', () => {
  const sql = fs.readdirSync(path.join(RAIZ, 'supabase/migrations')).filter(f => f.endsWith('.sql'))
    .map(f => ler('supabase/migrations/' + f)).join('\n');
  for (const t of ['fornecedores', 'materiais', 'material_precos', 'material_precos_historico']) {
    exigir(new RegExp(`alter table public\\.${t} enable row level security`).test(sql), `${t} sem RLS`);
    const pol = sql.match(new RegExp(`create policy [^;]*on public\\.${t} [^;]*;`, 'g')) || [];
    exigir(pol.length && pol.every((p) => /eh_gestor\(\)/.test(p) && !/\btrue\b|auth\.uid\(\)/.test(p)), `${t} não está limitada a ADMIN/Administrador`);
  }
  exigir(!/create policy [^;]*on public\.material_precos_historico for (insert|update|delete|all)/.test(sql), 'o histórico de preços pode ser escrito por utilizadores');
  exigir(/create trigger material_precos_guardar_historico before update on public\.material_precos/.test(sql), 'falta o trigger do histórico de preços');
});

teste('D23', 'leitura do Excel de materiais: medidas em metros, quantidades e granulometria', () => {
  const { medidas, ler } = require(path.join(RAIZ, 'public/js/materiais-importar.js'));
  const m = (t, un, d = '') => { const r = medidas(t, un, d); return [r.comprimento, r.largura, r.espessura, r.qtd_embalagem, r.qtd_unidade, r.resto].map((x) => x ?? '-').join('|'); };
  exigir(m('3/0,11/0,075', 'un') === '3|0.11|0.075|-|-|-', 'C/L/A em metros');
  exigir(m('500/015/200', 'un') === '0.5|0.15|0.2|-|-|-', 'milímetros e "015" convertidos para metros');
  exigir(m('8000x1200x100', 'm2') === '8|1.2|0.1|-|-|-', 'medidas com "x" em milímetros');
  exigir(m('25kg', 'un') === '-|-|-|25|kg|-', 'quantidade com unidade');
  exigir(m('100', 'cx') === '-|-|-|100|un|-', 'caixa com quantidade');
  exigir(m('11/22', 'm3') === '-|-|-|-|-|11/22', 'granulometria (brita) não é medida');
  exigir(m('manutenção', 'un') === '-|-|-|-|-|manutenção', 'texto fica para rever');
  const r = ler([[], ['Varão 12mm', 'Varões 12 mm', '6', null, 9.5, 'un', 0.25, null, 0.23, null, 'Conta corrente', 'Fornecedor X', null, null, 'Sim', 'Não, com quantidade minima'],
    ['Varão 12mm', 'Varões 12 mm', '6', null, 9.9, 'un', 0, null, 0.23, null, null, 'Fornecedor X', null, null, 'Sim', 'Sim', null, null, null, null, null, null, new Date('2026-01-01')]]);
  exigir(r.precos.length === 1 && r.repetidas === 1 && r.precos[0].preco === 9.9, 'linhas repetidas: fica a mais recente');
  exigir(r.precos[0].transporte === 'sim' && r.precos[0].transporte_incluido === 'sim', 'transporte por preço');
  exigir(ler([[], ['A', 'A', null, null, 1, 'un', 0, null, 0.23, null, null, 'F', null, null, 'Sim', 'Não, com quantidade minima']]).precos[0].transporte_incluido === 'qtd_minima', 'quantidade mínima');
  const mai = ler([[], ['X1', 'FITA DE REDE', null, null, 1, 'un', 0, null, 0.23, null, null, 'F'], ['X2', 'Fita de Rede', null, null, 2, 'un', 0, null, 0.23, null, null, 'f']]);
  exigir(new Set(mai.precos.map((p) => p.material)).size === 1 && mai.fornecedores.length === 1, 'nomes que só diferem nas maiúsculas têm de ficar juntos');
  const js = ler.toString() + require('fs').readFileSync(path.join(RAIZ, 'public/js/materiais.js'), 'utf8').split('async function aplicar')[1].split('document.addEventListener')[0];
  exigir(!/\.delete\(/.test(js), 'a importação não pode apagar nada');
});

teste('D24', 'materiais: editar na janela completa, botões sempre à vista', () => {
  const html = ler('public/index.html'), js = ler('public/js/materiais.js');
  for (const d of ['d-preco', 'd-fornecedor']) {
    const bloco = html.split(`<dialog id="${d}">`)[1].split('</dialog>')[0];
    exigir(/rodape-dialogo rodape-fixo/.test(bloco), `a janela ${d} tem de ter os botões fixos no fundo`);
  }
  const ficha = js.split('async function fichaMaterial')[1].split('function caixaConversoes')[0];
  exigir(!/text: 'Editar'/.test(ficha), 'dentro do material não há botões "Editar" (edita-se carregando no preço)');
  exigir(/mpm-nome/.test(js.split('function abrirPreco')[1].split('function calcular')[0]) && !/mp-bloco-material'\)\.hidden/.test(js), 'a janela de editar tem de mostrar o nome e a categoria do material');
});

teste('—', 'ROADMAP marca a versão atual', () => {
  if (/[a-z]$/.test(versaoNotas || '')) return; // letras entre versões não vão ao roadmap
  exigir(new RegExp(`✅\\s*${versaoNotas?.replace('.', '\\.')}\\b`).test(ler('ROADMAP.md')),
    `${versaoNotas} não está marcada com ✅ no ROADMAP.md`);
});

console.log(`\n${passos} passaram, ${falhas} falhas`);
process.exit(falhas ? 1 : 0);
