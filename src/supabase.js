import { createClient } from '@supabase/supabase-js'
const supabaseUrl = 'https://yxhwcicxarfmptwivkdu.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl4aHdjaWN4YXJmbXB0d2l2a2R1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2ODgxNTYsImV4cCI6MjA5NTI2NDE1Nn0.vvj_h0Xw9MAHcXafigkqwxPv9ueuaStfFIGcnbGeq6c'
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
