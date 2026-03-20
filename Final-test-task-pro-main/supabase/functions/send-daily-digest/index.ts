import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (_req) => {
  return new Response(
    JSON.stringify({ hello: "world" }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});

