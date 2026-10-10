-- v0.3 — Ficha da obra, com campos visíveis conforme o tipo de utilizador (aplicada em 2026-10-10).

alter table public.obras add column if not exists codigo text;
alter table public.obras add column if not exists morada text;
alter table public.obras add column if not exists localidade text;
alter table public.obras add column if not exists latitude numeric(9,6);
alter table public.obras add column if not exists longitude numeric(9,6);
alter table public.obras add column if not exists estado text not null default 'preparacao';
alter table public.obras add column if not exists data_inicio date;
alter table public.obras add column if not exists data_fim_prevista date;
alter table public.obras add column if not exists data_fim_real date;
alter table public.obras add column if not exists responsavel_id uuid references auth.users(id) on delete set null;
alter table public.obras add column if not exists cliente_id uuid references auth.users(id) on delete set null;
alter table public.obras add column if not exists notas text;

alter table public.obras drop constraint if exists obras_estado_check;
alter table public.obras add constraint obras_estado_check
  check (estado in ('preparacao', 'em_curso', 'concluida', 'suspensa'));
alter table public.obras drop constraint if exists obras_coordenadas_check;
alter table public.obras add constraint obras_coordenadas_check
  check ((latitude is null or latitude between -90 and 90) and (longitude is null or longitude between -180 and 180));
create unique index if not exists obras_codigo_unico on public.obras (lower(codigo)) where codigo is not null;

-- Campos sensíveis (cliente, notas) não se leem diretamente da tabela: só pela função obras_visiveis() (D15)
revoke select on public.obras from authenticated, anon;
grant select (id, nome, codigo, morada, localidade, latitude, longitude, estado,
              data_inicio, data_fim_prevista, data_fim_real, responsavel_id, criado_por, created_at)
  on public.obras to authenticated;

create or replace function public.obras_validar_cliente()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.cliente_id is not null then
    if not exists (select 1 from public.profiles where id = new.cliente_id and papel = 'cliente') then
      raise exception 'O cliente tem de ser uma conta do tipo Cliente.';
    end if;
    insert into public.obra_membros (obra_id, user_id) values (new.id, new.cliente_id) on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists obras_validar_cliente on public.obras;
create trigger obras_validar_cliente after insert or update of cliente_id on public.obras
  for each row execute function public.obras_validar_cliente();

create or replace function public.obras_visiveis()
returns table(
  id uuid, codigo text, nome text, morada text, localidade text, latitude numeric, longitude numeric,
  estado text, data_inicio date, data_fim_prevista date, data_fim_real date,
  responsavel_id uuid, responsavel_nome text,
  cliente_id uuid, cliente_nome text, cliente_email text, notas text,
  ve_cliente boolean, ve_notas boolean, ve_membros boolean)
language sql stable security definer set search_path = public as $$
  with eu as (select public.papel_atual() as papel, public.eh_gestor() as gestor)
  select o.id, o.codigo, o.nome, o.morada, o.localidade, o.latitude, o.longitude,
         o.estado, o.data_inicio, o.data_fim_prevista, o.data_fim_real,
         o.responsavel_id, rp.nome,
         case when v.cli then o.cliente_id end,
         case when v.cli then cp.nome end,
         case when v.cli then cu.email::text end,
         case when v.notas then o.notas end,
         v.cli, v.notas, v.membros
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

create or replace function public.listar_membros_obra(p_obra uuid)
returns table(user_id uuid, nome text, papel text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.eh_gestor() or (public.papel_atual() = 'obra' and public.tem_acesso(p_obra))) then
    raise exception 'Sem permissão.';
  end if;
  return query select m.user_id, p.nome, p.papel from public.obra_membros m
    join public.profiles p on p.id = m.user_id where m.obra_id = p_obra order by p.nome;
end $$;

revoke all on function public.obras_visiveis(), public.listar_membros_obra(uuid) from public, anon;
grant execute on function public.obras_visiveis(), public.listar_membros_obra(uuid) to authenticated;
