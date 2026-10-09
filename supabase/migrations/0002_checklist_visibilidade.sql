-- v0.2 — Checklist no Hub: visibilidade por tipo de utilizador / colaborador (aplicada em 2026-10-10).
-- Vazio = visível para todos. ADMIN e Administrador veem sempre tudo.
-- Conversão de dados feita à parte: os checks que estavam a seguir a um título passaram a ser filhos desse título.

alter table public.fases add column if not exists vis_papeis text[] not null default '{}';
alter table public.fases add column if not exists vis_utilizadores uuid[] not null default '{}';
alter table public.items add column if not exists vis_papeis text[] not null default '{}';
alter table public.items add column if not exists vis_utilizadores uuid[] not null default '{}';

create or replace function public.eh_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_gestor()
$$;

create or replace function public.eh_super()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and ativo and papel = 'admin')
$$;

create or replace function public.papel_atual()
returns text language sql stable security definer set search_path = public as $$
  select papel from public.profiles where id = auth.uid() and ativo
$$;

create or replace function public.cumpre_visibilidade(p_papeis text[], p_utilizadores uuid[])
returns boolean language sql stable security definer set search_path = public as $$
  select (coalesce(cardinality(p_papeis), 0) = 0 and coalesce(cardinality(p_utilizadores), 0) = 0)
      or public.papel_atual() = any (p_papeis)
      or auth.uid() = any (p_utilizadores)
$$;

create or replace function public.pode_ver_fase(p_fase uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_gestor() or exists (
    select 1 from public.fases f
    where f.id = p_fase and public.papel_atual() is not null
      and public.cumpre_visibilidade(f.vis_papeis, f.vis_utilizadores))
$$;

create or replace function public.pode_ver_item(p_item uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_gestor() or (
    public.papel_atual() is not null
    and public.pode_ver_fase((select fase_id from public.items where id = p_item))
    and not exists (
      select 1 from public.items i
      where i.id in (select * from public.item_ancestros(p_item))
        and not public.cumpre_visibilidade(i.vis_papeis, i.vis_utilizadores)))
$$;

create or replace function public.tem_acesso_item(p_obra uuid, p_item uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (public.tem_acesso(p_obra)
          or exists (select 1 from public.item_partilhas ip
                     where ip.obra_id = p_obra and ip.user_id = auth.uid()
                       and ip.item_id in (select * from public.item_ancestros(p_item))))
     and public.pode_ver_item(p_item)
$$;

drop policy if exists "Todos veem as fases" on public.fases;
create policy "Ve fases visiveis" on public.fases for select to authenticated using (public.pode_ver_fase(id));

drop policy if exists "Todos veem os itens" on public.items;
create policy "Ve itens visiveis" on public.items for select to authenticated using (public.pode_ver_item(id));

drop policy if exists "Admin ou responsavel ignora" on public.item_ignorados;
create policy "Gestores escondem na obra" on public.item_ignorados for insert to authenticated with check (public.eh_gestor());
drop policy if exists "Admin ou responsavel reativa" on public.item_ignorados;
create policy "Gestores voltam a mostrar na obra" on public.item_ignorados for delete to authenticated using (public.eh_gestor());

alter table public.fases drop constraint if exists fases_vis_papeis_check;
alter table public.fases add constraint fases_vis_papeis_check
  check (vis_papeis <@ array['admin','administrador','obra','subempreiteiro','cliente']::text[]);
alter table public.items drop constraint if exists items_vis_papeis_check;
alter table public.items add constraint items_vis_papeis_check
  check (vis_papeis <@ array['admin','administrador','obra','subempreiteiro','cliente']::text[]);

create or replace function public.listar_pessoas()
returns table(id uuid, nome text, utilizador text, papel text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_gestor() then raise exception 'Sem permissão.'; end if;
  return query select p.id, p.nome, p.utilizador, p.papel from public.profiles p where p.ativo order by p.nome;
end $$;

revoke all on function public.listar_pessoas() from public, anon;
grant execute on function public.listar_pessoas() to authenticated;
revoke all on function public.papel_atual(), public.cumpre_visibilidade(text[], uuid[]), public.pode_ver_fase(uuid), public.pode_ver_item(uuid) from anon;
