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
  for (const f of ficheiros()) {
    if (ignorar.includes(path.basename(f))) continue;
    const txt = fs.readFileSync(f, 'utf8');
    for (const [re, desc] of proibidos)
      exigir(!re.test(txt), `${desc} em ${path.relative(RAIZ, f)}`);
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
    exigir(new RegExp(`create\\s+policy[\\s\\S]*?on\\s+(?:[\\w"]+\\.)?"?${nome}"?[\\s\\S]*?auth\\.uid\\(\\)`).test(sql),
      `tabela "${t}" sem política com auth.uid()`);
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

teste('D6', 'interface em português de Portugal', () => {
  exigir(/<html[^>]*lang="pt-PT"/.test(html), 'falta lang="pt-PT" no <html>');
});

teste('D7', 'Hub em home.discovercasa.pt', () => {
  exigir(/<link[^>]*rel="canonical"[^>]*href="https:\/\/home\.discovercasa\.pt\/"/.test(html),
    'falta <link rel="canonical" href="https://home.discovercasa.pt/">');
  exigir(/home\.discovercasa\.pt/.test(ler('README.md')), 'README não indica o domínio');
});

teste('—', 'ROADMAP marca a versão atual', () => {
  if (/[a-z]$/.test(versaoNotas || '')) return; // letras entre versões não vão ao roadmap
  exigir(new RegExp(`✅\\s*${versaoNotas?.replace('.', '\\.')}\\b`).test(ler('ROADMAP.md')),
    `${versaoNotas} não está marcada com ✅ no ROADMAP.md`);
});

console.log(`\n${passos} passaram, ${falhas} falhas`);
process.exit(falhas ? 1 : 0);
