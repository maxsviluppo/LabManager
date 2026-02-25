import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("Initializing database...");
const db = new Database("lab_manager.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS laboratories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    laboratory_id INTEGER,
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    total_quantity REAL DEFAULT 0,
    used_quantity REAL DEFAULT 0,
    unit_cost REAL DEFAULT 0,
    location TEXT,
    FOREIGN KEY (laboratory_id) REFERENCES laboratories(id)
  );

  CREATE TABLE IF NOT EXISTS income (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    laboratory_id INTEGER,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    FOREIGN KEY (laboratory_id) REFERENCES laboratories(id)
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    laboratory_id INTEGER,
    category TEXT NOT NULL, -- 'salary', 'material_purchase', 'other'
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    material_id INTEGER,
    FOREIGN KEY (laboratory_id) REFERENCES laboratories(id),
    FOREIGN KEY (material_id) REFERENCES materials(id)
  );

  CREATE TABLE IF NOT EXISTS material_archive (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    unit TEXT NOT NULL,
    quantity REAL DEFAULT 0
  );
`);

try {
  db.exec("ALTER TABLE material_archive ADD COLUMN quantity REAL DEFAULT 0");
} catch (e) {}
try {
  db.exec("ALTER TABLE materials ADD COLUMN archive_id INTEGER");
} catch (e) {}

try {
  db.exec("ALTER TABLE materials ADD COLUMN laboratory_id INTEGER");
} catch (e) {}
try {
  db.exec("ALTER TABLE income ADD COLUMN laboratory_id INTEGER");
} catch (e) {}
try {
  db.exec("ALTER TABLE expenses ADD COLUMN laboratory_id INTEGER");
} catch (e) {}
try {
  db.exec("ALTER TABLE materials ADD COLUMN location TEXT");
} catch (e) {}

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

  // --- API Routes ---

  // Laboratories
  app.get("/api/laboratories", (req, res) => {
    const labs = db.prepare("SELECT * FROM laboratories").all();
    const labsWithSummary = labs.map(lab => {
      const totalIncome = db.prepare("SELECT SUM(amount) as total FROM income WHERE laboratory_id = ?").get(lab.id).total || 0;
      const totalExpenses = db.prepare("SELECT SUM(amount) as total FROM expenses WHERE laboratory_id = ?").get(lab.id).total || 0;
      return {
        ...lab,
        netProfit: totalIncome - totalExpenses
      };
    });
    res.json(labsWithSummary);
  });

  app.post("/api/laboratories", (req, res) => {
    const { name, description } = req.body;
    const info = db.prepare("INSERT INTO laboratories (name, description) VALUES (?, ?)").run(name, description);
    res.json({ id: info.lastInsertRowid });
  });

  app.delete("/api/laboratories/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM laboratories WHERE id = ?").run(id);
    // Optionally delete all related data
    db.prepare("DELETE FROM materials WHERE laboratory_id = ?").run(id);
    db.prepare("DELETE FROM income WHERE laboratory_id = ?").run(id);
    db.prepare("DELETE FROM expenses WHERE laboratory_id = ?").run(id);
    res.json({ success: true });
  });

  app.post("/api/laboratories/:id/clear", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM materials WHERE laboratory_id = ?").run(id);
    db.prepare("DELETE FROM income WHERE laboratory_id = ?").run(id);
    db.prepare("DELETE FROM expenses WHERE laboratory_id = ?").run(id);
    res.json({ success: true });
  });

  // Material Archive
  app.get("/api/archive", (req, res) => {
    const rows = db.prepare("SELECT * FROM material_archive ORDER BY name ASC").all();
    res.json(rows);
  });

  app.post("/api/archive", (req, res) => {
    const { name, unit, quantity } = req.body;
    try {
      const info = db.prepare(
        "INSERT INTO material_archive (name, unit, quantity) VALUES (?, ?, ?)"
      ).run(name, unit, quantity || 0);
      res.json({ id: info.lastInsertRowid });
    } catch (e) {
      res.status(400).json({ error: "Materiale già presente in archivio" });
    }
  });

  app.post("/api/archive/transfer", (req, res) => {
    const { archive_id, laboratory_id, quantity } = req.body;
    
    const archiveItem = db.prepare("SELECT * FROM material_archive WHERE id = ?").get(archive_id);
    if (!archiveItem || archiveItem.quantity < quantity) {
      return res.status(400).json({ error: "Quantità insufficiente in archivio" });
    }

    db.transaction(() => {
      // 1. Decrease archive quantity
      db.prepare("UPDATE material_archive SET quantity = quantity - ? WHERE id = ?")
        .run(quantity, archive_id);

      // 2. Add to laboratory materials
      // Check if lab already has this material linked to this archive item
      const existing = db.prepare("SELECT * FROM materials WHERE laboratory_id = ? AND archive_id = ?")
        .get(laboratory_id, archive_id);

      let materialId;
      if (existing) {
        db.prepare("UPDATE materials SET total_quantity = total_quantity + ? WHERE id = ?")
          .run(quantity, existing.id);
        materialId = existing.id;
      } else {
        const info = db.prepare(
          "INSERT INTO materials (laboratory_id, name, unit, total_quantity, used_quantity, unit_cost, location, archive_id) VALUES (?, ?, ?, ?, 0, 0, '', ?)"
        ).run(laboratory_id, archiveItem.name, archiveItem.unit, quantity, archive_id);
        materialId = info.lastInsertRowid;
      }

      // 3. Record expense for the lab (at 0 cost as it's an internal transfer)
      db.prepare(
        "INSERT INTO expenses (laboratory_id, category, description, amount, date, material_id) VALUES (?, ?, ?, 0, ?, ?)"
      ).run(laboratory_id, 'material_purchase', `Trasferimento da Archivio: ${archiveItem.name}`, new Date().toISOString(), materialId);
    })();

    res.json({ success: true });
  });

  app.delete("/api/archive/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM material_archive WHERE id = ?").run(id);
    res.json({ success: true });
  });

  // Materials
  app.get("/api/materials", (req, res) => {
    const { laboratory_id } = req.query;
    const rows = db.prepare("SELECT * FROM materials WHERE laboratory_id = ?").all(laboratory_id);
    res.json(rows);
  });

  app.post("/api/materials", (req, res) => {
    const { laboratory_id, name, unit, total_quantity, unit_cost, location, archive_id } = req.body;
    
    db.transaction(() => {
      // 1. Sync with archive: if not exists, add it. If exists, update quantity.
      let finalArchiveId = archive_id;
      const existingArchive = db.prepare("SELECT id FROM material_archive WHERE name = ?").get(name);
      
      if (existingArchive) {
        finalArchiveId = existingArchive.id;
        db.prepare("UPDATE material_archive SET quantity = quantity + ? WHERE id = ?")
          .run(total_quantity, finalArchiveId);
      } else {
        const info = db.prepare("INSERT INTO material_archive (name, unit, quantity) VALUES (?, ?, ?)")
          .run(name, unit, total_quantity);
        finalArchiveId = info.lastInsertRowid;
      }

      // 2. Add to laboratory materials
      const info = db.prepare(
        "INSERT INTO materials (laboratory_id, name, unit, total_quantity, used_quantity, unit_cost, location, archive_id) VALUES (?, ?, ?, ?, 0, ?, ?, ?)"
      ).run(laboratory_id, name, unit, total_quantity, unit_cost, location, finalArchiveId);
      
      // 3. Also log as an expense
      db.prepare(
        "INSERT INTO expenses (laboratory_id, category, description, amount, date, material_id) VALUES (?, ?, ?, ?, ?, ?)"
      ).run(laboratory_id, 'material_purchase', `Acquisto: ${name}`, total_quantity * unit_cost, new Date().toISOString(), info.lastInsertRowid);
    })();

    res.json({ success: true });
  });

  app.put("/api/materials/:id", (req, res) => {
    const { id } = req.params;
    const { name, unit, total_quantity, used_quantity, unit_cost, location } = req.body;
    db.prepare(
      "UPDATE materials SET name = ?, unit = ?, total_quantity = ?, used_quantity = ?, unit_cost = ?, location = ? WHERE id = ?"
    ).run(name, unit, total_quantity, used_quantity, unit_cost, location, id);
    res.json({ success: true });
  });

  app.patch("/api/materials/:id/usage", (req, res) => {
    const { id } = req.params;
    const { used_quantity } = req.body;
    
    db.transaction(() => {
      // 1. Update lab material usage
      db.prepare("UPDATE materials SET used_quantity = used_quantity + ? WHERE id = ?")
        .run(used_quantity, id);

      // 2. Scale down archive quantity
      const material = db.prepare("SELECT archive_id FROM materials WHERE id = ?").get(id);
      if (material && material.archive_id) {
        db.prepare("UPDATE material_archive SET quantity = quantity - ? WHERE id = ?")
          .run(used_quantity, material.archive_id);
      }
    })();

    res.json({ success: true });
  });

  app.delete("/api/materials/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM materials WHERE id = ?").run(id);
    res.json({ success: true });
  });

  // Income
  app.get("/api/income", (req, res) => {
    const { laboratory_id } = req.query;
    const rows = db.prepare("SELECT * FROM income WHERE laboratory_id = ? ORDER BY date DESC").all(laboratory_id);
    res.json(rows);
  });

  app.post("/api/income", (req, res) => {
    const { laboratory_id, description, amount, date } = req.body;
    const info = db.prepare(
      "INSERT INTO income (laboratory_id, description, amount, date) VALUES (?, ?, ?, ?)"
    ).run(laboratory_id, description, amount, date || new Date().toISOString());
    res.json({ id: info.lastInsertRowid });
  });

  app.delete("/api/income/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM income WHERE id = ?").run(id);
    res.json({ success: true });
  });

  // Expenses
  app.get("/api/expenses", (req, res) => {
    const { laboratory_id } = req.query;
    const rows = db.prepare("SELECT * FROM expenses WHERE laboratory_id = ? ORDER BY date DESC").all(laboratory_id);
    res.json(rows);
  });

  app.post("/api/expenses", (req, res) => {
    const { laboratory_id, category, description, amount, date } = req.body;
    const info = db.prepare(
      "INSERT INTO expenses (laboratory_id, category, description, amount, date) VALUES (?, ?, ?, ?, ?)"
    ).run(laboratory_id, category, description, amount, date || new Date().toISOString());
    res.json({ id: info.lastInsertRowid });
  });

  app.delete("/api/expenses/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM expenses WHERE id = ?").run(id);
    res.json({ success: true });
  });

  // Summary
  app.get("/api/summary", (req, res) => {
    const { laboratory_id } = req.query;
    const totalIncome = db.prepare("SELECT SUM(amount) as total FROM income WHERE laboratory_id = ?").get(laboratory_id).total || 0;
    const totalExpenses = db.prepare("SELECT SUM(amount) as total FROM expenses WHERE laboratory_id = ?").get(laboratory_id).total || 0;
    const materialCosts = db.prepare("SELECT SUM(amount) as total FROM expenses WHERE laboratory_id = ? AND category = 'material_purchase'").get(laboratory_id).total || 0;
    const salaryCosts = db.prepare("SELECT SUM(amount) as total FROM expenses WHERE laboratory_id = ? AND category = 'salary'").get(laboratory_id).total || 0;
    const otherCosts = db.prepare("SELECT SUM(amount) as total FROM expenses WHERE laboratory_id = ? AND category = 'other'").get(laboratory_id).total || 0;

    res.json({
      totalIncome,
      totalExpenses,
      netProfit: totalIncome - totalExpenses,
      breakdown: {
        materials: materialCosts,
        salaries: salaryCosts,
        other: otherCosts
      }
    });
  });

  // --- Vite Middleware ---
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log("Vite middleware attached.");
  });
}

startServer();
