-- ============================================
-- EVERGREEN — Volledig Database Schema
-- ============================================

-- Enable extensions
create extension if not exists "uuid-ossp";
create extension if not exists "vector";

-- ============================================
-- VENTURES — De intenties
-- ============================================
create table ventures (
  id uuid primary key default uuid_generate_v4(),
  owner_email text not null,
  
  -- Intentie
  original_intent text not null,
  evolved_intent text,
  intent_version integer default 1,
  
  -- Status
  status text default 'bootstrapping' 
    check (status in ('bootstrapping', 'active', 'paused', 'archived')),
  phase text default 'bootstrap'
    check (phase in ('bootstrap', 'understand', 'infrastructure', 'execute', 'scale')),
  
  -- Budget
  budget_total decimal(10,2) not null default 500,
  budget_spent decimal(10,2) default 0,
  approval_threshold decimal(10,2) default 50,
  
  -- Metrics
  revenue_total decimal(10,2) default 0,
  contacts_discovered integer default 0,
  contacts_converted integer default 0,
  
  -- Loop configuratie
  loop_interval_minutes integer default 60,
  last_loop_at timestamptz,
  next_loop_at timestamptz,
  loop_count integer default 0,
  
  -- Identiteit aangemaakt door de agent
  project_name text,
  project_email text,
  domain text,
  
  -- Tijden
  created_at timestamptz default now(),
  last_active_at timestamptz default now()
);

-- ============================================
-- DECISIONS — Elke beslissing ooit genomen
-- ============================================
create table decisions (
  id uuid primary key default uuid_generate_v4(),
  venture_id uuid references ventures(id) on delete cascade,
  
  -- Niveau van denken
  level text not null check (level in ('strategic', 'tactical', 'operational')),
  
  -- Wat wist het systeem op dit moment
  context_summary text,
  context_full jsonb,
  
  -- De beslissing zelf
  reasoning text not null,
  action_type text not null,
  action_params jsonb,
  
  -- Resultaat
  executed boolean default false,
  result jsonb,
  success boolean,
  error_message text,
  
  -- Leren
  learnings text,
  significance decimal(3,2) default 0.5, -- 0=onbelangrijk, 1=cruciaal
  
  created_at timestamptz default now(),
  executed_at timestamptz
);

-- ============================================
-- ACCOUNTS — Externe accounts aangemaakt
-- ============================================
create table accounts (
  id uuid primary key default uuid_generate_v4(),
  venture_id uuid references ventures(id) on delete cascade,
  
  service text not null,          -- gmail | github | stripe | vercel | ...
  account_email text,
  username text,
  credentials jsonb,              -- encrypted in applicatie laag
  api_keys jsonb,                 -- encrypted
  
  status text default 'active' check (status in ('active', 'suspended', 'deleted')),
  
  created_at timestamptz default now()
);

-- ============================================
-- CONTACTS — Mensen ontdekt en benaderd
-- ============================================
create table contacts (
  id uuid primary key default uuid_generate_v4(),
  venture_id uuid references ventures(id) on delete cascade,
  
  -- Identiteit
  name text,
  email text,
  company text,
  role text,
  linkedin_url text,
  
  -- Status in pipeline
  status text default 'discovered'
    check (status in ('discovered', 'researched', 'contacted', 'replied', 'meeting', 'converted', 'rejected')),
  
  -- Data
  profile jsonb,                  -- alles wat we weten
  interactions jsonb default '[]', -- alle contacten
  
  -- Waarde
  estimated_value decimal(10,2),
  actual_value decimal(10,2) default 0,
  
  -- Discovery
  discovered_via text,
  
  created_at timestamptz default now(),
  last_contacted_at timestamptz,
  converted_at timestamptz
);

-- ============================================
-- TRANSACTIONS — Alle geldstromen
-- ============================================
create table transactions (
  id uuid primary key default uuid_generate_v4(),
  venture_id uuid references ventures(id) on delete cascade,
  
  type text not null check (type in ('expense', 'revenue')),
  amount decimal(10,2) not null,
  currency text default 'EUR',
  
  description text not null,
  category text,                  -- infrastructure | marketing | tools | ...
  
  -- Goedkeuring
  requires_approval boolean default false,
  approved boolean,
  approved_by text,               -- 'auto' | owner email
  approval_requested_at timestamptz,
  approved_at timestamptz,
  
  -- Referentie
  external_reference text,        -- stripe payment id, invoice nr, ...
  
  executed boolean default false,
  created_at timestamptz default now(),
  executed_at timestamptz
);

-- ============================================
-- LEARNINGS — Wat het systeem geleerd heeft
-- ============================================
create table learnings (
  id uuid primary key default uuid_generate_v4(),
  venture_id uuid references ventures(id) on delete cascade,
  
  category text not null,         -- email | outreach | content | product | ...
  insight text not null,
  evidence text,                  -- waarom geloven we dit
  
  confidence decimal(3,2) default 0.5,
  applied_count integer default 0,
  success_rate decimal(3,2),
  
  -- Vector voor semantisch zoeken
  embedding vector(1536),
  
  created_at timestamptz default now(),
  last_applied_at timestamptz
);

-- ============================================
-- METRICS — Alles meten over tijd
-- ============================================
create table metrics (
  id uuid primary key default uuid_generate_v4(),
  venture_id uuid references ventures(id) on delete cascade,
  
  metric text not null,
  value decimal(15,4) not null,
  unit text,
  
  recorded_at timestamptz default now()
);

-- ============================================
-- NOTIFICATIONS — Berichten aan de eigenaar
-- ============================================
create table notifications (
  id uuid primary key default uuid_generate_v4(),
  venture_id uuid references ventures(id) on delete cascade,
  
  type text not null check (type in ('info', 'approval_request', 'strategy_change', 'milestone', 'error')),
  subject text not null,
  body text not null,
  
  -- Voor goedkeuringsverzoeken
  approval_token text unique,
  approval_amount decimal(10,2),
  approval_action jsonb,
  
  -- Status
  sent boolean default false,
  read boolean default false,
  response text,                  -- 'approved' | 'rejected'
  
  sent_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz default now()
);

-- ============================================
-- INDEXES
-- ============================================
create index on decisions (venture_id, created_at desc);
create index on contacts (venture_id, status);
create index on transactions (venture_id, type, executed);
create index on metrics (venture_id, metric, recorded_at desc);
create index on notifications (venture_id, sent, read);
create index on learnings using ivfflat (embedding vector_cosine_ops);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
alter table ventures enable row level security;
alter table decisions enable row level security;
alter table accounts enable row level security;
alter table contacts enable row level security;
alter table transactions enable row level security;
alter table learnings enable row level security;
alter table metrics enable row level security;
alter table notifications enable row level security;
