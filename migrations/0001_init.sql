-- Abrinay Mind · esquema inicial.
-- Un Worker, una base D1. Cada cerebro (un artista) es una fila de `brains`; todo lo demás cuelga de su id.

create table if not exists brains (
  id integer primary key autoincrement,
  slug text not null unique,
  name text not null,
  subtitle text not null default '',
  color text not null default '#8b5cf6',
  created integer not null,
  updated integer not null
);

-- Las neuronas: una nota Markdown con [[enlaces]] y cabecera `clave: valor`.
create table if not exists notes (
  brain_id integer not null references brains(id) on delete cascade,
  name text not null,
  folder text not null default '',
  text text not null,
  bytes integer not null default 0,
  always integer not null default 0,      -- cabecera «siempre: true»: se lee antes de cada letra
  private integer not null default 0,     -- cabecera «privado: true»: nunca se envía a un modelo que entrena con tus datos
  tipo text not null default '',
  alias text not null default '',         -- cabecera «alias:» (para detectar menciones)
  nomention integer not null default 0,   -- cabecera «mencion: false»: su nombre no dispara menciones
  created integer not null,
  updated integer not null,               -- ms; es la «revisión» de la nota (control de concurrencia optimista)
  primary key (brain_id, name)
);
create index if not exists notes_folder on notes (brain_id, folder);
create index if not exists notes_always on notes (brain_id, always);

-- La papelera: 30 días.
create table if not exists notes_trash (
  id integer primary key autoincrement,
  brain_id integer not null,
  name text not null,
  folder text not null,
  text text not null,
  bytes integer not null,
  updated integer not null,
  deleted integer not null,
  by text
);
create index if not exists notes_trash_brain on notes_trash (brain_id, deleted);

-- Las sinapsis visibles: enlaces [[explícitos]], menciones sin enlazar y cercanía de significado.
--   target ... lo que está escrito entre corchetes (o el nombre mencionado); tfold ... sin tildes ni mayúsculas
--   dst ...... el nombre real de la nota a la que apunta, o NULL si el enlace está roto
create table if not exists links (
  brain_id integer not null,
  src text not null,
  tfold text not null,
  target text not null,
  dst text,
  kind text not null check (kind in ('link', 'mention', 'meaning')),
  weight real not null default 1,
  primary key (brain_id, src, tfold, kind)
);
create index if not exists links_dst on links (brain_id, dst);
create index if not exists links_tfold on links (brain_id, tfold);

-- Lo que el cerebro aprendió de tus veredictos (Hebb): parejas de notas que salieron bien juntas y el peso de cada nota.
create table if not exists synapses (
  brain_id integer not null,
  a text not null,
  b text not null,
  weight real not null default 0,
  uses integer not null default 0,
  updated integer not null,
  primary key (brain_id, a, b)
);
create table if not exists note_weights (
  brain_id integer not null,
  name text not null,
  weight real not null default 0,
  uses integer not null default 0,
  updated integer not null,
  primary key (brain_id, name)
);

-- Búsqueda por palabras: pasajes de las notas con BM25 de SQLite (FTS5). `stem` lleva las raíces ya sin tildes.
create table if not exists passages (
  id integer primary key autoincrement,
  brain_id integer not null,
  note text not null,
  idx integer not null,
  head text not null default '',
  text text not null,
  stem text not null,
  hash text not null
);
create index if not exists passages_note on passages (brain_id, note);
create virtual table if not exists passages_fts using fts5(stem, content='passages', content_rowid='id', tokenize='unicode61 remove_diacritics 2');

-- Búsqueda por significado: un vector por nota (Workers AI, bge-m3), cuantizado a 8 bits en base64.
create table if not exists vectors (
  brain_id integer not null,
  name text not null,
  hash text not null,
  model text not null,
  dim integer not null,
  scale real not null,
  v text not null,
  created integer not null,              -- el `updated` de la nota cuando se calculó (si la nota cambia después, el vector está viejo)
  primary key (brain_id, name, model)
);

-- Las letras que el cerebro escribió o que el artista guardó.
create table if not exists songs (
  id text primary key,
  brain_id integer not null,
  title text not null,
  mode text,
  genre text,
  bpm integer,
  brief text not null default '{}',
  text text not null default '',
  status text not null default 'borrador' check (status in ('borrador', 'aprobada', 'rechazada')),
  score real,
  feedback text,
  model text,
  used text not null default '[]',        -- las notas que se leyeron: [{ nombre, energia }]
  parent_id text,
  note_name text,                         -- la nota en la que quedó al aprobarse
  created integer not null,
  updated integer not null
);
create index if not exists songs_brain on songs (brain_id, updated);

-- Conversaciones con el cerebro.
create table if not exists chats (
  id text primary key,
  brain_id integer not null,
  title text not null,
  created integer not null,
  updated integer not null
);
create index if not exists chats_brain on chats (brain_id, updated);
create table if not exists chat_messages (
  id integer primary key autoincrement,
  chat_id text not null references chats(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  meta text not null default '{}',
  created integer not null
);
create index if not exists chat_messages_chat on chat_messages (chat_id, id);

create table if not exists settings (
  key text primary key,
  json text not null,
  updated integer not null
);

-- Cuánto cuesta cada llamada a un modelo.
create table if not exists usage (
  id integer primary key autoincrement,
  at integer not null,
  brain_id integer,
  fn text not null,
  model text not null,
  provider text not null,
  tin integer,
  tout integer,
  usd real,
  ms integer
);
create index if not exists usage_at on usage (at);

create table if not exists audit (
  id integer primary key autoincrement,
  at integer not null,
  brain_id integer,
  kind text not null,
  who text,
  detail text
);

create table if not exists login_attempts (
  ip text not null,
  at integer not null
);
create index if not exists login_attempts_ip on login_attempts (ip, at);
