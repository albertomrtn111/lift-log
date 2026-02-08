-- Fix inconsistent active plans that have an end date
-- Active plans should NOT have an effective_to date until they are archived.

UPDATE diet_plans
SET effective_to = NULL
WHERE status = 'active';

-- Optional: Verify the fix
-- SELECT id, name, status, effective_to FROM diet_plans WHERE status = 'active';
