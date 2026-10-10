-- v0.7b — Foto de capa da obra (aplicada em 2026-10-11).
-- Armazenamento privado "capas": todos os membros da obra veem; só ADMIN/Administrador carregam, substituem e apagam. (D20)
alter table public.obras add column if not exists capa_path text;
grant select (capa_path) on public.obras to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('capas', 'capas', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Membros veem capas" on storage.objects for select to authenticated
  using (bucket_id = 'capas' and public.membro_obra(((storage.foldername(name))[1])::uuid));
create policy "Gestores carregam capas" on storage.objects for insert to authenticated
  with check (bucket_id = 'capas' and public.eh_gestor());
create policy "Gestores substituem capas" on storage.objects for update to authenticated
  using (bucket_id = 'capas' and public.eh_gestor()) with check (bucket_id = 'capas' and public.eh_gestor());
create policy "Gestores apagam capas" on storage.objects for delete to authenticated
  using (bucket_id = 'capas' and public.eh_gestor());

-- A lista de obras passa a incluir a capa (resto igual à 0003)
drop function if exists public.obras_visiveis();
create function public.obras_visiveis()
returns table(
  id uuid, codigo text, nome text, morada text, localidade text, latitude numeric, longitude numeric,
  estado text, data_inicio date, data_fim_prevista date, data_fim_real date,
  responsavel_id uuid, responsavel_nome text,
  cliente_id uuid, cliente_nome text, cliente_email text, notas text,
  ve_cliente boolean, ve_notas boolean, ve_membros boolean, capa_path text)
language sql stable security definer set search_path = public as $$
  with eu as (select public.papel_atual() as papel, public.eh_gestor() as gestor)
  select o.id, o.codigo, o.nome, o.morada, o.localidade, o.latitude, o.longitude,
         o.estado, o.data_inicio, o.data_fim_prevista, o.data_fim_real,
         o.responsavel_id, rp.nome,
         case when v.cli then o.cliente_id end,
         case when v.cli then cp.nome end,
         case when v.cli then cu.email::text end,
         case when v.notas then o.notas end,
         v.cli, v.notas, v.membros, o.capa_path
  from public.obras o
  cross join eu
  left join public.profiles rp on rp.id = o.responsavel_id
  left join public.profiles cp on cp.id = o.cliente_id
  left join auth.users cu on cu.id = o.cliente_id
  cross join lateral (select
      (eu.gestor or eu.papel = 'obra' or (eu.papel = 'cliente' and o.cliente_id = auth.uid())) as cli,
      (eu.gestor or eu.papel = 'obra') as notas,
      (eu.gestor or eu.papel = 'obra') as membros) v
  where eu.papel is not null and public.tem_acesso_obra_visivel(o.id)
  order by o.codigo nulls last, o.nome
$$;
revoke all on function public.obras_visiveis() from public, anon;
grant execute on function public.obras_visiveis() to authenticated;
