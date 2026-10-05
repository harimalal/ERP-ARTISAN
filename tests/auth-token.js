import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env.local') });

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export async function getTestToken() {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'rado.rajaomaria@gmail.com',
    password: 'azerty123'
  });

  if (error) throw new Error(`Auth failed: ${error.message}`);
  return data.session.access_token;
}
