-- v0.5 — Férias e ausências, feriados e saldo de férias (aplicada em 2026-10-10).
-- As férias de 2026 do Excel foram importadas à parte (dados pessoais não vão para o repositório).

create or replace function public.minha_ficha_id()
returns uuid language sql stable security definer set search_path = public as $$
  select c.id from public.colaboradores c
  where c.user_id = auth.uid() and public.papel_atual() is not null
  limit 1
$$;

create table if not exists public.feriados (
  data date primary key,
  nome text not null,
  ambito text not null default 'nacional' check (ambito in ('nacional', 'municipal'))
);
alter table public.feriados enable row level security;
revoke all on public.feriados from anon;
create policy "Todos veem feriados" on public.feriados for select to authenticated using (true);
create policy "Gestores criam feriados" on public.feriados for insert to authenticated with check (public.eh_gestor());
create policy "Gestores editam feriados" on public.feriados for update to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
create policy "Gestores apagam feriados" on public.feriados for delete to authenticated using (public.eh_gestor());

insert into public.feriados (data, nome) values
  ('2026-01-01','Ano Novo'), ('2026-04-03','Sexta-feira Santa'), ('2026-04-05','Páscoa'), ('2026-04-25','Dia da Liberdade'),
  ('2026-05-01','Dia do Trabalhador'), ('2026-06-04','Corpo de Deus'), ('2026-06-10','Dia de Portugal'), ('2026-08-15','Assunção de Nossa Senhora'),
  ('2026-10-05','Implantação da República'), ('2026-11-01','Todos os Santos'), ('2026-12-01','Restauração da Independência'),
  ('2026-12-08','Imaculada Conceição'), ('2026-12-25','Natal'),
  ('2027-01-01','Ano Novo'), ('2027-03-26','Sexta-feira Santa'), ('2027-03-28','Páscoa'), ('2027-04-25','Dia da Liberdade'),
  ('2027-05-01','Dia do Trabalhador'), ('2027-05-27','Corpo de Deus'), ('2027-06-10','Dia de Portugal'), ('2027-08-15','Assunção de Nossa Senhora'),
  ('2027-10-05','Implantação da República'), ('2027-11-01','Todos os Santos'), ('2027-12-01','Restauração da Independência'),
  ('2027-12-08','Imaculada Conceição'), ('2027-12-25','Natal')
on conflict (data) do nothing;

create table if not exists public.ferias_saldos (
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  ano int not null check (ano between 2020 and 2100),
  dias numeric(4,1) not null default 22 check (dias >= 0),
  transitados numeric(4,1) not null default 0 check (transitados >= 0),
  primary key (colaborador_id, ano)
);
alter table public.ferias_saldos enable row level security;
revoke all on public.ferias_saldos from anon;
create policy "Gestores veem saldos" on public.ferias_saldos for select to authenticated using (public.eh_gestor());
create policy "Gestores criam saldos" on public.ferias_saldos for insert to authenticated with check (public.eh_gestor());
create policy "Gestores editam saldos" on public.ferias_saldos for update to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
create policy "Gestores apagam saldos" on public.ferias_saldos for delete to authenticated using (public.eh_gestor());

create table if not exists public.ausencias (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  tipo text not null check (tipo in ('ferias', 'ferias_empresa', 'falta', 'teletrabalho', 'tese', 'compensacao', 'baixa', 'formacao')),
  data_inicio date not null,
  data_fim date not null,
  meio_dia boolean not null default false,
  estado text not null default 'aprovado' check (estado in ('pendente', 'aprovado', 'recusado')),
  notas text,
  pedido_por uuid references auth.users(id) on delete set null,
  decidido_por uuid references auth.users(id) on delete set null,
  decidido_em timestamptz,
  created_at timestamptz not null default now(),
  constraint ausencias_datas_check check (data_fim >= data_inicio),
  constraint ausencias_meio_dia_check check (not meio_dia or data_fim = data_inicio)
);
create index if not exists ausencias_colaborador_datas on public.ausencias (colaborador_id, data_inicio, data_fim);
alter table public.ausencias enable row level security;
revoke all on public.ausencias from anon;
create policy "Ve as proprias ausencias ou todas se gestor" on public.ausencias for select to authenticated
  using (public.eh_gestor() or colaborador_id = public.minha_ficha_id());
create policy "Gestores registam e cada um pede" on public.ausencias for insert to authenticated
  with check (public.eh_gestor() or (
    colaborador_id = public.minha_ficha_id() and estado = 'pendente' and pedido_por = auth.uid()
    and tipo in ('ferias', 'falta', 'teletrabalho', 'compensacao', 'formacao') and decidido_por is null));
create policy "Gestores editam ausencias" on public.ausencias for update to authenticated
  using (public.eh_gestor()) with check (public.eh_gestor());
create policy "Gestores apagam e cada um cancela pedidos pendentes" on public.ausencias for delete to authenticated
  using (public.eh_gestor() or (colaborador_id = public.minha_ficha_id() and estado = 'pendente'));

create or replace function public.dias_uteis(p_inicio date, p_fim date)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from generate_series(p_inicio, p_fim, interval '1 day') d
  where extract(isodow from d) < 6 and d::date not in (select data from public.feriados)
$$;

create or replace function public.saldos_ferias(p_ano int)
returns table(colaborador_id uuid, nome text, dias numeric, transitados numeric, gozados numeric, pendentes numeric, disponivel numeric)
language sql stable security definer set search_path = public as $$
  with ano as (select make_date(p_ano, 1, 1) as ini, make_date(p_ano, 12, 31) as fim),
  usados as (
    select a.colaborador_id, a.estado,
      sum(case when a.meio_dia then 0.5
               else public.dias_uteis(greatest(a.data_inicio, ano.ini), least(a.data_fim, ano.fim)) end) as n
    from public.ausencias a cross join ano
    where a.tipo in ('ferias', 'ferias_empresa') and a.estado in ('aprovado', 'pendente')
      and a.data_inicio <= ano.fim and a.data_fim >= ano.ini
    group by a.colaborador_id, a.estado
  )
  select c.id, c.nome,
         coalesce(s.dias, 22), coalesce(s.transitados, 0),
         coalesce((select n from usados u where u.colaborador_id = c.id and u.estado = 'aprovado'), 0),
         coalesce((select n from usados u where u.colaborador_id = c.id and u.estado = 'pendente'), 0),
         coalesce(s.dias, 22) + coalesce(s.transitados, 0)
           - coalesce((select n from usados u where u.colaborador_id = c.id and u.estado = 'aprovado'), 0)
  from public.colaboradores c
  left join public.ferias_saldos s on s.colaborador_id = c.id and s.ano = p_ano
  where public.eh_gestor() or c.id = public.minha_ficha_id()
  order by c.nome
$$;

revoke all on function public.minha_ficha_id(), public.dias_uteis(date, date), public.saldos_ferias(int) from public, anon;
grant execute on function public.minha_ficha_id(), public.dias_uteis(date, date), public.saldos_ferias(int) to authenticated;
