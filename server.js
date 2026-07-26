"use strict";

const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Config: 2 fixed accounts. Use Kevin and Geral as the official names.
// Set real passwords via Railway env vars (KEVIN_PASSWORD / GERAL_PASSWORD)
// or keep the legacy ANA_PASSWORD / CARLOS_PASSWORD aliases.
// Falls back to defaults for local testing only — CHANGE THESE IN PRODUCTION.
// ---------------------------------------------------------------------------
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
if (JWT_SECRET === "dev-secret-change-me") {
  console.warn("[warn] Usando JWT_SECRET por defecto. Define JWT_SECRET en tus variables de entorno de Railway.");
}

function normalizeUserName(username) {
  if (username === "Ana") return "Kevin";
  if (username === "Carlos") return "Geral";
  return username;
}

const RAW_USERS = {
  Kevin: process.env.KEVIN_PASSWORD || process.env.ANA_PASSWORD || "ana123",
  Geral: process.env.GERAL_PASSWORD || process.env.CARLOS_PASSWORD || "carlos123",
};
if (!process.env.KEVIN_PASSWORD && !process.env.ANA_PASSWORD || !process.env.GERAL_PASSWORD && !process.env.CARLOS_PASSWORD) {
  console.warn("[warn] Usando contraseñas por defecto (ana123 / carlos123). Define KEVIN_PASSWORD y GERAL_PASSWORD en producción.");
}

const USERS = {};
Object.keys(RAW_USERS).forEach((name) => {
  USERS[name] = { passwordHash: bcrypt.hashSync(RAW_USERS[name], 10) };
});

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

function requireAuth(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "No autenticado" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = normalizeUserName(payload.user);
    next();
  } catch (e) {
    return res.status(401).json({ error: "Sesión inválida o expirada" });
  }
}

// Wrap async route handlers so rejected promises reach an error response
// instead of crashing the process.
function asyncRoute(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

// ---------------------------------------------------------------------------
// Auth routes
// ---------------------------------------------------------------------------
app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const normalizedUsername = normalizeUserName(username);
  const user = USERS[normalizedUsername];
  if (!user || !bcrypt.compareSync(password || "", user.passwordHash)) {
    return res.status(401).json({ error: "Usuario o contraseña incorrecta" });
  }
  const token = jwt.sign({ user: normalizedUsername }, JWT_SECRET, { expiresIn: "30d" });
  res.cookie("token", token, COOKIE_OPTS);
  res.json({ ok: true, user: normalizedUsername });
});

app.post("/api/logout", (req, res) => {
  res.clearCookie("token", COOKIE_OPTS);
  res.json({ ok: true });
});

app.get("/api/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ---------------------------------------------------------------------------
// Task routes
// ---------------------------------------------------------------------------
app.get("/api/tasks", requireAuth, asyncRoute(async (req, res) => {
  res.json(await db.listTasks());
}));

app.post("/api/tasks", requireAuth, asyncRoute(async (req, res) => {
  const { title, description, category } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: "El título es obligatorio" });

  const task = await db.createTask({
    title: title.trim(),
    description: (description || "").trim(),
    category: (category || "").trim(),
    createdBy: req.user,
  });
  res.status(201).json(task);
}));

app.put("/api/tasks/:id", requireAuth, asyncRoute(async (req, res) => {
  const { title, description, category } = req.body || {};
  const task = await db.updateTask(req.params.id, {
    title: title !== undefined ? title.trim() : undefined,
    description: description !== undefined ? description.trim() : undefined,
    category: category !== undefined ? category.trim() : undefined,
  });
  if (!task) return res.status(404).json({ error: "Tarea no encontrada" });
  res.json(task);
}));

app.delete("/api/tasks/:id", requireAuth, asyncRoute(async (req, res) => {
  const ok = await db.deleteTask(req.params.id);
  if (!ok) return res.status(404).json({ error: "Tarea no encontrada" });
  res.json({ ok: true });
}));

// Take a pending / unassigned task
app.post("/api/tasks/:id/take", requireAuth, asyncRoute(async (req, res) => {
  const task = await db.takeTask(req.params.id, req.user);
  if (!task) return res.status(404).json({ error: "Tarea no encontrada" });
  res.json(task);
}));

// Reassign to the other teammate
app.post("/api/tasks/:id/reassign", requireAuth, asyncRoute(async (req, res) => {
  const { user } = req.body || {};
  const normalizedUser = normalizeUserName(user);
  if (!USERS[normalizedUser]) return res.status(400).json({ error: "Usuario inválido" });
  const task = await db.reassignTask(req.params.id, normalizedUser);
  if (!task) return res.status(404).json({ error: "Tarea no encontrada" });
  res.json(task);
}));

// Move between columns, enforcing business rules server-side
const VALID_STATUSES = ["pendiente", "proceso", "evaluacion", "completado"];
app.post("/api/tasks/:id/move", requireAuth, asyncRoute(async (req, res) => {
  const { status, assignTo } = req.body || {};
  const normalizedAssignTo = assignTo ? normalizeUserName(assignTo) : undefined;
  if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: "Estado inválido" });
  if (normalizedAssignTo && !USERS[normalizedAssignTo]) return res.status(400).json({ error: "Usuario inválido" });

  const task = await db.getTask(req.params.id);
  if (!task) return res.status(404).json({ error: "Tarea no encontrada" });

  const requiresAssignment = ["proceso", "evaluacion", "completado"].includes(status);
  const hasAssignment = Boolean(task.assigned_to || task.assignedTo);
  const resolvedAssignTo = normalizedAssignTo || req.user;

  if (requiresAssignment && !hasAssignment && !resolvedAssignTo) {
    return res.status(400).json({ error: "Debes asignar la tarea antes de moverla a En Proceso, Evaluación o Completado." });
  }

  const movedTask = await db.moveTask(req.params.id, status, normalizedAssignTo || req.user, req.user);
  if (!movedTask) return res.status(404).json({ error: "Tarea no encontrada" });
  res.json(movedTask);
}));

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Fallback to index.html for the root route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Generic error handler for asyncRoute failures (e.g. DB connection issues)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor" });
});

// ---------------------------------------------------------------------------
// Boot: run migrations, seed if empty, then start listening.
// ---------------------------------------------------------------------------
async function start() {
  await db.runMigrations();
  await db.seedIfEmpty();
  app.listen(PORT, () => {
    console.log(`Kanban server escuchando en puerto ${PORT}`);
  });
}

start().catch((err) => {
  console.error("No se pudo iniciar el servidor:", err);
  process.exit(1);
});
