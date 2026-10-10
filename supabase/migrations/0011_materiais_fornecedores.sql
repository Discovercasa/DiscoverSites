-- v0.9 — Materiais e fornecedores, com histórico de preços (aplicada em 2026-10-11).
-- Só ADMIN e Administrador. Os 113 materiais / 9 fornecedores do Excel foram importados à parte. (D22)

create table if not exists public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  sede text,
  armazens text,
  pagamento text check (pagamento is null or pagamento in ('conta_corrente', 'pronto_pagamento', 'antes_levantamento')),
  transporte boolean,
  transporte_pago boolean,
  contacto_nome text,
  contacto_telefone text,
  contacto_email text,
  notas text,
  created_at timestamptz not null default now()
);
create unique index if not exists fornecedores_nome_unico on public.fornecedores (lower(nome));

create table if not exists public.materiais (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  categoria text,
  notas text,
  created_at timestamptz not null default now()
);
create unique index if not exists materiais_nome_unico on public.materiais (lower(nome));

create table if not exists public.material_precos (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materiais(id) on delete cascade,
  fornecedor_id uuid not null references public.fornecedores(id) on delete restrict,
  designacao text,
  dimensoes text,
  detalhes text,
  preco numeric(12,4) not null check (preco >= 0),
  unidade text,
  desconto numeric(5,4) not null default 0 check (desconto >= 0 and desconto < 1),
  iva numeric(5,4) not null default 0.23 check (iva >= 0 and iva < 1),
  disponibilidade text check (disponibilidade is null or disponibilidade in ('imediata', 'encomenda')),
  prazo_dias int check (prazo_dias is null or prazo_dias >= 0),
  data_atualizacao date not null default current_date,
  observacoes text,
  created_at timestamptz not null default now()
);
create index if not exists material_precos_material on public.material_precos (material_id);
create index if not exists material_precos_fornecedor on public.material_precos (fornecedor_id);

create table if not exists public.material_precos_historico (
  id uuid primary key default gen_random_uuid(),
  preco_id uuid not null references public.material_precos(id) on delete cascade,
  preco numeric(12,4) not null,
  desconto numeric(5,4) not null,
  iva numeric(5,4) not null,
  unidade text,
  data_atualizacao date,
  registado_em timestamptz not null default now(),
  registado_por uuid default auth.uid() references auth.users(id) on delete set null
);
create index if not exists material_precos_historico_preco on public.material_precos_historico (preco_id, registado_em desc);

-- O histórico é escrito só por este trigger, quando muda o preço, o desconto, o IVA ou a unidade
create or replace function public.material_precos_guardar_historico()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.preco, new.desconto, new.iva, coalesce(new.unidade, '')) is distinct from (old.preco, old.desconto, old.iva, coalesce(old.unidade, '')) then
    insert into public.material_precos_historico (preco_id, preco, desconto, iva, unidade, data_atualizacao)
    values (old.id, old.preco, old.desconto, old.iva, old.unidade, old.data_atualizacao);
  end if;
  return new;
end $$;
drop trigger if exists material_precos_guardar_historico on public.material_precos;
create trigger material_precos_guardar_historico before update on public.material_precos
  for each row execute function public.material_precos_guardar_historico();

alter table public.fornecedores enable row level security;
alter table public.materiais enable row level security;
alter table public.material_precos enable row level security;
alter table public.material_precos_historico enable row level security;
revoke all on public.fornecedores from anon;
revoke all on public.materiais from anon;
revoke all on public.material_precos from anon;
revoke all on public.material_precos_historico from anon;
create policy "Gestores veem fornecedores" on public.fornecedores for select to authenticated using (public.eh_gestor());
create policy "Gestores criam fornecedores" on public.fornecedores for insert to authenticated with check (public.eh_gestor());
create policy "Gestores editam fornecedores" on public.fornecedores for update to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
create policy "Gestores apagam fornecedores" on public.fornecedores for delete to authenticated using (public.eh_gestor());
create policy "Gestores veem materiais" on public.materiais for select to authenticated using (public.eh_gestor());
create policy "Gestores criam materiais" on public.materiais for insert to authenticated with check (public.eh_gestor());
create policy "Gestores editam materiais" on public.materiais for update to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
create policy "Gestores apagam materiais" on public.materiais for delete to authenticated using (public.eh_gestor());
create policy "Gestores veem precos" on public.material_precos for select to authenticated using (public.eh_gestor());
create policy "Gestores criam precos" on public.material_precos for insert to authenticated with check (public.eh_gestor());
create policy "Gestores editam precos" on public.material_precos for update to authenticated using (public.eh_gestor()) with check (public.eh_gestor());
create policy "Gestores apagam precos" on public.material_precos for delete to authenticated using (public.eh_gestor());
create policy "Gestores veem historico de precos" on public.material_precos_historico for select to authenticated using (public.eh_gestor());
