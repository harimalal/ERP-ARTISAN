-- Migration: Task 15 — Add 'importe' status to import_scan_items
-- Fix: Prevent duplicate imports after partial failures by marking
-- successfully imported items with a distinct 'importe' status.
--
-- Background: Previously both "user confirmed" and "already inserted" used 'confirme',
-- causing re-clicks of "Importer" to re-import already-created items as duplicates.
-- Now: 'confirme' = "user validated", 'importe' = "already inserted in DB, never re-import"

ALTER TABLE import_scan_items DROP CONSTRAINT IF EXISTS import_scan_items_statut_check;
ALTER TABLE import_scan_items ADD CONSTRAINT import_scan_items_statut_check
  CHECK (statut IN ('a_creer', 'deja_existant', 'doublon_possible', 'confirme', 'ignore', 'importe'));
