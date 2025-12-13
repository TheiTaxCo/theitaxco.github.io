// assets/js/config.supabase.js
// ✅ Pin to a specific version so jsDelivr doesn't upgrade under us
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.48.0/+esm";

// ✅ Your real project values (keep these exactly as you have them)
const SUPABASE_URL = "https://cuiynxagkuxradnvwixq.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1aXlueGFna3V4cmFkbnZ3aXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4NDQyOTcsImV4cCI6MjA3MTQyMDI5N30.GXyEo9g5qCPHYzKSCh_EDJrfW2RSwACdb1_Pn6InstU";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
