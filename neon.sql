-- LifeOS 90: Neon Serverless Postgres Schema
-- Run this in your Neon SQL Editor (https://console.neon.tech)

CREATE TABLE IF NOT EXISTS public.lifeos_state (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed initial record if empty
INSERT INTO public.lifeos_state (id, data, updated_at)
VALUES ('single', '{}'::jsonb, now())
ON CONFLICT (id) DO NOTHING;
