-- Ajustement de stock atomique : le calcul se fait dans l'UPDATE lui-même,
-- donc deux mouvements simultanés sur le même article s'additionnent au lieu
-- de s'écraser. SECURITY INVOKER : la RLS du tenant s'applique normalement.
-- Plancher à 0, comme le faisait déjà le code client (Math.max(0, …)).
-- Retourne le nouveau stock, ou NULL si la ligne n'existe pas pour ce tenant.

create or replace function public.ajuster_stock_article(p_id uuid, p_delta numeric)
returns numeric
language sql
security invoker
set search_path = public
as $$
  update articles set stock = greatest(0, stock + p_delta) where id = p_id returning stock;
$$;

create or replace function public.ajuster_stock_produit(p_id uuid, p_delta numeric)
returns numeric
language sql
security invoker
set search_path = public
as $$
  update produits set stock = greatest(0, stock + p_delta) where id = p_id returning stock;
$$;

revoke all on function public.ajuster_stock_article(uuid, numeric) from public, anon;
revoke all on function public.ajuster_stock_produit(uuid, numeric) from public, anon;
grant execute on function public.ajuster_stock_article(uuid, numeric) to authenticated;
grant execute on function public.ajuster_stock_produit(uuid, numeric) to authenticated;
