-- Normaliza nombres de usuario antiguos a Kevin/Geral y actualiza las restricciones de la tabla.

ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_assigned_to_check;
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_created_by_check;

UPDATE tasks
SET assigned_to = CASE assigned_to
  WHEN 'Ana' THEN 'Kevin'
  WHEN 'Carlos' THEN 'Geral'
  ELSE assigned_to
END
WHERE assigned_to IN ('Ana', 'Carlos');

UPDATE tasks
SET created_by = CASE created_by
  WHEN 'Ana' THEN 'Kevin'
  WHEN 'Carlos' THEN 'Geral'
  ELSE created_by
END
WHERE created_by IN ('Ana', 'Carlos');

ALTER TABLE tasks ADD CONSTRAINT tasks_assigned_to_check
  CHECK (assigned_to IN ('Kevin', 'Geral') OR assigned_to IS NULL);

ALTER TABLE tasks ADD CONSTRAINT tasks_created_by_check
  CHECK (created_by IN ('Kevin', 'Geral') OR created_by IS NULL);
