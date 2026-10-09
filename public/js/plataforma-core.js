// plataforma-core: ligação partilhada ao Supabase "Sites".
// Só contém a chave PÚBLICA (publishable). A segurança dos dados é garantida
// pelas políticas RLS na base de dados, não por esta chave.
(function () {
  const URL = 'https://swpqelomnbmytwoppccb.supabase.co';
  const CHAVE_PUBLICA = 'sb_publishable_uTaBOufBrpU5Tiab1MvF7A_izETC11r';

  if (!window.supabase) {
    console.error('plataforma-core: falta carregar o supabase-js antes deste ficheiro.');
    return;
  }

  window.PlataformaCore = {
    url: URL,
    cliente: window.supabase.createClient(URL, CHAVE_PUBLICA),
    papeis: {
      admin: 'ADMIN',
      administrador: 'Administrador',
      obra: 'Obra',
      subempreiteiro: 'Subempreiteiro',
      cliente: 'Cliente'
    }
  };
})();
