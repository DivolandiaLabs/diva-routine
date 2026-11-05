-- Base de datos del panel (D1). Se aplica con:
--   npx wrangler d1 execute diva-routine-admin --remote --file=schema.sql
-- Nunca se guardan claves de licencia completas: solo su huella (sha-256) y los últimos caracteres.
-- Tampoco imágenes ni instrucciones de quien usa la app: las estadísticas son contadores.

CREATE TABLE IF NOT EXISTS licenses (
  hash TEXT PRIMARY KEY,
  tail TEXT NOT NULL,
  kind TEXT NOT NULL,            -- paid (Lemon Squeezy) o comp (de cortesía)
  plan TEXT NOT NULL,
  email TEXT,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  vignettes INTEGER NOT NULL DEFAULT 0,
  blocked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS comps (
  hash TEXT PRIMARY KEY,
  tail TEXT NOT NULL,
  label TEXT NOT NULL,
  plan TEXT NOT NULL,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);

-- Premium concedido a una cuenta de Google desde el panel: basta con iniciar sesión en la app.
CREATE TABLE IF NOT EXISTS grants (
  email TEXT PRIMARY KEY,
  note TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);

-- Cuota a medida de un usuario (plan = custom): tantas viñetas cada tantos días.
CREATE TABLE IF NOT EXISTS grant_limits (
  email TEXT PRIMARY KEY,
  vignettes INTEGER NOT NULL,
  period_days INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  day TEXT NOT NULL,
  model TEXT NOT NULL,
  style TEXT NOT NULL,
  plan TEXT NOT NULL,
  ok INTEGER NOT NULL,
  vignettes INTEGER NOT NULL,
  cost REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS events_day ON events (day);

-- Solo los motores apagados: sin fila, el motor está disponible.
CREATE TABLE IF NOT EXISTS models_off (id TEXT PRIMARY KEY);

-- Fichas de estilo guardadas desde el panel: data es el JSON de la ficha. Sus imágenes van en KV.
-- Sin fila, el estilo usa la ficha de partida de styles.js.
CREATE TABLE IF NOT EXISTS styles (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  activo INTEGER NOT NULL,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  data TEXT NOT NULL
);

-- Versiones anteriores de cada ficha, para poder volver a ellas.
CREATE TABLE IF NOT EXISTS style_versions (
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (id, version)
);
