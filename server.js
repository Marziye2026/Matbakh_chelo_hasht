const express = require("express");
const jwt = require("jsonwebtoken");
const path = require("path");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_THIS_SECRET_IN_PRODUCTION";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function auth(req,res,next){
  try {
    const token = (req.headers.authorization || "").replace("Bearer ","");
    if (!token) return res.status(401).json({error:"احراز هویت لازم است"});
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch { res.status(401).json({error:"نشست معتبر نیست"}); }
}
function role(...roles){
  return (req,res,next)=> roles.includes(req.user.role)
    ? next() : res.status(403).json({error:"دسترسی غیرمجاز"});
}

app.post("/api/login",(req,res)=>{
  const {role, companyCode, code, password} = req.body;
  let u;
  if(role==="restaurant_admin")
    u=db.prepare("SELECT * FROM users WHERE role='restaurant_admin' AND code=? AND active=1").get(code);
  else
    u=db.prepare("SELECT * FROM users WHERE role=? AND company_id=(SELECT id FROM companies WHERE code=? AND active=1) AND code=? AND active=1")
      .get(role, companyCode, code);

  if(!u || u.password_hash !== password) return res.status(401).json({error:"اطلاعات ورود صحیح نیست"});
  const token=jwt.sign({id:u.id,role:u.role,companyId:u.company_id,code:u.code,name:u.name},JWT_SECRET,{expiresIn:"12h"});
  res.json({token,user:{role:u.role,companyId:u.company_id,name:u.name,code:u.code}});
});

app.get("/api/me",auth,(req,res)=>res.json(req.user));

app.get("/api/menu/:date",auth,(req,res)=>{
  const companyId=req.user.companyId;
  if(!companyId) return res.json({date:req.params.date,foods:[]});
  const menu=db.prepare(`
    SELECT dm.id, dm.menu_date, f.id food_id, f.name, f.description
    FROM daily_menus dm JOIN daily_menu_items dmi ON dmi.menu_id=dm.id
    JOIN foods f ON f.id=dmi.food_id
    WHERE dm.company_id=? AND dm.menu_date=?
    ORDER BY dmi.position
  `).all(companyId,req.params.date);
  // Deliberately omit price from employee-facing payload.
  res.json({date:req.params.date,menuId:menu[0]?.id||null,foods:menu.map(x=>({id:x.food_id,name:x.name,description:x.description}))});
});

app.post("/api/orders",auth,role("employee"),(req,res)=>{
  const {date,foodId}=req.body;
  if(!date || !foodId) return res.status(400).json({error:"روز و غذا الزامی است"});
  const menu=db.prepare(`
    SELECT dm.id FROM daily_menus dm
    JOIN daily_menu_items dmi ON dmi.menu_id=dm.id
    WHERE dm.company_id=? AND dm.menu_date=? AND dmi.food_id=?
  `).get(req.user.companyId,date,foodId);
  if(!menu) return res.status(400).json({error:"این غذا برای این روز در منوی شرکت نیست"});
  try {
    db.prepare("INSERT INTO orders(company_id,employee_id,menu_id,food_id,order_date) VALUES(?,?,?,?,?)")
      .run(req.user.companyId,req.user.id,menu.id,foodId,date);
    res.json({ok:true,message:"سفارش با موفقیت نهایی شد و قابل تغییر نیست."});
  } catch(e) {
    if(String(e.message).includes("UNIQUE")) return res.status(409).json({error:"برای این روز قبلاً سفارش ثبت کرده‌اید و قابل تغییر نیست."});
    res.status(500).json({error:"خطا در ثبت سفارش"});
  }
});

app.get("/api/my-orders",auth,role("employee"),(req,res)=>{
  const rows=db.prepare(`
    SELECT order_date date, f.name food, o.created_at
    FROM orders o JOIN foods f ON f.id=o.food_id
    WHERE o.employee_id=? ORDER BY order_date DESC
  `).all(req.user.id);
  res.json(rows);
});

app.get("/api/companies",auth,role("restaurant_admin"),(req,res)=>{
  res.json(db.prepare("SELECT id,code,name,active FROM companies ORDER BY id DESC").all());
});

app.post("/api/companies",auth,role("restaurant_admin"),(req,res)=>{
  const {code,name}=req.body;
  if(!code||!name) return res.status(400).json({error:"کد و نام شرکت الزامی است"});
  try{
    const r=db.prepare("INSERT INTO companies(code,name) VALUES(?,?)").run(code.trim(),name.trim());
    res.json({id:r.lastInsertRowid});
  }catch{res.status(409).json({error:"کد شرکت تکراری است"});}
});

app.get("/api/foods",auth,role("restaurant_admin","company_admin"),(req,res)=>{
  if(req.user.role==="restaurant_admin")
    return res.json(db.prepare("SELECT id,name,description,active FROM foods ORDER BY name").all());
  res.json(db.prepare(`
    SELECT f.id,f.name,f.description,f.active
    FROM foods f JOIN company_foods cf ON cf.food_id=f.id
    WHERE cf.company_id=? AND f.active=1 ORDER BY f.name
  `).all(req.user.companyId));
});

app.post("/api/foods",auth,role("restaurant_admin"),(req,res)=>{
  const {name,description=""}=req.body;
  if(!name) return res.status(400).json({error:"نام غذا الزامی است"});
  const r=db.prepare("INSERT INTO foods(name,description) VALUES(?,?)").run(name,description);
  res.json({id:r.lastInsertRowid});
});

app.post("/api/company-foods",auth,role("restaurant_admin"),(req,res)=>{
  const {companyId,foodId}=req.body;
  db.prepare("INSERT OR IGNORE INTO company_foods(company_id,food_id) VALUES(?,?)").run(companyId,foodId);
  res.json({ok:true});
});

app.post("/api/menus",auth,role("restaurant_admin","company_admin"),(req,res)=>{
  const companyId=req.user.role==="company_admin"?req.user.companyId:req.body.companyId;
  const {date,foodIds}=req.body;
  if(!companyId||!date||!Array.isArray(foodIds)||foodIds.length!==4)
    return res.status(400).json({error:"شرکت، تاریخ و دقیقاً ۴ غذا لازم است"});
  const allowed=db.prepare(`
    SELECT food_id FROM company_foods WHERE company_id=? AND food_id IN (${foodIds.map(()=>"?").join(",")})
  `).all(companyId,...foodIds).length;
  if(allowed!==4) return res.status(400).json({error:"همه غذاها در لیست مجاز شرکت نیستند"});
  const tx=db.transaction(()=>{
    db.prepare("INSERT INTO daily_menus(company_id,menu_date) VALUES(?,?) ON CONFLICT(company_id,menu_date) DO UPDATE SET status='published'")
      .run(companyId,date);
    const menu=db.prepare("SELECT id FROM daily_menus WHERE company_id=? AND menu_date=?").get(companyId,date);
    db.prepare("DELETE FROM daily_menu_items WHERE menu_id=?").run(menu.id);
    foodIds.forEach((f,i)=>db.prepare("INSERT INTO daily_menu_items(menu_id,food_id,position) VALUES(?,?,?)").run(menu.id,f,i+1));
  });
  tx();
  res.json({ok:true});
});

app.get("/api/reports",auth,role("restaurant_admin","company_admin"),(req,res)=>{
  const companyId=req.user.role==="company_admin"?req.user.companyId:req.query.companyId;
  const where=companyId?"WHERE o.company_id=?":"";
  const rows=db.prepare(`
    SELECT o.order_date date,c.name company,u.name employee,f.name food
    FROM orders o JOIN companies c ON c.id=o.company_id
    JOIN users u ON u.id=o.employee_id JOIN foods f ON f.id=o.food_id
    ${where} ORDER BY o.order_date DESC, c.name, u.name
  `).all(...(companyId?[companyId]:[]));
  res.json(rows);
});

app.get("/api/reports.csv",auth,role("restaurant_admin","company_admin"),(req,res)=>{
  const companyId=req.user.role==="company_admin"?req.user.companyId:req.query.companyId;
  const where=companyId?"WHERE o.company_id=?":"";
  const rows=db.prepare(`
    SELECT o.order_date date,c.name company,u.name employee,f.name food
    FROM orders o JOIN companies c ON c.id=o.company_id
    JOIN users u ON u.id=o.employee_id JOIN foods f ON f.id=o.food_id
    ${where} ORDER BY o.order_date DESC
  `).all(...(companyId?[companyId]:[]));
  const esc=s=>`"${String(s??"").replaceAll('"','""')}"`;
  const csv="\uFEFF"+[["تاریخ","شرکت","پرسنل","غذا"],...rows.map(r=>[r.date,r.company,r.employee,r.food])]
    .map(r=>r.map(esc).join(",")).join("\r\n");
  res.setHeader("Content-Type","text/csv; charset=utf-8");
  res.setHeader("Content-Disposition",'attachment; filename="matbakh-orders.csv"');
  res.send(csv);
});

app.get(/.*/,(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,"0.0.0.0",()=>console.log(`Matbakh Chelo Hasht running on port ${PORT}`));
