-- v0.7 — Google Drive: ligação (privada) e pastas das obras com visibilidade (aplicada em 2026-10-10).

-- Ligação à Drive: só a função do servidor (chave de serviço) lê e escreve. Sem políticas = nenhum utilizador acede. (D19)
create table if not exists public.drive_config (
  id int primary key default 1 check (id = 1),
  refresh_token text,
  access_token text,
  access_expira timestamptz,
  email text,
  raiz_id text,
  obras_id text,
  ligado_em timestamptz,
  ligado_por uuid references auth.users(id) on delete set null,
  estado_oauth text,
  estado_criado timestamptz
);
alter table public.drive_config enable row level security;
revoke all on public.drive_config from anon, authenticated;

create or replace function public.drive_estado()
returns table(ligado boolean, email text, ligado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select coalesce(c.refresh_token is not null, false), c.email, c.ligado_em
  from (select 1) x left join public.drive_config c on c.id = 1
  where public.eh_gestor()
$$;

create table if not exists public.drive_pastas (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras(id) on delete cascade,
  parent_id uuid references public.drive_pastas(id) on delete cascade,
  drive_id text not null unique,
  nome text not null,
  area text not null check (area in ('raiz', 'documentos', 'fotografias')),
  vis_papeis text[] not null default '{}',
  vis_utilizadores uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint drive_pastas_vis_papeis_check check (vis_papeis <@ array['admin','administrador','obra','subempreiteiro','cliente']::text[])
);
create index if not exists drive_pastas_obra on public.drive_pastas (obra_id, parent_id);
alter table public.drive_pastas enable row level security;
revoke all on public.drive_pastas from anon;

create or replace function public.pode_ver_pasta(p_pasta uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with recursive acima as (
    select id, parent_id, vis_papeis, vis_utilizadores, obra_id from public.drive_pastas where id = p_pasta
    union all
    select p.id, p.parent_id, p.vis_papeis, p.vis_utilizadores, p.obra_id
    from public.drive_pastas p join acima a on p.id = a.parent_id
  )
  select exists (select 1 from acima)
     and (public.eh_gestor() or (
       public.membro_obra((select obra_id from acima limit 1))
       and not exists (select 1 from acima where not public.cumpre_visibilidade(vis_papeis, vis_utilizadores))))
$$;

create policy "Ve pastas visiveis" on public.drive_pastas for select to authenticated using (public.pode_ver_pasta(id));
create policy "Gestores mudam visibilidade e nome" on public.drive_pastas for update to authenticated
  using (public.eh_gestor()) with check (public.eh_gestor());
-- Criar e apagar pastas: só pela função do servidor (que também cria/apaga na Drive).

revoke all on function public.drive_estado(), public.pode_ver_pasta(uuid) from public, anon;
grant execute on function public.drive_estado(), public.pode_ver_pasta(uuid) to authenticated;
