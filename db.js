const Database = require("better-sqlite3");
const fs = require("fs");

const db = new Database("matbakh.db");
db.pragma("foreign_keys = ON");
db.exec(fs.readFileSync("schema.sql", "utf8"));

function seed() {
  const company = db.prepare("SELECT id FROM companies WHERE code=?").get("C100");
  let companyId = company?.id;
  if (!companyId) {
    const r = db.prepare("INSERT INTO companies(code,name) VALUES(?,?)")
      .run("C100", "شرکت نمونه");
    companyId = r.lastInsertRowid;
  }

  const foods = ["چلو کباب کوبیده","زرشک پلو با مرغ","قورمه سبزی","قیمه سیب‌زمینی","جوجه کباب","چلو ماهی"];
  const foodIds = [];
  for (const name of foods) {
    let f = db.prepare("SELECT id FROM foods WHERE name=?").get(name);
    if (!f) {
      const r = db.prepare("INSERT INTO foods(name,description,price) VALUES(?,?,?)")
        .run(name, "غذای روز", 0);
      f = {id:r.lastInsertRowid};
    }
    foodIds.push(f.id);
  }

  for (const id of foodIds)
    db.prepare("INSERT OR IGNORE INTO company_foods(company_id,food_id) VALUES(?,?)").run(companyId,id);

  // Passwords are intentionally simple in this starter. Replace with bcrypt/argon2 before production.
  const addUser = (role, company_id, code, name, password) => {
    const exists = db.prepare("SELECT id FROM users WHERE role=? AND company_id IS ? AND code=?")
      .get(role, company_id, code);
    if (!exists) db.prepare(
      "INSERT INTO users(role,company_id,code,name,password_hash) VALUES(?,?,?,?,?)"
    ).run(role, company_id, code, name, password);
  };

  addUser("restaurant_admin", null, "admin", "مدیر مطبخ چلو هشت", "123456");
  addUser("company_admin", companyId, "M100", "مدیر شرکت نمونه", "123456");
  addUser("employee", companyId, "E1001", "پرسنل نمونه ۱", "123456");
  addUser("employee", companyId, "E1002", "پرسنل نمونه ۲", "123456");
}
seed();

module.exports = db;
