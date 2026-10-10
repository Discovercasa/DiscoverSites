-- v0.6 — Abas da obra: Projeto, Entregas, Pedidos e falhas (aplicada em 2026-10-10).

create or replace function public.membro_obra(p_obra uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.papel_atual() is not null and public.tem_acesso(p_obra)
$$;

-- ---------- Projeto ----------
create table if not exists public.obra_projeto (
  obra_id uuid primary key references public.obras(id) on delete cascade,
  tipologia text,
  area_m2 numeric(8,2) check (area_m2 is null or area_m2 >= 0),
  pisos int check (pisos is null or pisos between 0 and 20),
  modelo text,
  arquiteto text,
  licenca text,
  notas text,
  updated_at timestamptz not null default now()
);
alter table public.obra_projeto enable row level security;
revoke all on public.obra_projeto from anon;
create policy "Membros veem o projeto" on public.obra_projeto for select to authenticated using (public.membro_obra(obra_id));
create policy "Gestores criam o projeto" on public.obra_projeto for insert to authenticated with check (public.eh_gestor());
create policy "Gestores editam o projeto" on public.obra_projeto for update to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
create policy "Gestores apagam o projeto" on public.obra_projeto for delete to authenticated using (public.eh_gestor());

-- ---------- Entregas ----------
create or replace function public.ve_entregas(p_obra uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.membro_obra(p_obra) and public.papel_atual() <> 'cliente'
$$;
create or replace function public.edita_entregas(p_obra uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_gestor() or (public.papel_atual() = 'obra' and public.membro_obra(p_obra))
$$;

create table if not exists public.entregas (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras(id) on delete cascade,
  data date not null default current_date,
  fornecedor text,
  estado text not null default 'entregue' check (estado in ('prevista', 'entregue')),
  recebido_por text,
  notas text,
  criado_por uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists entregas_obra on public.entregas (obra_id, data desc);
alter table public.entregas enable row level security;
revoke all on public.entregas from anon;
create policy "Veem entregas (sem Cliente)" on public.entregas for select to authenticated using (public.ve_entregas(obra_id));
create policy "Gestores e Obra registam entregas" on public.entregas for insert to authenticated with check (public.edita_entregas(obra_id));
create policy "Gestores e Obra editam entregas" on public.entregas for update to authenticated using (public.edita_entregas(obra_id)) with check (public.edita_entregas(obra_id));
create policy "Gestores e Obra apagam entregas" on public.entregas for delete to authenticated using (public.edita_entregas(obra_id));

create table if not exists public.entrega_itens (
  id uuid primary key default gen_random_uuid(),
  entrega_id uuid not null references public.entregas(id) on delete cascade,
  material text not null,
  quantidade numeric(12,3),
  unidade text,
  ordem int not null default 0
);
alter table public.entrega_itens enable row level security;
revoke all on public.entrega_itens from anon;
create policy "Veem itens de entregas" on public.entrega_itens for select to authenticated
  using (exists (select 1 from public.entregas e where e.id = entrega_id and public.ve_entregas(e.obra_id)));
create policy "Registam itens de entregas" on public.entrega_itens for insert to authenticated
  with check (exists (select 1 from public.entregas e where e.id = entrega_id and public.edita_entregas(e.obra_id)));
create policy "Editam itens de entregas" on public.entrega_itens for update to authenticated
  using (exists (select 1 from public.entregas e where e.id = entrega_id and public.edita_entregas(e.obra_id)))
  with check (exists (select 1 from public.entregas e where e.id = entrega_id and public.edita_entregas(e.obra_id)));
create policy "Apagam itens de entregas" on public.entrega_itens for delete to authenticated
  using (exists (select 1 from public.entregas e where e.id = entrega_id and public.edita_entregas(e.obra_id)));

-- ---------- Pedidos e falhas ----------
create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  obra_id uuid not null references public.obras(id) on delete cascade,
  tipo text not null check (tipo in ('material', 'falha', 'ferramenta', 'outro')),
  prioridade text not null default 'normal' check (prioridade in ('baixa', 'normal', 'urgente')),
  descricao text not null check (length(trim(descricao)) > 0),
  estado text not null default 'aberto' check (estado in ('aberto', 'fechado')),
  foto_path text,
  criado_por uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  fechado_por uuid references auth.users(id) on delete set null,
  fechado_em timestamptz
);
create index if not exists pedidos_obra on public.pedidos (obra_id, estado, created_at desc);
alter table public.pedidos enable row level security;
revoke all on public.pedidos from anon;
create policy "Membros veem pedidos" on public.pedidos for select to authenticated using (public.membro_obra(obra_id));
create policy "Membros criam pedidos" on public.pedidos for insert to authenticated
  with check (public.membro_obra(obra_id) and criado_por = auth.uid() and estado = 'aberto' and fechado_por is null);
create policy "Gestores ou autor fecham pedidos" on public.pedidos for update to authenticated
  using (public.membro_obra(obra_id) and (public.eh_gestor() or criado_por = auth.uid()))
  with check (public.membro_obra(obra_id) and (public.eh_gestor() or criado_por = auth.uid()));
create policy "Gestores apagam pedidos" on public.pedidos for delete to authenticated using (public.eh_gestor());

create or replace function public.pedidos_proteger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.obra_id is distinct from old.obra_id or new.criado_por is distinct from old.criado_por then
    raise exception 'Não é possível mudar a obra ou o autor do pedido.';
  end if;
  if not public.eh_gestor() and (new.tipo, new.prioridade, new.descricao, new.foto_path)
       is distinct from (old.tipo, old.prioridade, old.descricao, old.foto_path) then
    raise exception 'Só ADMIN e Administrador podem alterar o pedido.';
  end if;
  if new.estado = 'fechado' and old.estado = 'aberto' then
    new.fechado_por := auth.uid(); new.fechado_em := now();
  elsif new.estado = 'aberto' then
    new.fechado_por := null; new.fechado_em := null;
  end if;
  return new;
end $$;
drop trigger if exists pedidos_proteger on public.pedidos;
create trigger pedidos_proteger before update on public.pedidos for each row execute function public.pedidos_proteger();

create table if not exists public.pedido_respostas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  texto text not null check (length(trim(texto)) > 0),
  autor uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.pedido_respostas enable row level security;
revoke all on public.pedido_respostas from anon;
create policy "Membros veem respostas" on public.pedido_respostas for select to authenticated
  using (exists (select 1 from public.pedidos p where p.id = pedido_id and public.membro_obra(p.obra_id)));
create policy "Membros respondem" on public.pedido_respostas for insert to authenticated
  with check (autor = auth.uid() and exists (select 1 from public.pedidos p where p.id = pedido_id and public.membro_obra(p.obra_id)));
create policy "Autor ou gestor apaga resposta" on public.pedido_respostas for delete to authenticated
  using (autor = auth.uid() or public.eh_gestor());

create or replace function public.pedidos_abertos()
returns table(obra_id uuid, obra text, abertos int, urgentes int)
language sql stable security definer set search_path = public as $$
  select o.id, coalesce(o.codigo || ' · ', '') || o.nome, count(*)::int, count(*) filter (where p.prioridade = 'urgente')::int
  from public.pedidos p join public.obras o on o.id = p.obra_id
  where p.estado = 'aberto' and public.membro_obra(p.obra_id)
  group by o.id, o.codigo, o.nome
  order by count(*) filter (where p.prioridade = 'urgente') desc, count(*) desc
$$;

-- ---------- Fotografias dos pedidos (Storage, privado) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pedidos', 'pedidos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

create policy "Membros veem fotos de pedidos" on storage.objects for select to authenticated
  using (bucket_id = 'pedidos' and public.membro_obra(((storage.foldername(name))[1])::uuid));
create policy "Membros carregam fotos de pedidos" on storage.objects for insert to authenticated
  with check (bucket_id = 'pedidos' and public.membro_obra(((storage.foldername(name))[1])::uuid));
create policy "Gestores apagam fotos de pedidos" on storage.objects for delete to authenticated
  using (bucket_id = 'pedidos' and public.eh_gestor());

revoke all on function public.membro_obra(uuid), public.ve_entregas(uuid), public.edita_entregas(uuid), public.pedidos_abertos() from public, anon;
grant execute on function public.membro_obra(uuid), public.ve_entregas(uuid), public.edita_entregas(uuid), public.pedidos_abertos() to authenticated;
