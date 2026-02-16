// server.js
require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");
const { createClient } = require("@supabase/supabase-js");

// =============================
// ENV
// =============================
const ADMIN_KEY = process.env.ADMIN_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET = process.env.SUPABASE_SECRET; // service role key (server only)
const PORT = process.env.PORT || 3000;

if (!ADMIN_KEY) {
  console.error("❌ ADMIN_KEY missing. Set it in .env (local) or Render → Environment.");
  process.exit(1);
}
if (!SUPABASE_URL) {
  console.error("❌ SUPABASE_URL missing. Set it in .env or Render → Environment.");
  process.exit(1);
}
if (!SUPABASE_SECRET) {
  console.error("❌ SUPABASE_SECRET missing. Set it in .env or Render → Environment.");
  process.exit(1);
}

// Supabase client (server-side privileged)
const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET, {
  auth: { persistSession: false },
});

// =============================
// SOLD HELPERS (UK date DD/MM/YYYY)
// =============================
const SOLD_HIDE_DAYS = 7;

function parseUKDate(str) {
  if (!str) return null;
  const parts = String(str).trim().split("/");
  if (parts.length !== 3) return null;

  const day = Number(parts[0]);
  const month = Number(parts[1]);
  const year = Number(parts[2]);

  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return null;
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000 || year > 2100) return null;

  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d;
}

function soldTooOld(car) {
  if (!car || !car.soldDate) return false;
  const soldDate = parseUKDate(car.soldDate);
  if (!soldDate) return false;

  const hideAfterMs = SOLD_HIDE_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() - soldDate.getTime() > hideAfterMs;
}

function todayUK() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

// =============================
// BASIC HELPERS
// =============================
function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, { "Content-Type": "application/json; charset=utf-8" }, JSON.stringify(obj));
}

function getMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
  };
  return types[ext] || "application/octet-stream";
}

function serveFile(res, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return send(res, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not found");
  }
  const data = fs.readFileSync(filePath);
  return send(res, 200, { "Content-Type": getMime(filePath) }, data);
}

function safeReadJsonArray(filename) {
  const filePath = path.join(__dirname, filename);
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readGarages() {
  return safeReadJsonArray("garages.json");
}

function isAdmin(req) {
  const key = String(req.headers["x-garage-key"] || "").trim();
  return key === ADMIN_KEY;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

// =============================
// SUPABASE MAPPING (DB -> frontend)
// =============================
function mapDbCar(row) {
  const photos = Array.isArray(row.photos) ? row.photos.filter(Boolean) : [];

  return {
    id: row.id,
    name: row.name ?? null,
    year: row.year ?? null,
    price: row.price ?? null,

    garageId: row.garageId ?? null,

    photos,
    photo: photos.length ? photos[0] : null,

    mileage: row.mileage ?? null,
    fuel: row.fuel ?? null,
    transmission: row.transmission ?? null,
    engine: row.engine ?? null,
    owners: row.owners ?? null,
    colour: row.colour ?? null,

    description: row.description ?? null,
    extras: row.extras ?? null,

    createdAt: row.created_at ?? null,
    updatedAt: row.updatedAt ?? row.updated_at ?? row.created_at ?? null,

    sold: row.sold ?? false,
    soldDate: row.soldDate ?? row.sold_date ?? null,
  };
}

// =============================
// SUPABASE DB FUNCTIONS
// =============================
async function dbListCars() {
  const { data, error } = await supabase
    .from("cars")
    .select("*")
    .order("updatedAt", { ascending: false });

  if (error) throw error;
  return (data || []).map(mapDbCar);
}

async function dbGetCarByName(name) {
  const { data, error } = await supabase
    .from("cars")
    .select("*")
    .eq("name", name)
    .limit(1);

  if (error) throw error;
  const row = (data || [])[0];
  return row ? mapDbCar(row) : null;
}

async function dbInsertCar(payload) {
  const name = String(payload.name || "").trim();
  const garageId = String(payload.garageId || "").trim();

  const row = {
    name,
    year: Number(payload.year),
    price: Number(payload.price),

    garageId,

    mileage: payload.mileage ?? null,
    fuel: payload.fuel ?? null,
    transmission: payload.transmission ?? null,
    engine: payload.engine ?? null,
    owners: payload.owners ?? null,
    colour: payload.colour ?? null,

    // ✅ description MUST be saved
    description: (payload.description && String(payload.description).trim())
      ? String(payload.description).trim()
      : null,

    // ✅ photos: jsonb array of strings
    photos: (Array.isArray(payload.photos) ? payload.photos : [])
      .map((x) => String(x).trim())
      .filter(Boolean),

    // ✅ extras: saved as a single string (your UI splits into bullets)
    extras: (payload.extras && String(payload.extras).trim())
      ? String(payload.extras).trim()
      : null,

    sold: false,
    soldDate: null,

    updatedAt: new Date().toISOString(),
  };

  const { error } = await supabase.from("cars").insert(row);
  if (error) throw error;
}

async function dbDeleteCarByName(name) {
  const { error, count } = await supabase
    .from("cars")
    .delete({ count: "exact" })
    .eq("name", name);

  if (error) throw error;
  return count || 0;
}

async function dbMarkSoldByName(name) {
  const soldDate = todayUK();

  const { error, data } = await supabase
    .from("cars")
    .update({
      sold: true,
      soldDate,
      updatedAt: new Date().toISOString(),
    })
    .eq("name", name)
    .select("soldDate")
    .limit(1);

  if (error) throw error;
  const updated = (data || [])[0];
  return updated ? updated.soldDate : soldDate;
}

// =============================
// SERVER
// =============================
const server = http.createServer(async (req, res) => {
  const base = `http://${req.headers.host || "localhost"}`;
  const urlObj = new URL(req.url, base);
  const pathname = urlObj.pathname; // ✅ (REMOVED the bad "|")

  // -----------------------------
  // STATIC FILES
  // -----------------------------
  if (req.method === "GET") {
    if (pathname.startsWith("/images/")) {
      return serveFile(res, path.join(__dirname, pathname));
    }

    const possible = path.join(__dirname, pathname);
    if (pathname !== "/" && fs.existsSync(possible) && fs.statSync(possible).isFile()) {
      return serveFile(res, possible);
    }
  }

  // -----------------------------
  // API: GET
  // -----------------------------
  if (req.method === "GET" && pathname === "/cars") {
    try {
      const cars = (await dbListCars()).filter((c) => !soldTooOld(c));
      return sendJson(res, 200, cars);
    } catch (e) {
      console.error("GET /cars error:", e);
      return sendJson(res, 500, { success: false, message: "Database error" });
    }
  }

  if (req.method === "GET" && pathname === "/car-data") {
    const name = String(urlObj.searchParams.get("name") || "").trim();
    if (!name) return sendJson(res, 400, { success: false, message: "Missing name" });

    try {
      const car = await dbGetCarByName(name);
      if (!car || soldTooOld(car)) return sendJson(res, 404, { success: false, message: "Car not found" });
      return sendJson(res, 200, car);
    } catch (e) {
      console.error("GET /car-data error:", e);
      return sendJson(res, 500, { success: false, message: "Database error" });
    }
  }

  if (req.method === "GET" && pathname === "/garages-data") {
    return sendJson(res, 200, readGarages());
  }

  // Admin: see ALL cars including old sold ones
  if (req.method === "GET" && pathname === "/cars-admin") {
    if (!isAdmin(req)) return sendJson(res, 403, { success: false, message: "Forbidden" });

    try {
      const cars = await dbListCars();
      return sendJson(res, 200, cars);
    } catch (e) {
      console.error("GET /cars-admin error:", e);
      return sendJson(res, 500, { success: false, message: "Database error" });
    }
  }

  // -----------------------------
  // API: POST /cars (dashboard add)
  // -----------------------------
  if (req.method === "POST" && pathname === "/cars") {
    if (!isAdmin(req)) return sendJson(res, 403, { success: false, message: "Wrong key" });

    let data;
    try {
      const raw = await readBody(req);
      data = JSON.parse(raw || "{}");
    } catch {
      return sendJson(res, 400, { success: false, message: "Bad JSON" });
    }

    const name = String(data.name || "").trim();
    const garageId = String(data.garageId || "").trim();
    const year = Number(data.year);
    const price = Number(data.price);
    const photos = Array.isArray(data.photos) ? data.photos.filter(Boolean) : [];

    if (!name || !garageId) return sendJson(res, 400, { success: false, message: "Missing name/garageId" });
    if (!Number.isInteger(year)) return sendJson(res, 400, { success: false, message: "Year must be integer" });
    if (!Number.isFinite(price) || price <= 0) return sendJson(res, 400, { success: false, message: "Price must be > 0" });
    if (!photos.length) return sendJson(res, 400, { success: false, message: "At least 1 photo required" });

    try {
      await dbInsertCar(data);
      return sendJson(res, 200, { success: true });
    } catch (e) {
      console.error("POST /cars error:", e);
      return sendJson(res, 500, { success: false, message: "Database insert failed" });
    }
  }

  // -----------------------------
  // API: DELETE /cars?name=
  // -----------------------------
  if (req.method === "DELETE" && pathname === "/cars") {
    if (!isAdmin(req)) return sendJson(res, 403, { success: false, message: "Wrong key" });

    const name = String(urlObj.searchParams.get("name") || "").trim();
    if (!name) return sendJson(res, 400, { success: false, message: "Missing name" });

    try {
      const deleted = await dbDeleteCarByName(name);
      if (!deleted) return sendJson(res, 404, { success: false, message: "Not found" });
      return sendJson(res, 200, { success: true });
    } catch (e) {
      console.error("DELETE /cars error:", e);
      return sendJson(res, 500, { success: false, message: "Database delete failed" });
    }
  }

  // -----------------------------
  // POST /cars-sold?name=
  // -----------------------------
  if (req.method === "POST" && pathname === "/cars-sold") {
    if (!isAdmin(req)) return sendJson(res, 403, { success: false, message: "Wrong key" });

    const name = String(urlObj.searchParams.get("name") || "").trim();
    if (!name) return sendJson(res, 400, { success: false, message: "Missing name" });

    try {
      const soldDate = await dbMarkSoldByName(name);
      return sendJson(res, 200, { success: true, soldDate });
    } catch (e) {
      console.error("POST /cars-sold error:", e);
      return sendJson(res, 500, { success: false, message: "Database update failed" });
    }
  }

  // -----------------------------
  // PAGES
  // -----------------------------
  if (req.method === "GET" && pathname === "/") return serveFile(res, path.join(__dirname, "index.html"));
  if (req.method === "GET" && pathname === "/cars-page") return serveFile(res, path.join(__dirname, "cars.html"));
  if (req.method === "GET" && pathname === "/car") return serveFile(res, path.join(__dirname, "car.html"));
  if (req.method === "GET" && pathname === "/for-garages") return serveFile(res, path.join(__dirname, "for-garages.html"));
  if (req.method === "GET" && pathname === "/garage-dashboard") return serveFile(res, path.join(__dirname, "garage-dashboard.html"));

  // -----------------------------
  // 404
  // -----------------------------
  return send(res, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not found");
});

server.listen(PORT, () => {
  console.log("✅ Server running on port", PORT);
});
