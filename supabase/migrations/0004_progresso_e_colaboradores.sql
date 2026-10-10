-- v0.3a / v0.4 — Total da checklist por obra e ficha do colaborador (aplicada em 2026-10-10).
-- A importação dos 13 colaboradores do Excel foi feita à parte (dados pessoais não vão para o repositório).

-- v0.3a — Total da checklist de uma obra (só o que a pessoa pode ver e não está escondido)
create or replace function public.progresso_obra(p_obra uuid)
returns table(total int, feitos int)
language sql stable security definer set search_path = public as $$
  with recursive escondidos as (
    select g.item_id as id from public.item_ignorados g where g.obra_id = p_obra
    union
    select c.id from public.items c join escondidos e on c.parent_id = e.id
  )
  select count(*)::int, count(s.item_id)::int
  from public.items i
  left join public.item_status s on s.item_id = i.id and s.obra_id = p_obra
  where i.tipo = 'item'
    and i.id not in (select id from escondidos)
    and public.tem_acesso_item(p_obra, i.id)
$$;
revoke all on function public.progresso_obra(uuid) from public, anon;
grant execute on function public.progresso_obra(uuid) to authenticated;

-- v0.4 — Ficha do colaborador. Dados pessoais: só ADMIN e Administrador (Decisão 10).
create table if not exists public.colaboradores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  nome text not null,
  data_nascimento date,
  nacionalidade text,
  nif text,
  cc_numero text,
  iban text,
  telefone text,
  email text,
  contacto_urgencia text,
  data_entrada date,
  area text,
  carta_validade date,
  cc_validade date,
  aptidao_validade date,
  manobrador boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint colaboradores_area_check check (area is null or area in
    ('obra', 'engenheiro', 'arquiteto', 'comercial', 'administrativo', 'socio_gerente'))
);

alter table public.colaboradores enable row level security;
revoke all on public.colaboradores from anon;

create policy "Gestores veem colaboradores" on public.colaboradores for select to authenticated using (public.eh_gestor());
create policy "Gestores criam colaboradores" on public.colaboradores for insert to authenticated with check (public.eh_gestor());
create policy "Gestores editam colaboradores" on public.colaboradores for update to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
create policy "Gestores apagam colaboradores" on public.colaboradores for delete to authenticated using (public.eh_gestor());

create or replace function public.colaboradores_atualizado()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists colaboradores_atualizado on public.colaboradores;
create trigger colaboradores_atualizado before update on public.colaboradores
  for each row execute function public.colaboradores_atualizado();
