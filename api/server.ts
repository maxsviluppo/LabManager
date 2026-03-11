import express from "express";
import { createServer as createViteServer } from "vite";
import { neon, neonConfig } from "@neondatabase/serverless";
import path from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || "labmanager-secret-key-123";

// Helper for SQL to avoid "string did not match pattern" error on startup
const getSql = () => {
  const url = process.env.DATABASE_URL || process.env.STORAGE_URL;
  if (!url) {
    throw new Error("Mancano le credenziali del database (DATABASE_URL o STORAGE_URL). Verificale su Vercel!");
  }
  return neon(url);
};

let dbInitialized = false;

async function initializeDatabase() {
  if (dbInitialized) return;
  
  console.log("Initializing database schema...");
  const sql = getSql();
  
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
    console.error("Database initialization failed:", err);
    throw err;
  }
}

const app = express();
app.use(express.json());
app.use(cookieParser());

// Lazy-init DB and catch pattern errors
app.use(async (req, res, next) => {
  if (req.path.startsWith("/api") && req.path !== "/api/health") {
    try {
      if (!dbInitialized) await initializeDatabase();
      next();
    } catch (err) {
      res.status(500).json({ 
        error: (err as Error).message.includes("pattern") 
          ? "URL del database non valido. Assicurati di aver copiato correttamente la stringa di Neon in DATABASE_URL nelle impostazioni di Vercel." 
          : (err as Error).message 
      });
    }
  } else {
    next();
  }
});

// --- Health/Debug Route ---
app.get("/api/health", async (req, res) => {
  const url = process.env.DATABASE_URL || process.env.STORAGE_URL;
  try {
    if (!url) throw new Error("Variabile DATABASE_URL mancante su Vercel!");
    const sql = neon(url);
    await sql`SELECT 1`;
    res.json({ status: "ok", database: "connected", mode: process.env.NODE_ENV });
  } catch (err) {
    res.status(500).json({ 
      status: "error", 
      error: (err as Error).message,
      tip: "Assicurati di aver aggiunto DATABASE_URL nelle impostazioni (Environment Variables) del progetto su Vercel."
    });
  }
});

// --- Auth Routes ---
app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    const sql = getSql();
    const existing = await sql`SELECT id FROM users WHERE username = ${username}`;
    if (existing.length > 0) return res.status(400).json({ error: "Username già esistente" });
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await sql`INSERT INTO users (username, password) VALUES (${username}, ${hashedPassword}) RETURNING id, username`;
    const user = result[0];
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie("token", token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ id: user.id, username: user.username });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const sql = getSql();
    const userResult = await sql`SELECT * FROM users WHERE username = ${username}`;
    const user = userResult[0];
    if (!user) return res.status(400).json({ error: "Utente non trovato" });
    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) return res.status(400).json({ error: "Password errata" });
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
    res.cookie("token", token, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ id: user.id, username: user.username });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
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

// --- API Protected Wrapper ---
const authenticateToken = (req: any, res: any, next: any) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: "Access denied" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(400).json({ error: "Invalid token" });
  }
};

app.get("/api/laboratories", authenticateToken, async (req, res) => {
  const sql = getSql();
  const labs = await sql`SELECT * FROM laboratories`;
  const labsWithSummary = await Promise.all(labs.map(async (lab) => {
    const inc = await sql`SELECT SUM(amount) as total FROM income WHERE laboratory_id = ${lab.id}`;
    const exp = await sql`SELECT SUM(amount) as total FROM expenses WHERE laboratory_id = ${lab.id}`;
    return { ...lab, netProfit: Number(inc[0]?.total || 0) - Number(exp[0]?.total || 0) };
  }));
  res.json(labsWithSummary);
});

app.post("/api/laboratories", authenticateToken, async (req, res) => {
  const sql = getSql();
  const { name, description } = req.body;
  const result = await sql`INSERT INTO laboratories (name, description) VALUES (${name}, ${description}) RETURNING id`;
  res.json({ id: result[0].id });
});

app.delete("/api/laboratories/:id", authenticateToken, async (req, res) => {
  const sql = getSql();
  const labId = parseInt(req.params.id);
  await sql`DELETE FROM materials WHERE laboratory_id = ${labId}`;
  await sql`DELETE FROM income WHERE laboratory_id = ${labId}`;
  await sql`DELETE FROM expenses WHERE laboratory_id = ${labId}`;
  await sql`DELETE FROM laboratories WHERE id = ${labId}`;
  res.json({ success: true });
});

app.get("/api/materials", authenticateToken, async (req, res) => {
  const sql = getSql();
  res.json(await sql`SELECT * FROM materials WHERE laboratory_id = ${parseInt(req.query.laboratory_id as string)}`);
});

app.post("/api/materials", authenticateToken, async (req, res) => {
  const sql = getSql();
  const { laboratory_id, name, unit, total_quantity, unit_cost, location } = req.body;
  const result = await sql`INSERT INTO materials (laboratory_id, name, unit, total_quantity, used_quantity, unit_cost, location) VALUES (${laboratory_id}, ${name}, ${unit}, ${total_quantity}, 0, ${unit_cost}, ${location}) RETURNING id`;
  await sql`INSERT INTO expenses (laboratory_id, category, description, amount, date, material_id) VALUES (${laboratory_id}, 'material_purchase', ${`Acquisto: ${name}`}, ${total_quantity * unit_cost}, ${new Date().toISOString()}, ${result[0].id})`;
  res.json({ success: true });
});

app.patch("/api/materials/:id/usage", authenticateToken, async (req, res) => {
  const sql = getSql();
  await sql`UPDATE materials SET used_quantity = used_quantity + ${req.body.used_quantity} WHERE id = ${parseInt(req.params.id)}`;
  res.json({ success: true });
});

app.get("/api/income", authenticateToken, async (req, res) => {
  const sql = getSql();
  res.json(await sql`SELECT * FROM income WHERE laboratory_id = ${parseInt(req.query.laboratory_id as string)} ORDER BY date DESC`);
});

app.post("/api/income", authenticateToken, async (req, res) => {
  const sql = getSql();
  const { laboratory_id, description, amount, date } = req.body;
  await sql`INSERT INTO income (laboratory_id, description, amount, date) VALUES (${laboratory_id}, ${description}, ${amount}, ${date || new Date().toISOString()})`;
  res.json({ success: true });
});

app.get("/api/expenses", authenticateToken, async (req, res) => {
  const sql = getSql();
  res.json(await sql`SELECT * FROM expenses WHERE laboratory_id = ${parseInt(req.query.laboratory_id as string)} ORDER BY date DESC`);
});

app.post("/api/expenses", authenticateToken, async (req, res) => {
  const sql = getSql();
  const { laboratory_id, category, description, amount, date } = req.body;
  await sql`INSERT INTO expenses (laboratory_id, category, description, amount, date) VALUES (${laboratory_id}, ${category}, ${description}, ${amount}, ${date || new Date().toISOString()})`;
  res.json({ success: true });
});

app.get("/api/summary", authenticateToken, async (req, res) => {
  const sql = getSql();
  const labId = parseInt(req.query.laboratory_id as string);
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

// Serve frontend only in local dev/prod
if (!process.env.VERCEL) {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true, hmr: { port: 24685 } }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "../dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }
  const PORT = process.env.PORT || 3005;
  app.listen(PORT, () => console.log(`Server at http://localhost:${PORT}`));
}

export default app;
