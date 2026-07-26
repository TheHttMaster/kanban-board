"use strict";

// Permite correr las migraciones a mano: npm run migrate
// (el servidor también las corre solo al arrancar, esto es útil para
// aplicarlas de antemano o revisarlas en CI).
const { runMigrations, pool } = require("./index");

runMigrations()
  .then(() => {
    console.log("[migrate] esquema al día.");
    return pool.end();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[migrate] error:", err);
    process.exit(1);
  });
