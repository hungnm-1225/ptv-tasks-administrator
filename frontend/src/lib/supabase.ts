import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://wndmnrgxupnwxizsxqbx.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InduZG1ucmd4dXBud3hpenN4cWJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1MDczOTUsImV4cCI6MjEwMjA4MzM5NX0.PDQEiifSDJKypEvvxAFQiyGa2xJzPoKoxcgZmDdLP4M';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
