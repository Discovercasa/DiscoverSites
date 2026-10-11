-- v0.9c — Cada fornecedor pode ter várias categorias (escolhidas à mão, das usadas nos materiais) (aplicada em 2026-10-11).
alter table public.fornecedores add column if not exists categorias text[] not null default '{}';
