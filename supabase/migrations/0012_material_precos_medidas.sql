-- v0.9a — Medidas (metros), quantidade por embalagem, peso e transporte em cada preço (aplicada em 2026-10-11).
alter table public.material_precos add column if not exists comprimento numeric(12,4) check (comprimento is null or comprimento > 0);
alter table public.material_precos add column if not exists largura numeric(12,4) check (largura is null or largura > 0);
alter table public.material_precos add column if not exists espessura numeric(12,4) check (espessura is null or espessura > 0);
alter table public.material_precos add column if not exists qtd_embalagem numeric(12,3) check (qtd_embalagem is null or qtd_embalagem > 0);
alter table public.material_precos add column if not exists qtd_unidade text;
alter table public.material_precos add column if not exists peso_kg numeric(12,3) check (peso_kg is null or peso_kg > 0);
alter table public.material_precos add column if not exists transporte text check (transporte is null or transporte in ('sim', 'nao', 'por_definir'));
alter table public.material_precos add column if not exists transporte_incluido text check (transporte_incluido is null or transporte_incluido in ('sim', 'nao', 'qtd_minima'));
-- A coluna antiga "dimensoes" (texto) foi convertida nos campos acima; o que não deu para converter passou para "detalhes".
