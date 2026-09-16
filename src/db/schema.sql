-- =============================================================================
-- EnduroKart · Esquema do banco (PostgreSQL / Supabase)
-- =============================================================================
-- Aplicar no SQL Editor do Supabase (ou psql). Idempotente onde dá.
-- Duas camadas:
--   A) CAPTURA (mylaptime)  → povoada pelo scraper. É o foco de agora.
--   B) ESTRATÉGIA (manual)  → nossos dados (paradas, pilotos, pesos). Fase depois.
-- =============================================================================

create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- A) CAMADA DE CAPTURA (mylaptime)
-- ---------------------------------------------------------------------------

-- Uma "bateria"/evento de cronometragem.
create table if not exists sessions (
  id              uuid primary key default gen_random_uuid(),
  mylaptime_uid   text,                       -- GUID do evento no mylaptime (company_livetime_selected)
  name            text,                       -- "BATERIA 13", "Corrida", ...
  track           text,                       -- "ARENA SPEED KART", ...
  event_type      text,                       -- 'race' | 'quali' | 'practice' | 'unknown'
  race_duration_s integer,                    -- duração planejada, se conhecida
  source          text default 'mylaptime',
  is_our_race     boolean default false,      -- true na FDK 100 Milhas; false nas baterias de "estudo"
  started_at      timestamptz,
  captured_from   timestamptz default now(),  -- quando começamos a gravar
  raw_meta        jsonb default '{}'::jsonb,
  created_at      timestamptz default now()
);
-- Dedupe estável por evento do mylaptime (GUID). Índice único simples: vários NULL
-- são permitidos (eventos sem GUID conhecido) e o upsert via PostgREST usa on_conflict=mylaptime_uid.
create unique index if not exists sessions_uid_uidx on sessions (mylaptime_uid);

-- Reconciliação pelo ingestor (ativos/fechados). Idempotente p/ bancos já criados.
alter table sessions add column if not exists status       text default 'active';   -- 'active' | 'closed'
alter table sessions add column if not exists last_seen_at timestamptz;              -- última vez visto ativo
alter table sessions add column if not exists closed_at    timestamptz;

-- Um competidor/kart dentro de uma sessão (linha da tabela do mylaptime).
create table if not exists competitors (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references sessions(id) on delete cascade,
  number       text,                          -- "#7" -> "7"
  name         text,                          -- "EQUIPE LEKT"
  category     text,                          -- "INDOOR"
  is_team      boolean default false,         -- true se for um dos NOSSOS karts
  created_at   timestamptz default now(),
  unique (session_id, number)
);
create index if not exists competitors_session_idx on competitors (session_id);

-- Série temporal do estado ao vivo de cada competidor (o "feed" principal).
-- Um registro por leitura do scraper (a cada ~N s) por competidor.
create table if not exists competitor_samples (
  id            bigint generated always as identity primary key,
  session_id    uuid not null references sessions(id) on delete cascade,
  competitor_id uuid not null references competitors(id) on delete cascade,
  captured_at   timestamptz not null default now(),
  race_clock_ms integer,                      -- relógio da prova nessa leitura
  pos           integer,
  lap_count     integer,                      -- LAP
  last_lap_ms   integer,                      -- T.U.V
  best_lap_ms   integer,                      -- T.M.V
  best_lap_num  integer,                      -- M.V
  diff_ms       integer,                      -- DIFF (quando em tempo)
  diff_laps     integer,                      -- DIFF (quando em voltas)
  diff_raw      text,
  gap_ms        integer,                      -- GAP (quando em tempo)
  gap_laps      integer,                      -- GAP (quando em voltas)
  gap_raw       text,
  state         text,                         -- estado do piloto (pista/box), se houver
  flag          text                          -- bandeira global na leitura
);
create index if not exists samples_session_time_idx
  on competitor_samples (session_id, captured_at);
-- único: idempotência do upsert (uma amostra por competidor por instante de captura)
create unique index if not exists samples_competitor_time_uidx
  on competitor_samples (competitor_id, captured_at);

-- Histórico volta a volta (do painel expansível). Idempotente por (competidor, volta).
create table if not exists laps (
  id            bigint generated always as identity primary key,
  session_id    uuid not null references sessions(id) on delete cascade,
  competitor_id uuid not null references competitors(id) on delete cascade,
  lap_number    integer not null,
  lap_ms        integer,
  lap_text      text,
  captured_at   timestamptz default now(),
  unique (competitor_id, lap_number)
);
create index if not exists laps_competitor_idx on laps (competitor_id, lap_number);

-- ---------------------------------------------------------------------------
-- B) CAMADA DE ESTRATÉGIA (manual) — nossos dados. Fase posterior.
-- ---------------------------------------------------------------------------

-- Nossos pilotos (o elenco de 13).
create table if not exists drivers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  tier           smallint,                    -- 1=ás ... n (força/experiência)
  base_weight_kg numeric(5,2),                -- peso de macacão completo (define lastro)
  notes          text,
  created_at     timestamptz default now()
);

-- Nossos karts na prova (vínculo estável com a linha do mylaptime).
create table if not exists team_karts (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid references sessions(id) on delete cascade,
  label              text,                     -- "Kart A", "LEKT 1"
  mylaptime_number   text,                     -- nº que aparece no feed
  mylaptime_name     text,                     -- nome/substring p/ casar a linha
  competitor_id      uuid references competitors(id) on delete set null,
  created_at         timestamptz default now()
);

-- Paradas obrigatórias (MANUAL — o dado que o mylaptime não fornece).
create table if not exists pit_stops (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references sessions(id) on delete cascade,
  team_kart_id  uuid references team_karts(id) on delete cascade,
  stop_number   smallint,                     -- 1..7
  entered_at    timestamptz,
  duration_ms   integer,                      -- cronômetro dos 5:00
  driver_out    uuid references drivers(id),
  driver_in     uuid references drivers(id),
  weight_kg     numeric(5,2),                 -- pesagem do que saiu
  kart_drawn    text,                         -- nº sorteado
  valid         boolean default true,
  notes         text,
  created_at    timestamptz default now()
);

-- Stints (deriva das paradas + rotação).
create table if not exists stints (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references sessions(id) on delete cascade,
  team_kart_id  uuid references team_karts(id) on delete cascade,
  stint_number  smallint,                     -- 1..8
  driver_id     uuid references drivers(id),
  started_at    timestamptz,
  ended_at      timestamptz,
  created_at    timestamptz default now()
);

-- Penalidades/advertências (MANUAL).
create table if not exists penalties (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references sessions(id) on delete cascade,
  team_kart_id  uuid references team_karts(id) on delete cascade,
  kind          text,                         -- 'advertencia' | 'volta' | 'tempo'
  laps_lost     smallint default 0,
  seconds_added integer default 0,
  reason        text,
  at            timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Segurança (RLS). Para a fase de estudo, o mais simples é deixar a tabela
-- de captura gravável pela chave anon. Ajustar antes da prova real.
-- ---------------------------------------------------------------------------
-- Exemplo permissivo (DESCOMENTE se quiser começar rápido; endurecer depois):
-- alter table sessions           enable row level security;
-- alter table competitors        enable row level security;
-- alter table competitor_samples enable row level security;
-- alter table laps               enable row level security;
-- create policy anon_all on sessions           for all using (true) with check (true);
-- create policy anon_all on competitors        for all using (true) with check (true);
-- create policy anon_all on competitor_samples for all using (true) with check (true);
-- create policy anon_all on laps               for all using (true) with check (true);

-- =============================================================================
-- Views úteis (leitura para o dashboard / futuro agente)
-- =============================================================================

-- Último estado de cada competidor por sessão.
create or replace view v_latest_sample as
select distinct on (competitor_id)
  cs.*, c.number, c.name, c.is_team
from competitor_samples cs
join competitors c on c.id = cs.competitor_id
order by competitor_id, captured_at desc;

-- Estatística de ritmo por competidor (média/melhor/consistência do histórico).
create or replace view v_pace_by_competitor as
select
  l.competitor_id,
  c.session_id,
  c.number, c.name,
  count(*)                              as laps_recorded,
  min(l.lap_ms)                         as best_ms,
  round(avg(l.lap_ms))                  as avg_ms,
  round(stddev_pop(l.lap_ms))           as stddev_ms   -- consistência (menor = melhor)
from laps l
join competitors c on c.id = l.competitor_id
where l.lap_ms is not null
group by l.competitor_id, c.session_id, c.number, c.name;
