-- ForgeXplain Supabase schema
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query)

-- Profiles table extends Supabase's built-in auth.users with app-specific fields
create table if not exists profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    email text unique not null,
    full_name text,
    role text default 'user' check (role in ('user', 'admin')),
    created_at timestamptz default now()
);

-- Prediction history + uploaded image metadata
create table if not exists predictions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references profiles (id) on delete cascade,
    image_filename text,
    image_storage_path text,          -- path in Supabase Storage bucket, if used
    prediction text check (prediction in ('Genuine', 'Forged')),
    confidence real,
    model_used text,
    prediction_time_ms real,
    features_json jsonb,
    explanation_summary text,
    created_at timestamptz default now()
);

-- Row Level Security: users can only see their own predictions; admins see all
alter table profiles enable row level security;
alter table predictions enable row level security;

create policy "Users can view their own profile"
    on profiles for select using (auth.uid() = id);

create policy "Users can view their own predictions"
    on predictions for select using (auth.uid() = user_id);

create policy "Users can insert their own predictions"
    on predictions for insert with check (auth.uid() = user_id);

create policy "Admins can view all predictions"
    on predictions for select using (
        exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    );

create policy "Admins can view all profiles"
    on profiles for select using (
        exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    );

-- Registered signers (writer-dependent verification templates)
create table if not exists signers (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    feature_vector jsonb not null,     -- 23-dim raw feature template (averaged over reference samples)
    num_samples integer not null,
    registered_by uuid references profiles (id),
    created_at timestamptz default now()
);

alter table signers enable row level security;

create policy "Any authenticated user can view signers"
    on signers for select using (auth.role() = 'authenticated');

create policy "Admins can manage signers"
    on signers for all using (
        exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    );

-- Optional: Supabase Storage bucket for uploaded signature images
-- insert into storage.buckets (id, name, public) values ('signatures', 'signatures', false);
