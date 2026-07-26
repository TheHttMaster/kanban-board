# Pipeline/Board — Kanban de equipo (2 personas)

Tablero Kanban compartido con cuentas propias para Ana y Carlos. Backend en Node/Express,
frontend en HTML + Tailwind + JS puro, datos guardados en un archivo JSON en disco.

## Cómo funciona

- **Cuentas fijas**: solo existen dos usuarios, `Ana` y `Carlos`. Cada uno inicia sesión con
  su propia contraseña (definida por variables de entorno, ver abajo).
- **Tareas compartidas**: ambos ven el mismo tablero en tiempo real (al recargar).
- **Reglas de negocio** aplicadas también en el servidor (no solo visualmente):
  - Una tarea en "Pendiente" no tiene responsable.
  - Al mover a "En Proceso" se exige un responsable (se asigna a quien esté logueado si no se indica otro).
  - En "Evaluación" se conserva quién hizo la tarea, para saber quién debe revisarla.
  - Cualquiera puede tomar una tarea libre o quitársela al otro.

## Correr en local

```bash
npm install
cp .env.example .env   # y edita las contraseñas / secreto
npm start
```

Abre `http://localhost:3000`. Te pedirá iniciar sesión como Ana o Carlos.

## Desplegar en Railway

1. **Sube este proyecto a un repositorio de GitHub** (o usa `railway up` desde la CLI si prefieres no usar Git).
2. En [railway.app](https://railway.app), crea un **New Project → Deploy from GitHub repo** y selecciona este repositorio.
   Railway detecta automáticamente que es un proyecto Node (por `package.json`) y ejecuta `npm install` y `npm start`.
3. Ve a la pestaña **Variables** del servicio y define:
   - `JWT_SECRET` → cualquier texto largo y aleatorio (por ejemplo generado con `openssl rand -hex 32`).
   - `ANA_PASSWORD` → la contraseña que va a usar Ana.
   - `CARLOS_PASSWORD` → la contraseña que va a usar Carlos.
   
   Si no defines estas variables, el servidor arranca igual pero con valores por defecto
   inseguros (`ana123` / `carlos123`) — verás una advertencia en los logs. Cámbialas antes
   de compartir la URL con nadie más.
4. **Base de datos — Postgres**: este proyecto ya no guarda las tareas en un archivo, sino
   en Postgres. Para agregarlo:
   - En tu proyecto de Railway, click **+ New → Database → Add PostgreSQL**.
   - Railway crea automáticamente la variable `DATABASE_URL` y la conecta a tu servicio
     (no tienes que copiar ni pegar ninguna cadena de conexión a mano).
   - Al arrancar, el servidor corre las migraciones (`db/migrations/*.sql`) solas —
     crean la tabla `tasks` si no existe — y siembra las tareas iniciales (las de
     `tareas.txt`) si la tabla está vacía. No hay ningún paso manual extra.
   - Si alguna vez quieres correr las migraciones sin levantar el servidor completo
     (por ejemplo antes de un deploy), puedes hacerlo con `npm run migrate`.
5. Railway te da un dominio público (`algo.up.railway.app`) automáticamente. Compártelo con
   tu compañero — cada quien inicia sesión con su usuario.

## Migraciones

Las migraciones viven en `db/migrations/`, como archivos `.sql` numerados
(`001_init.sql`, `002_...sql`, etc.). Cada una se aplica **una sola vez**: el servidor
lleva un registro en la tabla `schema_migrations` para saber cuáles ya corrió. Esto
significa que:

- Puedes desplegar tranquilamente las veces que quieras — las migraciones ya aplicadas
  no se vuelven a correr.
- Si más adelante necesitas cambiar el esquema (por ejemplo, agregar una columna), creas
  un nuevo archivo `db/migrations/002_algo.sql` con el `ALTER TABLE` correspondiente, y
  se aplicará solo en el siguiente arranque (o al correr `npm run migrate`).

## Estructura del proyecto

```
kanban-app/
├── server.js              # API + autenticación (usa db/index.js para todo lo de datos)
├── package.json
├── .env.example            # variables de entorno de referencia
├── db/
│   ├── index.js             # pool de conexión, migraciones, seed, y CRUD de tareas
│   ├── migrate.js            # runner standalone (npm run migrate)
│   └── migrations/
│       └── 001_init.sql       # crea la tabla `tasks`
└── public/
    ├── login.html            # pantalla de inicio de sesión
    └── index.html             # el tablero
```

## Notas y próximos pasos posibles

- Las contraseñas se guardan como hash (bcrypt) en memoria al arrancar el servidor, nunca en texto plano en disco ni en la base de datos.
- La sesión se guarda en una cookie httpOnly firmada con JWT (30 días de duración).
- Si más adelante necesitan más de 2 usuarios (por ejemplo un tercer dev), lo natural
  sería mover la lista de `USERS` en `server.js` a su propia tabla en Postgres, con
  contraseñas hasheadas y guardadas ahí en vez de en variables de entorno — avísame si
  quieres que lo prepare así.
