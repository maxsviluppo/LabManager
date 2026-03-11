import express from "express";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

dotenv.config();

const app = express();
app.use(express.json());
app.use(cookieParser());

const JWT_SECRET = process.env.JWT_SECRET || "labmanager-secret-key-1-2-3-4-5-6-7-8";

// --- NORMALIZER ---
const getSql = () => {
  const rawUrl = (process.env.DATABASE_URL || process.env.STORAGE_URL || "").trim();
  if (!rawUrl) throw new Error("DATABASE_URL non configurata su Vercel.");
  let cleanUrl = rawUrl.split('?')[0];
  if (cleanUrl.startsWith("postgresql://")) cleanUrl = cleanUrl.replace("postgresql://", "postgres://");
  return neon(cleanUrl);
};

// --- SCHEMA ---
let _schemaDone = false;
async function ensureSchema() {
  if (_schemaDone) return;
  const sql = getSql();
  try {
    // Individual queries for better compatibility with serverless HTTP driver
    await sql`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL)`;
    await sql`CREATE TABLE IF NOT EXISTS laboratories (id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT)`;
    await sql`CREATE TABLE IF NOT EXISTS materials (id SERIAL PRIMARY KEY, laboratory_id INTEGER, name TEXT NOT NULL, unit TEXT NOT NULL, total_quantity REAL DEFAULT 0, used_quantity REAL DEFAULT 0, unit_cost REAL DEFAULT 0, location TEXT, archive_id INTEGER, FOREIGN KEY (laboratory_id) REFERENCES laboratories(id))`;
    await sql`CREATE TABLE IF NOT EXISTS income (id SERIAL PRIMARY KEY, laboratory_id INTEGER, description TEXT NOT NULL, amount REAL NOT NULL, date TEXT NOT NULL, FOREIGN KEY (laboratory_id) REFERENCES laboratories(id))`;
    await sql`CREATE TABLE IF NOT EXISTS expenses (id SERIAL PRIMARY KEY, laboratory_id INTEGER, category TEXT NOT NULL, description TEXT NOT NULL, amount REAL NOT NULL, date TEXT NOT NULL, material_id INTEGER, FOREIGN KEY (laboratory_id) REFERENCES laboratories(id), FOREIGN KEY (material_id) REFERENCES materials(id))`;
    await sql`CREATE TABLE IF NOT EXISTS material_archive (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, unit TEXT NOT NULL, quantity REAL DEFAULT 0)`;

    const users = await sql`SELECT 1 FROM users LIMIT 1`;
    if (users.length === 0) {
      const hp = await bcrypt.hash("admin", 10);
      await sql`INSERT INTO users (username, password) VALUES ('admin', ${hp})`;
    }
    _schemaDone = true;
  } catch (e) {
    console.error("Schema error:", e);
    throw e;
  }
}

const wrap = (fn: any) => async (req: any, res: any) => {
  try {
    await ensureSchema();
    await fn(req, res);
  } catch (e: any) {
    console.error("Server Error:", e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
};

// --- AUTH ---
app.get("/api/auth/me", (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.json(null);
  try { res.json(jwt.verify(token, JWT_SECRET)); } catch (e) { res.json(null); }
});

app.post("/api/auth/login", wrap(async (req, res) => {
  const { username, password } = req.body;
  const sql = getSql();
  const users = await sql`SELECT * FROM users WHERE username = ${username}`;
  const user = users[0];
  if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ error: "Credenziali non valide" });
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
  res.cookie("token", token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ id: user.id, username: user.username });
}));

app.post("/api/auth/register", wrap(async (req, res) => {
  const { username, password } = req.body;
  const sql = getSql();
  const existing = await sql`SELECT 1 FROM users WHERE username = ${username}`;
  if (existing.length > 0) return res.status(400).json({ error: "Username già esistente" });
  const hp = await bcrypt.hash(password, 10);
  const result = await sql`INSERT INTO users (username, password) VALUES (${username}, ${hp}) RETURNING id, username`;
  const token = jwt.sign({ id: result[0].id, username: result[0].username }, JWT_SECRET, { expiresIn: "7d" });
  res.cookie("token", token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json(result[0]);
}));

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ success: true });
});

const authMiddleware = (req: any, res: any, next: any) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch (e) { res.status(401).json({ error: "Invalid Session" }); }
};

// --- DATA ---
app.get("/api/laboratories", authMiddleware, wrap(async (req, res) => {
  const sql = getSql();
  const labs = await sql`SELECT * FROM laboratories`;
  const labsWithProfit = await Promise.all(labs.map(async (l) => {
    const i = await sql`SELECT SUM(amount) as t FROM income WHERE laboratory_id = ${l.id}`;
    const e = await sql`SELECT SUM(amount) as t FROM expenses WHERE laboratory_id = ${l.id}`;
    return { ...l, netProfit: Number(i[0]?.t || 0) - Number(e[0]?.t || 0) };
  }));
  res.json(labsWithProfit);
}));

app.post("/api/laboratories", authMiddleware, wrap(async (req, res) => {
  const sql = getSql();
  const r = await sql`INSERT INTO laboratories (name, description) VALUES (${req.body.name}, ${req.body.description}) RETURNING *`;
  res.json(r[0]);
}));

app.delete("/api/laboratories/:id", authMiddleware, wrap(async (req, res) => {
  const sql = getSql();
  const id = parseInt(req.params.id);
  await sql`DELETE FROM materials WHERE laboratory_id = ${id}`;
  await sql`DELETE FROM income WHERE laboratory_id = ${id}`;
  await sql`DELETE FROM expenses WHERE laboratory_id = ${id}`;
  await sql`DELETE FROM laboratories WHERE id = ${id}`;
  res.json({ success: true });
}));

app.post("/api/laboratories/:id/clear", authMiddleware, wrap(async (req, res) => {
  const sql = getSql();
  const id = parseInt(req.params.id);
  await sql`DELETE FROM materials WHERE laboratory_id = ${id}`;
  await sql`DELETE FROM income WHERE laboratory_id = ${id}`;
  await sql`DELETE FROM expenses WHERE laboratory_id = ${id}`;
  res.json({ success: true });
}));

// Materials
app.get("/api/materials", authMiddleware, wrap(async (req, res) => {
  const sql = getSql();
  res.json(await sql`SELECT * FROM materials WHERE laboratory_id = ${parseInt(req.query.laboratory_id as string)}`);
}));

app.post("/api/materials", authMiddleware, wrap(async (req, res) => {
  const sql = getSql();
  const { laboratory_id, name, unit, total_quantity, unit_cost, location } = req.body;
  
  // 1. Sync with Archive (Magazzino)
  let archive = await sql`SELECT id FROM material_archive WHERE name = ${name}`;
  let final_archive_id;
  if (archive[0]) {
    final_archive_id = archive[0].id;
    await sql`UPDATE material_archive SET quantity = quantity + ${total_quantity} WHERE id = ${final_archive_id}`;
  } else {
    const archRes = await sql`INSERT INTO material_archive (name, unit, quantity) VALUES (${name}, ${unit}, ${total_quantity}) RETURNING id`;
    final_archive_id = archRes[0].id;
  }

  // 2. Add to Lab
  const r = await sql`INSERT INTO materials (laboratory_id, name, unit, total_quantity, used_quantity, unit_cost, location, archive_id) VALUES (${laboratory_id}, ${name}, ${unit}, ${total_quantity}, 0, ${unit_cost}, ${location}, ${final_archive_id}) RETURNING id`;
  
  // 3. Register Expense
  await sql`INSERT INTO expenses (laboratory_id, category, description, amount, date, material_id) VALUES (${laboratory_id}, 'material_purchase', ${`Acquisto: ${name}`}, ${total_quantity * unit_cost}, ${new Date().toISOString()}, ${r[0].id})`;
  
  res.json({ success: true });
}));

app.put("/api/materials/:id", authMiddleware, wrap(async (req, res) => {
  const sql = getSql();
  const id = parseInt(req.params.id);
  const { name, unit, total_quantity, used_quantity, unit_cost, location } = req.body;
  
  // Update archive if linked
  const current = await sql`SELECT archive_id, total_quantity FROM materials WHERE id = ${id}`;
  if (current[0]?.archive_id) {
    const delta = Number(total_quantity) - Number(current[0].total_quantity);
    await sql`UPDATE material_archive SET quantity = quantity + ${delta} WHERE id = ${current[0].archive_id}`;
  }
  
  await sql`UPDATE materials SET name=${name}, unit=${unit}, total_quantity=${total_quantity}, used_quantity=${used_quantity}, unit_cost=${unit_cost}, location=${location} WHERE id=${id}`;
  res.json({ success: true });
}));

app.patch("/api/materials/:id/usage", authMiddleware, wrap(async (req, res) => {
  const sql = getSql();
  const id = parseInt(req.params.id);
  const { used_quantity } = req.body;
  await sql`UPDATE materials SET used_quantity = used_quantity + ${used_quantity} WHERE id = ${id}`;
  const m = await sql`SELECT archive_id FROM materials WHERE id=${id}`;
  if (m[0]?.archive_id) {
    await sql`UPDATE material_archive SET quantity = quantity - ${used_quantity} WHERE id = ${m[0].archive_id}`;
  }
  res.json({ success: true });
}));

app.delete("/api/materials/:id", authMiddleware, wrap(async (req, res) => {
  const sql = getSql();
  const id = parseInt(req.params.id);
  
  // Subtract remaining from archive on delete? 
  // If a lab material is deleted, we assume it's removed from global stock too.
  const m = await sql`SELECT archive_id, total_quantity, used_quantity FROM materials WHERE id = ${id}`;
  if (m[0]?.archive_id) {
    const remaining = Number(m[0].total_quantity) - Number(m[0].used_quantity);
    await sql`UPDATE material_archive SET quantity = quantity - ${remaining} WHERE id = ${m[0].archive_id}`;
  }

  await sql`DELETE FROM expenses WHERE material_id = ${id}`;
  await sql`DELETE FROM materials WHERE id = ${id}`;
  res.json({ success: true });
}));

// Income
app.get("/api/income", authMiddleware, wrap(async (req, res) => {
  const sql = getSql();
  res.json(await sql`SELECT * FROM income WHERE laboratory_id = ${parseInt(req.query.laboratory_id as string)} ORDER BY date DESC`);
}));

app.post("/api/income", authMiddleware, wrap(async (req, res) => {
  const sql = getSql();
  const { laboratory_id, description, amount, date } = req.body;
  await sql`INSERT INTO income (laboratory_id, description, amount, date) VALUES (${laboratory_id}, ${description}, ${amount}, ${date || new Date().toISOString()})`;
  res.json({ success: true });
}));

app.delete("/api/income/:id", authMiddleware, wrap(async (req, res) => {
  const sql = getSql();
  await sql`DELETE FROM income WHERE id = ${parseInt(req.params.id)}`;
  res.json({ success: true });
}));

// Expenses
app.get("/api/expenses", authMiddleware, wrap(async (req, res) => {
  const sql = getSql();
  res.json(await sql`SELECT * FROM expenses WHERE laboratory_id = ${parseInt(req.query.laboratory_id as string)} ORDER BY date DESC`);
}));

app.post("/api/expenses", authMiddleware, wrap(async (req, res) => {
  const sql = getSql();
  const { laboratory_id, category, description, amount, date } = req.body;
  await sql`INSERT INTO expenses (laboratory_id, category, description, amount, date) VALUES (${laboratory_id}, ${category}, ${description}, ${amount}, ${date || new Date().toISOString()})`;
  res.json({ success: true });
}));

app.delete("/api/expenses/:id", authMiddleware, wrap(async (req, res) => {
  const sql = getSql();
  await sql`DELETE FROM expenses WHERE id = ${parseInt(req.params.id)}`;
  res.json({ success: true });
}));

// Archive
app.get("/api/archive", authMiddleware, wrap(async (req, res) => {
  const sql = getSql();
  res.json(await sql`SELECT * FROM material_archive ORDER BY name ASC`);
}));

app.post("/api/archive", authMiddleware, wrap(async (req, res) => {
  const sql = getSql();
  const { name, unit, quantity } = req.body;
  await sql`INSERT INTO material_archive (name, unit, quantity) VALUES (${name}, ${unit}, ${quantity || 0})`;
  res.json({ success: true });
}));

app.delete("/api/archive/:id", authMiddleware, wrap(async (req, res) => {
  const sql = getSql();
  await sql`DELETE FROM material_archive WHERE id = ${parseInt(req.params.id)}`;
  res.json({ success: true });
}));

app.post("/api/archive/transfer", authMiddleware, wrap(async (req, res) => {
  const sql = getSql();
  const { archive_id, laboratory_id, quantity } = req.body;
  const a = await sql`SELECT * FROM material_archive WHERE id = ${archive_id}`;
  if (!a[0] || Number(a[0].quantity) < quantity) return res.status(400).json({ error: "Insufficient quantity" });
  await sql`UPDATE material_archive SET quantity = quantity - ${quantity} WHERE id = ${archive_id}`;
  const ex = await sql`SELECT * FROM materials WHERE laboratory_id = ${laboratory_id} AND archive_id = ${archive_id}`;
  if (ex[0]) {
    await sql`UPDATE materials SET total_quantity = total_quantity + ${quantity} WHERE id = ${ex[0].id}`;
  } else {
    await sql`INSERT INTO materials (laboratory_id, name, unit, total_quantity, used_quantity, unit_cost, location, archive_id) VALUES (${laboratory_id}, ${a[0].name}, ${a[0].unit}, ${quantity}, 0, 0, '', ${archive_id})`;
  }
  res.json({ success: true });
}));

// Summary
app.get("/api/summary", authMiddleware, wrap(async (req, res) => {
  const sql = getSql();
  const lid = parseInt(req.query.laboratory_id as string);
  const inc = await sql`SELECT SUM(amount) as t FROM income WHERE laboratory_id = ${lid}`;
  const exp = await sql`SELECT SUM(amount) as t FROM expenses WHERE laboratory_id = ${lid}`;
  const mat = await sql`SELECT SUM(amount) as t FROM expenses WHERE laboratory_id = ${lid} AND category = 'material_purchase'`;
  const sal = await sql`SELECT SUM(amount) as t FROM expenses WHERE laboratory_id = ${lid} AND category = 'salary'`;
  const oth = await sql`SELECT SUM(amount) as t FROM expenses WHERE laboratory_id = ${lid} AND category = 'other'`;
  res.json({
    totalIncome: Number(inc[0]?.t || 0),
    totalExpenses: Number(exp[0]?.t || 0),
    netProfit: Number(inc[0]?.t || 0) - Number(exp[0]?.t || 0),
    breakdown: { materials: Number(mat[0]?.t || 0), salaries: Number(sal[0]?.t || 0), other: Number(oth[0]?.t || 0) }
  });
}));

app.use((req, res) => res.status(404).json({ error: "API Route not found" }));

export default app;
