-- 001_init.sql
-- Crea la tabla principal de tareas del tablero.

CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  category     TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'pendiente'
               CHECK (status IN ('pendiente', 'proceso', 'evaluacion', 'completado')),
  assigned_to  TEXT CHECK (assigned_to IN ('Kevin', 'Geral', 'Ana', 'Carlos') OR assigned_to IS NULL),
  created_by   TEXT CHECK (created_by IN ('Kevin', 'Geral', 'Ana', 'Carlos') OR created_by IS NULL),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks (assigned_to);
