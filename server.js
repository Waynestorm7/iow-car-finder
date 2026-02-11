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
const SUPABASE_SECRET = process.env.SUPABASE_SECRET; // service role / secret key (server only)

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

const PORT = process.env.PORT || 3000;

// Supabase client (server-side privileged)
const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET, {
  auth: { persistSession: false },
});

// =============================
// SOLD HELPERS (UK date DD/MM/YYYY)
// =============================
const SOLD_HIDE_DAYS = 7; // change to 14 later if you want

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
// HELPERS
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
  // garages still from file (you can move later)
  return safeReadJsonArray("garages.json");
}

function isAdmin(req) {
  const key = String(req.headers["x-garage-key"] || req.headers["x-garage-key".toLowerCase()] || "").trim();
  // also accept X-Garage-Key in any casing:
  // Node lowercases headers, so "x-garage-key" is enough.
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
// SUPABASE MAPPING
// =============================
function mapDbCar(row) {
  let photos = [];

  if (Array.isArray(row.photos)) {
    photos = row.photos.filter(Boolean);
  } else if (typeof row.photos === "string" && row.photos.trim()) {
    // if it ever comes back as JSON string
    try {
      const parsed = JSON.parse(row.photos);
      if (Array.isArray(parsed)) photos = parsed.filter(Boolean);
    } catch {
      photos = [];
    }
  }

  return {
    id: row.id,

    name: row.name,
    year: row.year,
    price: row.price,

    // DB snake_case -> frontend camelCase
    garageId: row.garage_id ?? null,

    photos,
    photo: photos.length ? photos[0] : null,

    mileage: row.mileage ?? null,
    fuel: row.fuel ?? null,
    transmission: row.transmission ?? null,
    engine: row.engine ?? null,
    owners: row.owners ?? null,
    colour: row.colour ?? null,
    description: row.description ?? null,

    // frontend sorts using updatedAt
    createdAt: row.created_at ?? null,
    updatedAt: row.updatedat ?? row.updated_at ?? row.created_at ?? null,

    sold: row.sold ?? false,
    soldDate: row.solddate ?? row.sold_date ?? null,
  };
}

// =============================
// SUPABASE DB FUNCTIONS
// =============================

function mapDbCar(row) {
  let photos = [];

  // photos stored as JSON string in text column
  if (typeof row.photos === "string" && row.photos.trim()) {
    try {
      const parsed = JSON.parse(row.photos);
      if (Array.isArray(parsed)) photos = parsed;
    } catch {
      photos = [];
    }
  }

  return {
    id: row.id,
    name: row.name,
    year: row.year,
    price: row.price,

    garageId: row.garageId,

    photos,
    photo: photos.length ? photos[0] : null,

    mileage: row.mileage,
    fuel: row.fuel,
    transmission: row.transmission,
    engine: row.engine,
    owners: row.owners,
    colour: row.colour,
    description: row.description,

    createdAt: row.created_at,
    updatedAt: row.updatedAt,

    sold: row.sold,
    soldDate: row.soldDate,
  };
}

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
  const photosArray = Array.isArray(payload.photos) ? payload.photos : [];

  const row = {
    name: String(payload.name || "").trim(),
    year: Number(payload.year),
    price: Number(payload.price),

    // NOTE: your column is garageId (camelCase)
    garageId: String(payload.garageId || "").trim(),

    // NOTE: your column photos is TEXT, so store JSON string
    photos: JSON.stringify(photosArray),

    mileage: payload.mileage ?? null,
    fuel: payload.fuel ?? null,
    transmission: payload.transmission ?? null,
    engine: payload.engine ?? null,
    owners: payload.owners ?? null,
    colour: payload.colour ?? null,
    description: payload.description ?? null,

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

  const { error } = await supabase
    .from("cars")
    .update({
      sold: true,
      soldDate: soldDate,
      updatedAt: new Date().toISOString(),
    })
    .eq("name", name);

  if (error) throw error;
  return soldDate;
}

// =============================
// SERVER
// =============================
const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, "http://localhost");
  const pathname = urlObj.pathname;

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

  // Admin: see all cars (including sold/old)
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
  // API: POST /cars  (dashboard add)
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
    const year = Number(data.year);
    const price = Number(data.price);
    const garageId = String(data.garageId || "").trim();
    const photos = Array.isArray(data.photos) ? data.photos : [];

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
  // API: DELETE /cars?name=  (dashboard delete)
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
  // OPTIONAL: Mark sold
  // POST /cars-sold?name=
  // -----------------------------
  if (req.method === "POST" && pathname === "/cars-sold") {
    if (!isAdmin(req)) return sendJson(res, 403, { success: false, message: "Wrong key" });

    const name = String(urlObj.searchParams.get("name") || "").trim();
    if (!name) return sendJson(res, 400, { success: false, message: "Missing name" });

    try {
      const car = await dbMarkSoldByName(name);
      if (!car) return sendJson(res, 404, { success: false, message: "Not found" });
      return sendJson(res, 200, { success: true, soldDate: car.soldDate || todayUK() });
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