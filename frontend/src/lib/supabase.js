// lib/supabase.js — Supabase client singleton
// Purpose: Initialize and export the Supabase JS client for frontend use
// Dependencies: @supabase/supabase-js
// Env vars: REACT_APP_SUPABASE_URL, REACT_APP_SUPABASE_ANON_KEY

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_ANON_KEY environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
