-- v0.1 — Papéis, nome de utilizador e proteção do papel (aplicada em 2026-10-09).
-- Compatível com a checklist existente: a coluna antiga `role` fica em sincronia com `papel`.
-- A atribuição inicial de papéis às contas existentes foi feita à parte (dados, não estrutura).

alter table public.profiles add column if not exists papel text not null default 'cliente';
alter table public.profiles add column if not exists utilizador text;
alter table public.profiles add column if not exists ativo boolean not null default true;

alter table public.profiles drop constraint if exists profiles_papel_check;
alter table public.profiles add constraint profiles_papel_check
  check (papel in ('admin', 'administrador', 'obra', 'subempreiteiro', 'cliente'));

alter table public.profiles drop constraint if exists profiles_utilizador_check;
alter table public.profiles add constraint profiles_utilizador_check
  check (utilizador is null or utilizador ~ '^[a-z0-9._-]{3,30}$');

create unique index if not exists profiles_utilizador_unico on public.profiles (lower(utilizador));

update public.profiles set papel = case role
  when 'super_admin' then 'admin'
  when 'admin' then 'administrador'
  else 'obra' end;

-- Proteção (D13) + sincronização papel <-> role
create or replace function public.profiles_proteger_e_sincronizar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and current_user in ('authenticated', 'anon') and (
       new.papel is distinct from old.papel
    or new.role is distinct from old.role
    or new.utilizador is distinct from old.utilizador
    or new.ativo is distinct from old.ativo) then
    raise exception 'Sem permissão para alterar o tipo de utilizador, o nome de utilizador ou o estado da conta.';
  end if;

  if tg_op = 'INSERT' or new.papel is distinct from old.papel then
    new.role := case new.papel
      when 'admin' then 'super_admin'
      when 'administrador' then 'admin'
      else 'utilizador' end;
  elsif new.role is distinct from old.role then
    new.papel := case new.role
      when 'super_admin' then 'admin'
      when 'admin' then 'administrador'
      else case when old.papel in ('admin', 'administrador') then 'obra' else old.papel end end;
  end if;
  return new;
end $$;

drop trigger if exists profiles_proteger_e_sincronizar on public.profiles;
create trigger profiles_proteger_e_sincronizar
  before insert or update on public.profiles
  for each row execute function public.profiles_proteger_e_sincronizar();

create or replace function public.eh_gestor()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and ativo and papel in ('admin', 'administrador'))
$$;

create or replace function public.listar_contas()
returns table(id uuid, email text, nome text, utilizador text, papel text, ativo boolean, criado_em timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_gestor() then
    raise exception 'Só ADMIN e Administrador podem ver as contas.';
  end if;
  return query
    select u.id, u.email::text, p.nome, p.utilizador, p.papel, p.ativo, u.created_at
    from auth.users u join public.profiles p on p.id = u.id
    order by p.nome;
end $$;

create or replace function public.email_para_login(p_utilizador text)
returns text language sql stable security definer set search_path = public as $$
  select u.email::text from public.profiles p join auth.users u on u.id = p.id
  where lower(p.utilizador) = lower(trim(p_utilizador)) and p.ativo
  limit 1
$$;

revoke all on function public.email_para_login(text) from public;
grant execute on function public.email_para_login(text) to anon, authenticated;
revoke all on function public.listar_contas() from public, anon;
grant execute on function public.listar_contas() to authenticated;
revoke all on function public.eh_gestor() from public, anon;
grant execute on function public.eh_gestor() to authenticated;
