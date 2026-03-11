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

if (!process.env.DATABASE_URL) {
  console.error("ERRORE: DATABASE_URL is not set!");
}

const sql = neon(process.env.DATABASE_URL || "");
const JWT_SECRET = process.env.JWT_SECRET || "labmanager-secret-key-123";

async function initializeDatabase() {
  console.log("Initializing Neon database...");
  
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS laboratories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS materials (
      id SERIAL PRIMARY KEY,
      laboratory_id INTEGER,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      total_quantity REAL DEFAULT 0,
      used_quantity REAL DEFAULT 0,
      unit_cost REAL DEFAULT 0,
      location TEXT,
      archive_id INTEGER,
      FOREIGN KEY (laboratory_id) REFERENCES laboratories(id)
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS income (
      id SERIAL PRIMARY KEY,
      laboratory_id INTEGER,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      FOREIGN KEY (laboratory_id) REFERENCES laboratories(id)
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      laboratory_id INTEGER,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      material_id INTEGER,
      FOREIGN KEY (laboratory_id) REFERENCES laboratories(id),
      FOREIGN KEY (material_id) REFERENCES materials(id)
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS material_archive (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      unit TEXT NOT NULL,
      quantity REAL DEFAULT 0
    );
  `;

  // Create default admin user if none exists
  const users = await sql`SELECT * FROM users LIMIT 1`;
  if (users.length === 0) {
    const hashedPassword = await bcrypt.hash("admin", 10);
    await sql`INSERT INTO users (username, password) VALUES ('admin', ${hashedPassword})`;
    console.log("Default admin user created (admin/admin)");
  }
}

const app = express();

async function startServer() {
  await initializeDatabase();
  
  app.use(express.json());
  app.use(cookieParser());
  
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3005;

  // --- Health/Test Route ---
  app.get("/api/health", async (req, res) => {
    try {
      await sql`SELECT 1`;
      res.json({ status: "ok", database: "connected", env: process.env.NODE_ENV });
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
  app.post("/api/auth/login", async (req, res) => {
    const { username, password } = req.body;
    try {
      const userResult = await sql`SELECT * FROM users WHERE username = ${username}`;
      const user = userResult[0];

      if (!user) return res.status(400).json({ error: "Utente non trovato" });

      const validPass = await bcrypt.compare(password, user.password);
      if (!validPass) return res.status(400).json({ error: "Password errata" });

      const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: "7d" });
      res.cookie("token", token, { 
        httpOnly: true, 
        secure: process.env.NODE_ENV === "production" || !!process.env.VERCEL, 
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 
      });
      res.json({ id: user.id, username: user.username });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ error: "Errore interno del server" });
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
    const labs = await sql`SELECT * FROM laboratories`;
    const labsWithSummary = await Promise.all(labs.map(async (lab) => {
      const incomeResult = await sql`SELECT SUM(amount) as total FROM income WHERE laboratory_id = ${lab.id}`;
      const expenseResult = await sql`SELECT SUM(amount) as total FROM expenses WHERE laboratory_id = ${lab.id}`;
      const totalIncome = Number(incomeResult[0]?.total || 0);
      const totalExpenses = Number(expenseResult[0]?.total || 0);
      return {
        ...lab,
        netProfit: totalIncome - totalExpenses
      };
    }));
    res.json(labsWithSummary);
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

  app.post("/api/laboratories/:id/clear", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const labId = parseInt(id);
    await sql`DELETE FROM materials WHERE laboratory_id = ${labId}`;
    await sql`DELETE FROM income WHERE laboratory_id = ${labId}`;
    await sql`DELETE FROM expenses WHERE laboratory_id = ${labId}`;
    res.json({ success: true });
  });

  app.get("/api/archive", authenticateToken, async (req, res) => {
    const rows = await sql`SELECT * FROM material_archive ORDER BY name ASC`;
    res.json(rows);
  });

  app.post("/api/archive", authenticateToken, async (req, res) => {
    const { name, unit, quantity } = req.body;
    try {
      const result = await sql`
        INSERT INTO material_archive (name, unit, quantity) 
        VALUES (${name}, ${unit}, ${quantity || 0}) 
        RETURNING id
      `;
      res.json({ id: result[0].id });
    } catch (e) {
      res.status(400).json({ error: "Materiale già presente in archivio" });
    }
  });

  app.post("/api/archive/transfer", authenticateToken, async (req, res) => {
    const { archive_id, laboratory_id, quantity } = req.body;
    
    const archiveItemResult = await sql`SELECT * FROM material_archive WHERE id = ${archive_id}`;
    const archiveItem = archiveItemResult[0];
    
    if (!archiveItem || Number(archiveItem.quantity) < quantity) {
      return res.status(400).json({ error: "Quantità insufficiente in archivio" });
    }

    try {
      await sql`UPDATE material_archive SET quantity = quantity - ${quantity} WHERE id = ${archive_id}`;
      
      const existingResult = await sql`SELECT * FROM materials WHERE laboratory_id = ${laboratory_id} AND archive_id = ${archive_id}`;
      const existing = existingResult[0];

      let materialId;
      if (existing) {
        await sql`UPDATE materials SET total_quantity = total_quantity + ${quantity} WHERE id = ${existing.id}`;
        materialId = existing.id;
      } else {
        const insertRes = await sql`
          INSERT INTO materials (laboratory_id, name, unit, total_quantity, used_quantity, unit_cost, location, archive_id) 
          VALUES (${laboratory_id}, ${archiveItem.name}, ${archiveItem.unit}, ${quantity}, 0, 0, '', ${archive_id}) 
          RETURNING id
        `;
        materialId = insertRes[0].id;
      }

      await sql`
        INSERT INTO expenses (laboratory_id, category, description, amount, date, material_id) 
        VALUES (${laboratory_id}, 'material_purchase', ${`Trasferimento da Archivio: ${archiveItem.name}`}, 0, ${new Date().toISOString()}, ${materialId})
      `;
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Database error during transfer" });
    }
  });

  app.delete("/api/archive/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    await sql`DELETE FROM material_archive WHERE id = ${parseInt(id)}`;
    res.json({ success: true });
  });

  app.get("/api/materials", authenticateToken, async (req, res) => {
    const { laboratory_id } = req.query;
    const rows = await sql`SELECT * FROM materials WHERE laboratory_id = ${parseInt(laboratory_id as string)}`;
    res.json(rows);
  });

  app.post("/api/materials", authenticateToken, async (req, res) => {
    const { laboratory_id, name, unit, total_quantity, unit_cost, location, archive_id } = req.body;
    
    try {
      let finalArchiveId = archive_id;
      const existingArchiveResult = await sql`SELECT id FROM material_archive WHERE name = ${name}`;
      const existingArchive = existingArchiveResult[0];
      
      if (existingArchive) {
        finalArchiveId = existingArchive.id;
        await sql`UPDATE material_archive SET quantity = quantity + ${total_quantity} WHERE id = ${finalArchiveId}`;
      } else {
        const archiveInsert = await sql`INSERT INTO material_archive (name, unit, quantity) VALUES (${name}, ${unit}, ${total_quantity}) RETURNING id`;
        finalArchiveId = archiveInsert[0].id;
      }

      const materialInsert = await sql`
        INSERT INTO materials (laboratory_id, name, unit, total_quantity, used_quantity, unit_cost, location, archive_id) 
        VALUES (${laboratory_id}, ${name}, ${unit}, ${total_quantity}, 0, ${unit_cost}, ${location}, ${finalArchiveId}) 
        RETURNING id
      `;
      
      const newMaterialId = materialInsert[0].id;

      await sql`
        INSERT INTO expenses (laboratory_id, category, description, amount, date, material_id) 
        VALUES (${laboratory_id}, 'material_purchase', ${`Acquisto: ${name}`}, ${total_quantity * unit_cost}, ${new Date().toISOString()}, ${newMaterialId})
      `;
      
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Error adding material" });
    }
  });

  app.put("/api/materials/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { name, unit, total_quantity, used_quantity, unit_cost, location } = req.body;
    await sql`
      UPDATE materials 
      SET name = ${name}, unit = ${unit}, total_quantity = ${total_quantity}, 
          used_quantity = ${used_quantity}, unit_cost = ${unit_cost}, location = ${location} 
      WHERE id = ${parseInt(id)}
    `;
    res.json({ success: true });
  });

  app.patch("/api/materials/:id/usage", authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { used_quantity } = req.body;
    const matId = parseInt(id);
    
    try {
      await sql`UPDATE materials SET used_quantity = used_quantity + ${used_quantity} WHERE id = ${matId}`;
      const materialResult = await sql`SELECT archive_id FROM materials WHERE id = ${matId}`;
      const material = materialResult[0];
      
      if (material && material.archive_id) {
        await sql`UPDATE material_archive SET quantity = quantity - ${used_quantity} WHERE id = ${material.archive_id}`;
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Error updating usage" });
    }
  });

  app.delete("/api/materials/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    await sql`DELETE FROM materials WHERE id = ${parseInt(id)}`;
    res.json({ success: true });
  });

  app.get("/api/income", authenticateToken, async (req, res) => {
    const { laboratory_id } = req.query;
    const rows = await sql`SELECT * FROM income WHERE laboratory_id = ${parseInt(laboratory_id as string)} ORDER BY date DESC`;
    res.json(rows);
  });

  app.post("/api/income", authenticateToken, async (req, res) => {
    const { laboratory_id, description, amount, date } = req.body;
    const result = await sql`
      INSERT INTO income (laboratory_id, description, amount, date) 
      VALUES (${laboratory_id}, ${description}, ${amount}, ${date || new Date().toISOString()}) 
      RETURNING id
    `;
    res.json({ id: result[0].id });
  });

  app.delete("/api/income/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    await sql`DELETE FROM income WHERE id = ${parseInt(id)}`;
    res.json({ success: true });
  });

  app.get("/api/expenses", authenticateToken, async (req, res) => {
    const { laboratory_id } = req.query;
    const rows = await sql`SELECT * FROM expenses WHERE laboratory_id = ${parseInt(laboratory_id as string)} ORDER BY date DESC`;
    res.json(rows);
  });

  app.post("/api/expenses", authenticateToken, async (req, res) => {
    const { laboratory_id, category, description, amount, date } = req.body;
    const result = await sql`
      INSERT INTO expenses (laboratory_id, category, description, amount, date) 
      VALUES (${laboratory_id}, ${category}, ${description}, ${amount}, ${date || new Date().toISOString()}) 
      RETURNING id
    `;
    res.json({ id: result[0].id });
  });

  app.delete("/api/expenses/:id", authenticateToken, async (req, res) => {
    const { id } = req.params;
    await sql`DELETE FROM expenses WHERE id = ${parseInt(id)}`;
    res.json({ success: true });
  });

  app.get("/api/summary", authenticateToken, async (req, res) => {
    const { laboratory_id } = req.query;
    const labId = parseInt(laboratory_id as string);
    
    const incomeRes = await sql`SELECT SUM(amount) as total FROM income WHERE laboratory_id = ${labId}`;
    const expenseRes = await sql`SELECT SUM(amount) as total FROM expenses WHERE laboratory_id = ${labId}`;
    const matRes = await sql`SELECT SUM(amount) as total FROM expenses WHERE laboratory_id = ${labId} AND category = 'material_purchase'`;
    const salaryRes = await sql`SELECT SUM(amount) as total FROM expenses WHERE laboratory_id = ${labId} AND category = 'salary'`;
    const otherRes = await sql`SELECT SUM(amount) as total FROM expenses WHERE laboratory_id = ${labId} AND category = 'other'`;

    const totalIncome = Number(incomeRes[0]?.total || 0);
    const totalExpenses = Number(expenseRes[0]?.total || 0);

    res.json({
      totalIncome,
      totalExpenses,
      netProfit: totalIncome - totalExpenses,
      breakdown: {
        materials: Number(matRes[0]?.total || 0),
        salaries: Number(salaryRes[0]?.total || 0),
        other: Number(otherRes[0]?.total || 0)
      }
    });
  });

  // --- Vite Middleware ---
  // Only use Vite if we are NOT on Vercel and NOT in production
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { port: 24685 } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  // Only listen locally, Vercel will export the app
  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer().catch(console.error);

export default app;
