import express from "express";
import { createServer as createViteServer } from "vite";
import { neon } from "@neondatabase/serverless";
import path from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Support both DATABASE_URL and STORAGE_URL (in case user made a typo)
const DB_URL = process.env.DATABASE_URL || process.env.STORAGE_URL || "";
const sql = neon(DB_URL);
const JWT_SECRET = process.env.JWT_SECRET || "labmanager-secret-key-123";

let dbInitialized = false;

async function initializeDatabase() {
  if (dbInitialized) return;
  if (!DB_URL) {
    console.error("ERRORE: DATABASE_URL non configurata!");
    return;
  }

  console.log("Initializing Neon database schema lazy...");
  try {
    await sql`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL);`;
    await sql`CREATE TABLE IF NOT EXISTS laboratories (id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT);`;
    await sql`CREATE TABLE IF NOT EXISTS materials (id SERIAL PRIMARY KEY, laboratory_id INTEGER, name TEXT NOT NULL, unit TEXT NOT NULL, total_quantity REAL DEFAULT 0, used_quantity REAL DEFAULT 0, unit_cost REAL DEFAULT 0, location TEXT, archive_id INTEGER, FOREIGN KEY (laboratory_id) REFERENCES laboratories(id));`;
    await sql`CREATE TABLE IF NOT EXISTS income (id SERIAL PRIMARY KEY, laboratory_id INTEGER, description TEXT NOT NULL, amount REAL NOT NULL, date TEXT NOT NULL, FOREIGN KEY (laboratory_id) REFERENCES laboratories(id));`;
    await sql`CREATE TABLE IF NOT EXISTS expenses (id SERIAL PRIMARY KEY, laboratory_id INTEGER, category TEXT NOT NULL, description TEXT NOT NULL, amount REAL NOT NULL, date TEXT NOT NULL, material_id INTEGER, FOREIGN KEY (laboratory_id) REFERENCES laboratories(id), FOREIGN KEY (material_id) REFERENCES materials(id));`;
    await sql`CREATE TABLE IF NOT EXISTS material_archive (id SERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE, unit TEXT NOT NULL, quantity REAL DEFAULT 0);`;

    const users = await sql`SELECT * FROM users LIMIT 1`;
    if (users.length === 0) {
      const hashedPassword = await bcrypt.hash("admin", 10);
      await sql`INSERT INTO users (username, password) VALUES ('admin', ${hashedPassword})`;
    }
    dbInitialized = true;
  } catch (err) {
    console.error("Database lazy-init failed:", err);
  }
}

const app = express();
app.use(express.json());
app.use(cookieParser());

// Lazy-init DB on first request
app.use(async (req, res, next) => {
  if (req.path.startsWith("/api") && !dbInitialized) {
    await initializeDatabase();
  }
  next();
});

// --- Health/Test Route ---
app.get("/api/health", async (req, res) => {
  try {
    if (!DB_URL) throw new Error("URL Database mancante");
    await sql`SELECT 1`;
    res.json({ status: "ok", database: "connected", env: process.env.NODE_ENV, vercel: !!process.env.VERCEL });
  } catch (err) {
    res.status(500).json({ status: "error", database: "failed", error: (err as Error).message });
  }
});

// --- Auth Middleware ---
const authenticateToken = (req: any, res: any, next: any) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "Access denied" });
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    req.user = verified;
    next();
  } catch (err) {
    res.status(400).json({ error: "Invalid token" });
  }
};

// --- Auth Routes ---
app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    if (!username || !password) return res.status(400).json({ error: "Dati mancanti" });
    const existing = await sql`SELECT id FROM users WHERE username = ${username}`;
    if (existing.length > 0) return res.status(400).json({ error: "Username già esistente" });
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await sql`INSERT INTO users (username, password) VALUES (${username}, ${hashedPassword}) RETURNING id, username`;
    const user = result[0];
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie("token", token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ id: user.id, username: user.username });
  } catch (err) {
    res.status(500).json({ error: "Errore DB: " + (err as Error).message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const userResult = await sql`SELECT * FROM users WHERE username = ${username}`;
    const user = userResult[0];
    if (!user) return res.status(400).json({ error: "Utente non trovato" });
    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) return res.status(400).json({ error: "Password errata" });
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie("token", token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ id: user.id, username: user.username });
  } catch (err) {
    res.status(500).json({ error: "Errore login DB: " + (err as Error).message });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ success: true });
});

app.get("/api/auth/me", (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.json(null);
  try {
    const verified = jwt.verify(token, JWT_SECRET);
    res.json(verified);
  } catch (err) {
    res.json(null);
  }
});

// --- API Routes (Protected) ---
app.get("/api/laboratories", authenticateToken, async (req, res) => {
  try {
    const labs = await sql`SELECT * FROM laboratories`;
    const labsWithSummary = await Promise.all(labs.map(async (lab) => {
      const incomeResult = await sql`SELECT SUM(amount) as total FROM income WHERE laboratory_id = ${lab.id}`;
      const expenseResult = await sql`SELECT SUM(amount) as total FROM expenses WHERE laboratory_id = ${lab.id}`;
      return { ...lab, netProfit: Number(incomeResult[0]?.total || 0) - Number(expenseResult[0]?.total || 0) };
    }));
    res.json(labsWithSummary);
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

app.post("/api/laboratories", authenticateToken, async (req, res) => {
  const { name, description } = req.body;
  const result = await sql`INSERT INTO laboratories (name, description) VALUES (${name}, ${description}) RETURNING id`;
  res.json({ id: result[0].id });
});

app.delete("/api/laboratories/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const labId = parseInt(id);
  await sql`DELETE FROM materials WHERE laboratory_id = ${labId}`;
  await sql`DELETE FROM income WHERE laboratory_id = ${labId}`;
  await sql`DELETE FROM expenses WHERE laboratory_id = ${labId}`;
  await sql`DELETE FROM laboratories WHERE id = ${labId}`;
  res.json({ success: true });
});

app.get("/api/materials", authenticateToken, async (req, res) => {
  const { laboratory_id } = req.query;
  const rows = await sql`SELECT * FROM materials WHERE laboratory_id = ${parseInt(laboratory_id as string)}`;
  res.json(rows);
});

app.post("/api/materials", authenticateToken, async (req, res) => {
  const { laboratory_id, name, unit, total_quantity, unit_cost, location } = req.body;
  try {
    const result = await sql`INSERT INTO materials (laboratory_id, name, unit, total_quantity, used_quantity, unit_cost, location) VALUES (${laboratory_id}, ${name}, ${unit}, ${total_quantity}, 0, ${unit_cost}, ${location}) RETURNING id`;
    const newId = result[0].id;
    await sql`INSERT INTO expenses (laboratory_id, category, description, amount, date, material_id) VALUES (${laboratory_id}, 'material_purchase', ${`Acquisto: ${name}`}, ${total_quantity * unit_cost}, ${new Date().toISOString()}, ${newId})`;
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: (e as Error).message }); }
});

app.patch("/api/materials/:id/usage", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { used_quantity } = req.body;
  await sql`UPDATE materials SET used_quantity = used_quantity + ${used_quantity} WHERE id = ${parseInt(id)}`;
  res.json({ success: true });
});

app.get("/api/income", authenticateToken, async (req, res) => {
  const { laboratory_id } = req.query;
  const rows = await sql`SELECT * FROM income WHERE laboratory_id = ${parseInt(laboratory_id as string)} ORDER BY date DESC`;
  res.json(rows);
});

app.post("/api/income", authenticateToken, async (req, res) => {
  const { laboratory_id, description, amount, date } = req.body;
  await sql`INSERT INTO income (laboratory_id, description, amount, date) VALUES (${laboratory_id}, ${description}, ${amount}, ${date || new Date().toISOString()})`;
  res.json({ success: true });
});

app.get("/api/expenses", authenticateToken, async (req, res) => {
  const { laboratory_id } = req.query;
  const rows = await sql`SELECT * FROM expenses WHERE laboratory_id = ${parseInt(laboratory_id as string)} ORDER BY date DESC`;
  res.json(rows);
});

app.post("/api/expenses", authenticateToken, async (req, res) => {
  const { laboratory_id, category, description, amount, date } = req.body;
  await sql`INSERT INTO expenses (laboratory_id, category, description, amount, date) VALUES (${laboratory_id}, ${category}, ${description}, ${amount}, ${date || new Date().toISOString()})`;
  res.json({ success: true });
});

app.get("/api/summary", authenticateToken, async (req, res) => {
  const { laboratory_id } = req.query;
  const labId = parseInt(laboratory_id as string);
  const inc = await sql`SELECT SUM(amount) as total FROM income WHERE laboratory_id = ${labId}`;
  const exp = await sql`SELECT SUM(amount) as total FROM expenses WHERE laboratory_id = ${labId}`;
  const mat = await sql`SELECT SUM(amount) as total FROM expenses WHERE laboratory_id = ${labId} AND category = 'material_purchase'`;
  const sal = await sql`SELECT SUM(amount) as total FROM expenses WHERE laboratory_id = ${labId} AND category = 'salary'`;
  const oth = await sql`SELECT SUM(amount) as total FROM expenses WHERE laboratory_id = ${labId} AND category = 'other'`;
  res.json({
    totalIncome: Number(inc[0]?.total || 0),
    totalExpenses: Number(exp[0]?.total || 0),
    netProfit: Number(inc[0]?.total || 0) - Number(exp[0]?.total || 0),
    breakdown: {
      materials: Number(mat[0]?.total || 0),
      salaries: Number(sal[0]?.total || 0),
      other: Number(oth[0]?.total || 0)
    }
  });
});

// Production serving
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  const vite = await createViteServer({ server: { middlewareMode: true, hmr: { port: 24685 } }, appType: "spa" });
  app.use(vite.middlewares);
} else {
  // In Vercel, static files are served by the platform automatically
  // Local production check
  if (!process.env.VERCEL) {
    app.use(express.static(path.join(__dirname, "../dist")));
    app.get("*", (req, res) => res.sendFile(path.join(__dirname, "../dist", "index.html")));
  }
}

// Local listen
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3005;
  app.listen(PORT, () => console.log(`Server at http://localhost:${PORT}`));
}

export default app;
