"use strict";

const { Pool } = require("pg");
const { nanoid } = require("nanoid");
const fs = require("fs");
const path = require("path");

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn(
    "[warn] DATABASE_URL no está definida. Define esta variable con la cadena de conexión de Postgres " +
    "(Railway la agrega automáticamente al añadir el plugin de Postgres al proyecto)."
  );
}

// Las conexiones remotas (Railway, Heroku, etc.) casi siempre requieren SSL;
// una conexión a localhost (pruebas locales) normalmente no.
const isLocal = connectionString && /localhost|127\.0\.0\.1/.test(connectionString);
const ssl = connectionString && !isLocal ? { rejectUnauthorized: false } : false;

const pool = new Pool({ connectionString, ssl });

pool.on("error", (err) => {
  console.error("[db] Error inesperado en el pool de Postgres:", err);
});

// ---------------------------------------------------------------------------
// Migraciones: aplica en orden los .sql de ./migrations que no se hayan
// corrido todavía, registrándolos en schema_migrations. Idempotente: se
// puede llamar en cada arranque del servidor sin problema.
// ---------------------------------------------------------------------------
function normalizeUserName(value) {
  if (!value) return null;
  if (value === "Ana") return "Kevin";
  if (value === "Carlos") return "Geral";
  if (value === "Kevin" || value === "Geral") return value;
  return value;
}

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function runMigrations() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const { rows } = await pool.query("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.name));

  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`[migrate] aplicada: ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`[migrate] falló ${file}:`, err.message);
      throw err;
    } finally {
      client.release();
    }
  }
}

// ---------------------------------------------------------------------------
// Seed: inserta las tareas iniciales (derivadas de tareas.txt) solo si la
// tabla está vacía. No pisa datos existentes.
// ---------------------------------------------------------------------------
const SEED_TASKS = [
  ["Migas de pan", "Hacer que las migas de pan regresen a la vista que indican (colocar en todas las vistas)", "generales"],
  ["Foto de perfil", "Quitar la foto de perfil; colocar las iniciales del nombre de usuario o un ícono", "generales"],
  ["Colores de botones", "Cambiar los colores de los botones", "generales"],
  ["Términos consistentes", "Revisar los módulos para asegurar que se manejen los mismos términos", "generales"],
  ["Asterisco obligatorios", "Colocar asterisco en todos los campos obligatorios", "generales"],

  ["Mensaje recuperar contraseña", "Arreglar el mensaje de recuperar contraseña, usando un tono más profesional en tercera persona", "login"],
  ["Mensaje credencial incorrecta", "Mostrar el mensaje \"Usuario o contraseña incorrecta\" cuando alguna credencial sea incorrecta", "login"],
  ["Alerta de inicio de sesión", "Colocar el mensaje de alerta de inicio de sesión debajo del campo de contraseña", "login"],

  ["Indicador usuarios conectados", "Volver a colocar el indicador de usuarios conectados", "dashboard"],
  ["Indicador deforestación crítica", "Agregar indicador de cantidad de polígonos con deforestación crítica", "dashboard"],
  ["Quitar indicador usuario técnico", "Quitar el indicador del usuario técnico", "dashboard"],
  ["Renombrar 'usuario más activo'", "Cambiar 'usuario más activo' por 'desempeño del trabajador'; limitar el número de usuarios listados y no contar inicio/cierre de sesión como acción de alto valor", "dashboard"],
  ["Actividades recientes", "En el indicador de actividades recientes no mostrar acciones de inicio y cierre de sesión", "dashboard"],

  ["Alerta al modificar correo", "Mostrar alerta y confirmación al momento de modificar el correo", "perfil"],
  ["Reordenar soporte en sidebar", "Mover el botón de soporte de usuario arriba de 'Desarrolladores' en el sidebar", "perfil"],

  ["Apartado fuera del sistema", "Colocar el apartado de Desarrolladores fuera del sistema para que todos tengan acceso", "desarrolladores"],
  ["Texto promocional", "Mejorar el texto promocional de los desarrolladores, manteniendo un discurso en tercera persona", "desarrolladores"],

  ["Reporte en PDF", "Agregar un reporte en PDF de las acciones", "historial"],
  ["Calendario de rango de fechas", "Agregar un calendario para definir el periodo de fechas del reporte; permitir generar por usuario y por rol", "historial"],

  ["Definir estados de usuario", "Definir los estados a utilizar, ya que los actuales generan incongruencia", "usuarios"],
  ["Quitar rol técnico", "Quitar el nivel de rol técnico", "usuarios"],
  ["Mejorar filtrado", "Mejorar el filtrado, ya que no está mostrando algo de valor", "usuarios"],
  ["Rol al registrar usuario", "Quitar el select para cambiar el rol; mostrar el rol del usuario y asignarlo al momento de registrar", "usuarios"],
  ["Nuevos atributos de usuario", "Replantear los datos solicitados: pedir cédula, teléfono y dirección", "usuarios"],
  ["Contraseña automática por correo", "Generar contraseñas automáticas al crear un usuario nuevo y enviarlas al correo electrónico", "usuarios"],
  ["Botón restablecer contraseña", "Agregar botón de restablecer contraseña", "usuarios"],
  ["Validar campo numérico", "Revisar el campo que permite ingresar letras cuando debería aceptar solo números", "usuarios"],
  ["Mover validaciones de contraseña", "Quitar las validaciones del campo contraseña de este módulo y moverlas al perfil de usuario (mantener la alerta en una sola caja)", "usuarios"],
  ["Mensaje contraseña por correo", "Colocar el mensaje 'La contraseña será enviada al correo'", "usuarios"],

  ["Estética habilitar/deshabilitar", "Mejorar la estética de los botones de deshabilitar y habilitar usuario", "usuarios deshabilitados"],

  ["Iconos consistentes", "Mejorar los iconos y colores; el icono para habilitar un productor no coincide con el de los demás módulos", "productores"],
];

async function seedIfEmpty() {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM tasks");
  if (rows[0].count > 0) return;

  const now = Date.now();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < SEED_TASKS.length; i++) {
      const [title, description, category] = SEED_TASKS[i];
      const createdAt = new Date(now - (SEED_TASKS.length - i) * 3600 * 1000).toISOString();
      await client.query(
        `INSERT INTO tasks (id, title, description, category, status, assigned_to, created_by, created_at)
         VALUES ($1, $2, $3, $4, 'pendiente', NULL, NULL, $5)`,
        [nanoid(10), title, description, category, createdAt]
      );
    }
    await client.query("COMMIT");
    console.log(`[seed] ${SEED_TASKS.length} tareas iniciales insertadas.`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[seed] falló:", err.message);
    throw err;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Mapeo de filas (snake_case en la DB) al formato que espera el frontend
// (camelCase, igual que la versión anterior basada en JSON).
// ---------------------------------------------------------------------------
function mapRow(r) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    category: r.category,
    status: r.status,
    assignedTo: normalizeUserName(r.assigned_to),
    createdBy: normalizeUserName(r.created_by),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  };
}

// ---------------------------------------------------------------------------
// CRUD de tareas
// ---------------------------------------------------------------------------
async function listTasks() {
  const { rows } = await pool.query("SELECT * FROM tasks ORDER BY created_at ASC");
  return rows.map(mapRow);
}

async function createTask({ title, description, category, createdBy }) {
  const normalizedCreatedBy = normalizeUserName(createdBy);
  const { rows } = await pool.query(
    `INSERT INTO tasks (id, title, description, category, status, assigned_to, created_by, created_at)
     VALUES ($1, $2, $3, $4, 'pendiente', NULL, $5, now())
     RETURNING *`,
    [nanoid(10), title, description || "", category || "", normalizedCreatedBy || null]
  );
  return mapRow(rows[0]);
}

async function updateTask(id, { title, description, category }) {
  const { rows } = await pool.query(
    `UPDATE tasks SET
       title = COALESCE($1, title),
       description = COALESCE($2, description),
       category = COALESCE($3, category)
     WHERE id = $4
     RETURNING *`,
    [title, description, category, id]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

async function deleteTask(id) {
  const { rowCount } = await pool.query("DELETE FROM tasks WHERE id = $1", [id]);
  return rowCount > 0;
}

// Tomar una tarea: la asigna a `user` y la mueve a "proceso".
async function takeTask(id, user) {
  const normalizedUser = normalizeUserName(user);
  const { rows } = await pool.query(
    `UPDATE tasks SET assigned_to = $1, status = 'proceso' WHERE id = $2 RETURNING *`,
    [normalizedUser, id]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

// Reasignar el responsable sin cambiar la columna.
async function reassignTask(id, user) {
  const normalizedUser = normalizeUserName(user);
  const { rows } = await pool.query(
    `UPDATE tasks SET assigned_to = $1 WHERE id = $2 RETURNING *`,
    [normalizedUser, id]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

// Mover de columna, aplicando las mismas reglas de negocio que antes:
//  - a "proceso" sin responsable -> se asigna a assignTo (o a currentUser si no viene)
//  - a "pendiente" -> se limpia el responsable
async function moveTask(id, newStatus, assignTo, currentUser) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT * FROM tasks WHERE id = $1 FOR UPDATE", [id]);
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }
    const task = rows[0];

    let nextAssignedTo = task.assigned_to;
    if (newStatus === "proceso" && !nextAssignedTo) {
      nextAssignedTo = normalizeUserName(assignTo || currentUser);
    }
    if (newStatus === "pendiente") {
      nextAssignedTo = null;
    }

    const { rows: updatedRows } = await client.query(
      `UPDATE tasks SET status = $1, assigned_to = $2 WHERE id = $3 RETURNING *`,
      [newStatus, nextAssignedTo, id]
    );
    await client.query("COMMIT");
    return mapRow(updatedRows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  runMigrations,
  seedIfEmpty,
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  takeTask,
  reassignTask,
  moveTask,
};
