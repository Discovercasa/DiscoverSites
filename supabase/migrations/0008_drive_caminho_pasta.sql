-- v0.7a — Caminho (migalhas) de uma pasta numa só consulta (aplicada em 2026-10-11).
create or replace function public.caminho_pasta(p_pasta uuid)
returns table(id uuid, nome text, nivel int)
language sql stable security definer set search_path = public as $$
  with recursive acima as (
    select d.id, d.parent_id, d.nome, d.area, 0 as nivel from public.drive_pastas d where d.id = p_pasta
    union all
    select p.id, p.parent_id, p.nome, p.area, a.nivel + 1 from public.drive_pastas p join acima a on p.id = a.parent_id
  )
  select a.id, a.nome, a.nivel from acima a
  where a.area <> 'raiz' and public.pode_ver_pasta(p_pasta)
  order by a.nivel desc
$$;
revoke all on function public.caminho_pasta(uuid) from public, anon;
grant execute on function public.caminho_pasta(uuid) to authenticated;
