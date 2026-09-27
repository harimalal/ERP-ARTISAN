-- ARTEASY — Controle de complétude et de coherence apres onboarding
-- Remplacer le tenant ci-dessous, puis lancer d'un bloc.
-- Chaque colonne a une valeur attendue : voir PROCESS_ONBOARDING_30MIN.md phase 3.
-- Generique : aucune categorie ni unite specifique a un metier n'est codee ici.

WITH t AS (SELECT '00000000-0000-0000-0000-000000000000'::uuid AS tid)

SELECT
  /* 1. Volumetrie — doit correspondre a ce qui a ete envoye */
  (SELECT count(*) FROM fournisseurs WHERE tenant_id=(SELECT tid FROM t))            AS nb_fournisseurs,
  (SELECT count(*) FROM articles     WHERE tenant_id=(SELECT tid FROM t))            AS nb_articles,
  (SELECT count(*) FROM produits     WHERE tenant_id=(SELECT tid FROM t))            AS nb_produits,
  (SELECT count(*) FROM clients      WHERE tenant_id=(SELECT tid FROM t))            AS nb_clients,
  (SELECT count(*) FROM recettes     WHERE tenant_id=(SELECT tid FROM t))            AS nb_lignes_recette,
  (SELECT count(DISTINCT produit_id) FROM recettes WHERE tenant_id=(SELECT tid FROM t)) AS nb_produits_avec_recette,

  /* 2. Attendu 0 — produit vendu sans recette : impossible a fabriquer ni a chiffrer */
  (SELECT count(*) FROM produits p WHERE p.tenant_id=(SELECT tid FROM t)
     AND NOT EXISTS (SELECT 1 FROM recettes r WHERE r.produit_id=p.id))              AS produits_sans_recette,

  /* 3. Attendu 0 — ligne de recette pointant sur un article inexistant */
  (SELECT count(*) FROM recettes r LEFT JOIN articles a ON a.id=r.article_id
     WHERE r.tenant_id=(SELECT tid FROM t) AND a.id IS NULL)                         AS recettes_orphelines,

  /* 4. Attendu 0 — deux articles ou deux produits avec la meme reference */
  (SELECT count(*) FROM (SELECT ref FROM articles WHERE tenant_id=(SELECT tid FROM t)
     GROUP BY ref HAVING count(*)>1) x)                                              AS refs_articles_en_double,
  (SELECT count(*) FROM (SELECT ref FROM produits WHERE tenant_id=(SELECT tid FROM t)
     GROUP BY ref HAVING count(*)>1) x)                                              AS refs_produits_en_double,

  /* 5. Attendu 0 — deux fois le meme article dans une seule recette */
  (SELECT count(*) FROM (SELECT produit_id, article_id FROM recettes
     WHERE tenant_id=(SELECT tid FROM t) GROUP BY 1,2 HAVING count(*)>1) x)          AS doublons_dans_une_recette,

  /* 6. A justifier un par un — article cree mais utilise nulle part */
  (SELECT count(*) FROM articles a WHERE a.tenant_id=(SELECT tid FROM t)
     AND NOT EXISTS (SELECT 1 FROM recettes r WHERE r.article_id=a.id))              AS articles_jamais_utilises,

  /* 7. A justifier — prix d'achat a zero : coût de revient et marge faux */
  (SELECT count(*) FROM articles WHERE tenant_id=(SELECT tid FROM t)
     AND (prix IS NULL OR prix=0))                                                   AS articles_sans_prix,

  /* 8. Attendu 0 — unite de conditionnement au lieu d'unite de consommation.
        Regle : une quantite se compte en kg, L ou piece. Jamais en sac,
        colis, carton, palette : la precision se perd a l'enregistrement. */
  (SELECT count(*) FROM articles WHERE tenant_id=(SELECT tid FROM t)
     AND lower(coalesce(unite,'')) NOT IN ('kg','g','l','ml','piece','pièce','unite','unité'))
                                                                                     AS unites_non_conformes,

  /* 9. Attendu 0 — produit sans prix de vente : non facturable */
  (SELECT count(*) FROM produits WHERE tenant_id=(SELECT tid FROM t)
     AND coalesce(prix_vente,0)=0)                                                   AS produits_sans_prix_vente,

  /* 10. A regarder — recette anormalement courte par rapport aux autres :
         signale une recette saisie a moitie. Seuil = mediane - 2 lignes. */
  (SELECT count(*) FROM (
     SELECT r.produit_id, count(*) AS n FROM recettes r
      WHERE r.tenant_id=(SELECT tid FROM t) GROUP BY r.produit_id
   ) c WHERE c.n < (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY n) - 2 FROM (
     SELECT count(*) AS n FROM recettes WHERE tenant_id=(SELECT tid FROM t) GROUP BY produit_id) m))
                                                                                     AS recettes_trop_courtes,

  /* 11. Attendu ecart nul — cout_revient stocke vs recalcule depuis la recette */
  (SELECT count(*) FROM produits p WHERE p.tenant_id=(SELECT tid FROM t)
     AND EXISTS (SELECT 1 FROM recettes r WHERE r.produit_id=p.id)
     AND abs(coalesce(p.cout_revient,0) - coalesce((
         SELECT sum(r.quantite*a.prix) FROM recettes r JOIN articles a ON a.id=r.article_id
          WHERE r.produit_id=p.id),0)) > 0.01)                                       AS couts_revient_desynchronises,

  /* 13. A regarder — recette dont le poids d'entree s'ecarte de plus de 50 %
         de la mediane des autres recettes. Detecte une recette saisie pour
         plusieurs unites, ou une quantite totale recopiee sur chaque ligne.
         Generique : compare les recettes entre elles, sans connaitre le
         format du produit. A trouve chez Pascal une recette a ratio 3,37
         quand toutes les autres sont a 1,20. */
  (SELECT count(*) FROM (
     SELECT r.produit_id, sum(r.quantite) AS poids FROM recettes r
       JOIN articles a ON a.id=r.article_id
      WHERE r.tenant_id=(SELECT tid FROM t) AND lower(a.unite) IN ('kg','l')
      GROUP BY r.produit_id
   ) x WHERE x.poids > 1.5 * (SELECT med FROM (
       SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY poids) AS med FROM (
         SELECT sum(r.quantite) AS poids FROM recettes r JOIN articles a ON a.id=r.article_id
          WHERE r.tenant_id=(SELECT tid FROM t) AND lower(a.unite) IN ('kg','l')
          GROUP BY r.produit_id) y) z)
       OR x.poids < 0.5 * (SELECT med FROM (
       SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY poids) AS med FROM (
         SELECT sum(r.quantite) AS poids FROM recettes r JOIN articles a ON a.id=r.article_id
          WHERE r.tenant_id=(SELECT tid FROM t) AND lower(a.unite) IN ('kg','l')
          GROUP BY r.produit_id) y) z))                                              AS poids_recette_aberrant,

  /* 12. Invariant a noter avant et apres toute operation de masse */
  (SELECT round(sum(r.quantite*a.prix)::numeric,6) FROM recettes r
     JOIN articles a ON a.id=r.article_id WHERE r.tenant_id=(SELECT tid FROM t))     AS invariant_cout_recettes;
