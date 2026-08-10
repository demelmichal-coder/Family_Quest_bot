-- Navrh DB schematu pro secure Telegram auth flow (referencni SQL)
-- Poznamka: produkcni aplikace pouziva SQLAlchemy modely v backend/models.py.

CREATE TABLE IF NOT EXISTS families (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_name VARCHAR(120) NOT NULL,
    unique_code VARCHAR(16) NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    -- Telegram ID jako primarni identita uzivatele
    id VARCHAR(32) PRIMARY KEY,
    name VARCHAR(120),
    role VARCHAR(16) NOT NULL CHECK (role IN ('parent', 'child', 'pending')),
    family_id INTEGER NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (family_id) REFERENCES families(id)
);

CREATE INDEX IF NOT EXISTS idx_users_family_id ON users(family_id);
CREATE INDEX IF NOT EXISTS idx_families_unique_code ON families(unique_code);
