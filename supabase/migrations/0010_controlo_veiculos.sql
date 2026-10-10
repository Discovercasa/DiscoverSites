-- v0.7c / v0.8 — Pedidos com data de necessidade; contactos de emergência e alojamento;
-- veículos, GPS e horas extra (aplicada em 2026-10-11). Os dados do Excel foram importados à parte.

-- v0.7c
alter table public.pedidos add column if not exists necessario_ate date;
-- {hospital:{nome,morada,tel}, policia:{...}, bombeiros:{...}, alojamento:{morada,contacto}}
-- Não se lê diretamente (não está no grant de colunas de obras): só por obras_visiveis(), e o Cliente não recebe. (D21)
alter table public.obras add column if not exists contactos jsonb not null default '{}'::jsonb;

drop function if exists public.obras_visiveis();
create function public.obras_visiveis()
returns table(
  id uuid, codigo text, nome text, morada text, localidade text, latitude numeric, longitude numeric,
  estado text, data_inicio date, data_fim_prevista date, data_fim_real date,
  responsavel_id uuid, responsavel_nome text,
  cliente_id uuid, cliente_nome text, cliente_email text, notas text,
  ve_cliente boolean, ve_notas boolean, ve_membros boolean, capa_path text, contactos jsonb)
language sql stable security definer set search_path = public as $$
  with eu as (select public.papel_atual() as papel, public.eh_gestor() as gestor)
  select o.id, o.codigo, o.nome, o.morada, o.localidade, o.latitude, o.longitude,
         o.estado, o.data_inicio, o.data_fim_prevista, o.data_fim_real,
         o.responsavel_id, rp.nome,
         case when v.cli then o.cliente_id end,
         case when v.cli then cp.nome end,
         case when v.cli then cu.email::text end,
         case when v.notas then o.notas end,
         v.cli, v.notas, v.membros, o.capa_path,
         case when eu.papel <> 'cliente' then o.contactos end
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

-- v0.8 — Veículos, GPS e horas extra (só ADMIN e Administrador). (D21)
create table if not exists public.veiculos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  matricula text,
  marca text,
  modelo text,
  ano int check (ano is null or ano between 1950 and 2100),
  km int check (km is null or km >= 0),
  cartao_pontos_fim text check (cartao_pontos_fim is null or cartao_pontos_fim ~ '^[0-9]{4}$'),
  cartao_bp_fim text check (cartao_bp_fim is null or cartao_bp_fim ~ '^[0-9]{4}$'),
  notas text,
  revisao date, inspecao date, seguro date, iuc date,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.veiculos enable row level security;
revoke all on public.veiculos from anon;
create policy "Gestores veem veiculos" on public.veiculos for select to authenticated using (public.eh_gestor());
create policy "Gestores criam veiculos" on public.veiculos for insert to authenticated with check (public.eh_gestor());
create policy "Gestores editam veiculos" on public.veiculos for update to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
create policy "Gestores apagam veiculos" on public.veiculos for delete to authenticated using (public.eh_gestor());

create table if not exists public.gps_registos (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  condutor_id uuid references public.colaboradores(id) on delete set null,
  condutor_texto text,
  veiculo_id uuid references public.veiculos(id) on delete set null,
  veiculo_texto text,
  manha_partida time, manha_chegada time,
  almoco_partida time, almoco_chegada time,
  tarde_partida time, tarde_chegada time,
  observacoes text,
  created_at timestamptz not null default now()
);
create index if not exists gps_registos_data on public.gps_registos (data desc);
alter table public.gps_registos enable row level security;
revoke all on public.gps_registos from anon;
create policy "Gestores veem GPS" on public.gps_registos for select to authenticated using (public.eh_gestor());
create policy "Gestores criam GPS" on public.gps_registos for insert to authenticated with check (public.eh_gestor());
create policy "Gestores editam GPS" on public.gps_registos for update to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
create policy "Gestores apagam GPS" on public.gps_registos for delete to authenticated using (public.eh_gestor());

create table if not exists public.horas_extra (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  obra_id uuid references public.obras(id) on delete set null,
  obra_texto text,
  colaborador_id uuid references public.colaboradores(id) on delete set null,
  colaborador_texto text,
  horas numeric(5,2) check (horas is null or horas >= 0),
  valor_hora numeric(7,2) check (valor_hora is null or valor_hora >= 0),
  valor_total numeric(9,2) not null check (valor_total >= 0),
  estado text not null default 'nao_pago' check (estado in ('pago', 'nao_pago')),
  observacoes text,
  created_at timestamptz not null default now()
);
create index if not exists horas_extra_data on public.horas_extra (data desc);
alter table public.horas_extra enable row level security;
revoke all on public.horas_extra from anon;
create policy "Gestores veem horas extra" on public.horas_extra for select to authenticated using (public.eh_gestor());
create policy "Gestores criam horas extra" on public.horas_extra for insert to authenticated with check (public.eh_gestor());
create policy "Gestores editam horas extra" on public.horas_extra for update to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
create policy "Gestores apagam horas extra" on public.horas_extra for delete to authenticated using (public.eh_gestor());
