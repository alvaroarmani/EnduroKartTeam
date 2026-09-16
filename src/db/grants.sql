-- Permissões para o papel `anon` (chave pública) nas tabelas de CAPTURA.
-- Rode no SQL Editor do Supabase, UMA vez, após o schema.sql.
-- Fase de estudo: anon pode ler/gravar as tabelas de captura. Endureça depois
-- (ideal: escrita via service_role no worker, e anon só leitura para o dashboard).

do $$
declare t text;
begin
  foreach t in array array['sessions','competitors','competitor_samples','laps'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update on public.%I to anon', t);
    execute format('drop policy if exists anon_rw on public.%I', t);
    execute format('create policy anon_rw on public.%I for all to anon using (true) with check (true)', t);
  end loop;
end $$;

-- Leitura das views pelo dashboard (opcional):
grant select on public.v_latest_sample     to anon;
grant select on public.v_pace_by_competitor to anon;
