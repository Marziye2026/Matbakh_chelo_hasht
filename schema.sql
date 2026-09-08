PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK(role IN ('restaurant_admin','company_admin','employee')),
  company_id INTEGER,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(role, company_id, code),
  FOREIGN KEY(company_id) REFERENCES companies(id)
);

CREATE TABLE IF NOT EXISTS foods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price INTEGER DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS company_foods (
  company_id INTEGER NOT NULL,
  food_id INTEGER NOT NULL,
  PRIMARY KEY(company_id, food_id),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY(food_id) REFERENCES foods(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_menus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  menu_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  UNIQUE(company_id, menu_date),
  FOREIGN KEY(company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS daily_menu_items (
  menu_id INTEGER NOT NULL,
  food_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY(menu_id, food_id),
  UNIQUE(menu_id, position),
  FOREIGN KEY(menu_id) REFERENCES daily_menus(id) ON DELETE CASCADE,
  FOREIGN KEY(food_id) REFERENCES foods(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  employee_id INTEGER NOT NULL,
  menu_id INTEGER NOT NULL,
  food_id INTEGER NOT NULL,
  order_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, order_date),
  FOREIGN KEY(company_id) REFERENCES companies(id),
  FOREIGN KEY(employee_id) REFERENCES users(id),
  FOREIGN KEY(menu_id) REFERENCES daily_menus(id),
  FOREIGN KEY(food_id) REFERENCES foods(id)
);
