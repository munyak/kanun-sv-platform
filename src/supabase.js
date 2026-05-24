import { createClient } from '@supabase/supabase-js'
const supabaseUrl = 'https://ubwmitylgqjlqpcsoezv.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVid21pdHlsZ3FqbHFwY3NvZXp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgxMjA1MTEsImV4cCI6MjA5MzY5NjUxMX0.F8bPIKktfG3LBuSb_Haxd1oLEh8l8BdGtsjbHmkNXeE'
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
