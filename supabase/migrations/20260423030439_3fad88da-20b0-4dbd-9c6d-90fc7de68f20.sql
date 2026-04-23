CREATE TABLE IF NOT EXISTS public.app_data (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read app_data" ON public.app_data FOR SELECT USING (true);
CREATE POLICY "Public insert app_data" ON public.app_data FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update app_data" ON public.app_data FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public delete app_data" ON public.app_data FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.app_data;