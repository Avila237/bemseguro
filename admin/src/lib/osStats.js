import { supabase } from './supabase.js';

// Conta as OS "ativas" (pendente + cotando) para o badge da Sidebar.
export async function contarOSAtivas() {
  const { count, error } = await supabase
    .from('os_cotacao')
    .select('id', { count: 'exact', head: true })
    .in('status', ['pendente', 'cotando']);
  if (error) return 0;
  return count || 0;
}
