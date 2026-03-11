import express from "express";
import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

// Note: Do NOT use vite or static serving here. Vercel handles the Frontend.
// This file is ONLY a serverless API function.

dotenv.config();

const app = express();
app.use(express.json());
app.use(cookieParser());

const JWT_SECRET = process.env.JWT_SECRET || "labmanager-secret-key-1-2-3-4-5-6-7-8";

// --- DATABASE CONNECTION HELPER ---
const getSql = () => {
  const rawUrl = (process.env.DATABASE_URL || process.env.STORAGE_URL || "").trim();
  if (!rawUrl) {
    throw new Error("DATABASE_URL is not set in Vercel environment variables.");
  }
  
  // Clean the URL: neon() driver is picky about the pattern.
  // We strip all query params for the serverless driver.
  let cleanUrl = rawUrl.split('?')[0];
  
  // Ensure it starts with postgres:// (standard for most drivers)
  if (cleanUrl.startsWith("postgresql://")) {
    cleanUrl = cleanUrl.replace("postgresql://", "postgres://");
  }
  
  if (!cleanUrl.startsWith("postgres://")) {
    throw new Error("DATABASE_URL must start with postgres:// or postgresql://");
  }

  return neon(cleanUrl);
};

// --- SCHEMA INITIALIZATION (Safe for Serverless) ---
// This will be called on demand, but we use a fast check to avoid overhead.
let _schemaDone = false;
async function ensureSchema() {
  if (_schemaDone) return;
  const sql = getSql();
  console.log("Checking database schema...");
  try {
    // We do one big query for initialization
    await sql.transaction([
      sql`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL)`,
      sql`CREATE TABLE IF NOT EXISTS laboratories (id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT)`,
      sql`CREATE TABLE IF NOT EXISTS materials (id SERIAL PRIMARY KEY, laboratory_id INTEGER, name TEXT NOT NULL, unit TEXT NOT NULL, total_quantity REAL DEFAULT 0, used_quantity REAL DEFAULT 0, unit_cost REAL DEFAULT 0, location TEXT, archive_id INTEGER, FOREIGN KEY (laboratory_id) REFERENCES laboratories(id))`,
      sql`CREATE TABLE IF NOT EXISTS income (id SERIAL PRIMARY KEY, laboratory_id INTEGER, description TEXT NOT NULL, amount REAL NOT NULL, date TEXT NOT NULL, FOREIGN KEY (laboratory_id) REFERENCES laboratories(id))`,
      sql`CREATE TABLE IF NOT EXISTS expenses (id SERIAL PRIMARY KEY, laboratory_id INTEGER, category TEXT NOT NULL, description TEXT NOT NULL, amount REAL NOT NULL, date TEXT NOT NULL, material_id INTEGER, FOREIGN KEY (laboratory_id) REFERENCES laboratories(id), FOREIGN KEY (material_id) REFERENCES materials(id))`,
      sql`CREATE TABLE IF NOT EXISTS material_archive (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, unit TEXT NOT NULL, quantity REAL DEFAULT 0)`
    ]);

    // Check for admin
    const users = await sql`SELECT 1 FROM users LIMIT 1`;
    if (users.length === 0) {
      const hp = await bcrypt.hash("admin", 10);
      await sql`INSERT INTO users (username, password) VALUES ('admin', ${hp})`;
    }
    _schemaDone = true;
  } catch (e) {
    console.error("Schema initialization failed:", e);
    throw new Error("Database Schema Error: " + (e as Error).message);
  }
}

// --- CORE UTILITIES ---
const wrap = (fn: any) => async (req: any, res: any) => {
  try {
    await ensureSchema();
    await fn(req, res);
  } catch (e: any) {
    console.error("Endpoint Error:", e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
};

// --- ROUTES ---

app.get("/api/health", wrap(async (req, res) => {
  const sql = getSql();
  await sql`SELECT 1`;
  res.json({ status: "ok", db: "connected", node: process.env.NODE_ENV });
}));

app.post("/api/auth/login", wrap(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username and password required" });

  const sql = getSql();
  const users = await sql`SELECT * FROM users WHERE username = ${username}`;
  const user = users[0];

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: "Credenziali non valide" });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
  res.cookie("token", token, { 
    httpOnly: true, 
    secure: true, 
    sameSite: 'lax', 
    maxAge: 7 * 24 * 60 * 60 * 1000 
  });
  res.json({ id: user.id, username: user.username });
}));

app.post("/api/auth/register", wrap(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Dati mancanti" });

  const sql = getSql();
  const existing = await sql`SELECT 1 FROM users WHERE username = ${username}`;
  if (existing.length > 0) return res.status(400).json({ error: "Username già esistente" });

  const hp = await bcrypt.hash(password, 10);
  const result = await sql`INSERT INTO users (username, password) VALUES (${username}, ${hp}) RETURNING id, username`;
  const user = result[0];

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
  res.cookie("token", token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json(user);
}));

app.get("/api/auth/me", (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.json(null);
  try {
    const v = jwt.verify(token, JWT_SECRET);
    res.json(v);
  } catch (e) { res.json(null); }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ success: true });
});

// Middleware for auth
const auth = (req: any, res: any, next: any) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "Not authorized" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) { res.status(401).json({ error: "Session expired" }); }
};

// Data API
app.get("/api/laboratories", auth, wrap(async (req, res) => {
  const sql = getSql();
  const labs = await sql`SELECT * FROM laboratories`;
  const labsWithSummary = await Promise.all(labs.map(async (lab) => {
    const incRes = await sql`SELECT SUM(amount) as t FROM income WHERE laboratory_id = ${lab.id}`;
    const expRes = await sql`SELECT SUM(amount) as t FROM expenses WHERE laboratory_id = ${lab.id}`;
    return { ...lab, netProfit: Number(incRes[0]?.t || 0) - Number(expRes[0]?.t || 0) };
  }));
  res.json(labsWithSummary);
}));

app.post("/api/laboratories", auth, wrap(async (req, res) => {
  const sql = getSql();
  const r = await sql`INSERT INTO laboratories (name, description) VALUES (${req.body.name}, ${req.body.description}) RETURNING id`;
  res.json(r[0]);
}));

app.delete("/api/laboratories/:id", auth, wrap(async (req, res) => {
  const sql = getSql();
  const id = parseInt(req.params.id);
  await sql.transaction([
    sql`DELETE FROM materials WHERE laboratory_id = ${id}`,
    sql`DELETE FROM income WHERE laboratory_id = ${id}`,
    sql`DELETE FROM expenses WHERE laboratory_id = ${id}`,
    sql`DELETE FROM laboratories WHERE id = ${id}`
  ]);
  res.json({ success: true });
}));

app.get("/api/materials", auth, wrap(async (req, res) => {
  const sql = getSql();
  res.json(await sql`SELECT * FROM materials WHERE laboratory_id = ${parseInt(req.query.laboratory_id as string)}`);
}));

app.post("/api/materials", auth, wrap(async (req, res) => {
  const sql = getSql();
  const { laboratory_id, name, unit, total_quantity, unit_cost, location } = req.body;
  const r = await sql`INSERT INTO materials (laboratory_id, name, unit, total_quantity, used_quantity, unit_cost, location) VALUES (${laboratory_id}, ${name}, ${unit}, ${total_quantity}, 0, ${unit_cost}, ${location}) RETURNING id`;
  await sql`INSERT INTO expenses (laboratory_id, category, description, amount, date, material_id) VALUES (${laboratory_id}, 'material_purchase', ${`Acquisto: ${name}`}, ${total_quantity * unit_cost}, ${new Date().toISOString()}, ${r[0].id})`;
  res.json({ success: true });
}));

app.patch("/api/materials/:id/usage", auth, wrap(async (req, res) => {
  const sql = getSql();
  await sql`UPDATE materials SET used_quantity = used_quantity + ${req.body.used_quantity} WHERE id = ${parseInt(req.params.id)}`;
  res.json({ success: true });
}));

app.get("/api/summary", auth, wrap(async (req, res) => {
  const sql = getSql();
  const id = parseInt(req.query.laboratory_id as string);
  const inc = await sql`SELECT SUM(amount) as t FROM income WHERE laboratory_id = ${id}`;
  const exp = await sql`SELECT SUM(amount) as t FROM expenses WHERE laboratory_id = ${id}`;
  const mat = await sql`SELECT SUM(amount) as t FROM expenses WHERE laboratory_id = ${id} AND category = 'material_purchase'`;
  const sal = await sql`SELECT SUM(amount) as t FROM expenses WHERE laboratory_id = ${id} AND category = 'salary'`;
  const oth = await sql`SELECT SUM(amount) as t FROM expenses WHERE laboratory_id = ${id} AND category = 'other'`;
  res.json({
    totalIncome: Number(inc[0]?.t || 0),
    totalExpenses: Number(exp[0]?.t || 0),
    netProfit: Number(inc[0]?.t || 0) - Number(exp[0]?.t || 0),
    breakdown: { materials: Number(mat[0]?.t || 0), salaries: Number(sal[0]?.t || 0), other: Number(oth[0]?.t || 0) }
  });
}));

// Fallback for not found
app.use((req, res) => res.status(404).json({ error: `Not found: ${req.url}` }));

export default app;
