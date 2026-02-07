require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

// =============================
// ENV
// =============================
const ADMIN_KEY = process.env.ADMIN_KEY;
if (!ADMIN_KEY) {
  console.error("❌ ADMIN_KEY missing. Set it in .env (local) or Render → Environment.");
  process.exit(1);
}

const PORT = process.env.PORT || 3000;

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

  // Date(year, monthIndex, day)
  const d = new Date(year, month - 1, day);

  // Guard against invalid dates like 31/02/2026
  if (d.getFullYear() !== year || d.getMonth() !== (month - 1) || d.getDate() !== day) return null;

  return d;
}

function soldTooOld(car) {
  if (!car || !car.soldDate) return false;

  const soldDate = parseUKDate(car.soldDate);
  if (!soldDate) return false;

  const hideAfterMs = SOLD_HIDE_DAYS * 24 * 60 * 60 * 1000;
  return (Date.now() - soldDate.getTime()) > hideAfterMs;
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
    ".ico": "image/x-icon"
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

function writeJsonFile(filename, data) {
  const filePath = path.join(__dirname, filename);
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmpPath, filePath);
}

function readCars() {
  return safeReadJsonArray("cars.json");
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
    req.on("data", chunk => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function todayUK() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
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
    // /images/*
    if (pathname.startsWith("/images/")) {
      return serveFile(res, path.join(__dirname, pathname));
    }

    // Any other static file that exists (favicon, css, etc)
    const possible = path.join(__dirname, pathname);
    if (pathname !== "/" && fs.existsSync(possible) && fs.statSync(possible).isFile()) {
      return serveFile(res, possible);
    }
  }

  // -----------------------------
  // API: GET
  // -----------------------------
  if (req.method === "GET" && pathname === "/cars") {
    // Public list: hide sold cars after SOLD_HIDE_DAYS
    const cars = readCars().filter(c => !soldTooOld(c));
    return sendJson(res, 200, cars);
  }

  if (req.method === "GET" && pathname === "/car-data") {
    const name = String(urlObj.searchParams.get("name") || "").trim();
    if (!name) return sendJson(res, 400, { success: false, message: "Missing name" });

    const cars = readCars();
    const car = cars.find(c => String(c.name || "").toLowerCase() === name.toLowerCase());

    if (!car || soldTooOld(car)) {
      return sendJson(res, 404, { success: false, message: "Car not found" });
    }

    return sendJson(res, 200, car);
  }

  if (req.method === "GET" && pathname === "/garages-data") {
    return sendJson(res, 200, readGarages());
  }

  // Optional: admin endpoint to see ALL cars (including sold/old)
  if (req.method === "GET" && pathname === "/cars-admin") {
    if (!isAdmin(req)) return sendJson(res, 403, { success: false, message: "Forbidden" });
    return sendJson(res, 200, readCars());
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

    const cars = readCars();

    const car = {
      name,
      year,
      price,
      garageId,
      photos,
      photo: photos[0],
      updatedAt: new Date().toISOString()
    };

    // Optional fields (copy if present)
    [
      "mileage",
      "engine",
      "fuel",
      "transmission",
      "colour",
      "owners",
      "serviceHistory",
      "motUntil",
      "description",
      "sold",
      "soldDate"
    ].forEach(k => {
      if (data[k] !== undefined && data[k] !== null && String(data[k]).trim() !== "") {
        car[k] = data[k];
      }
    });

    cars.push(car);
    writeJsonFile("cars.json", cars);

    return sendJson(res, 200, { success: true });
  }

  // -----------------------------
  // API: DELETE /cars?name=  (dashboard delete)
  // -----------------------------
  if (req.method === "DELETE" && pathname === "/cars") {
    if (!isAdmin(req)) return sendJson(res, 403, { success: false, message: "Wrong key" });

    const name = String(urlObj.searchParams.get("name") || "").trim();
    if (!name) return sendJson(res, 400, { success: false, message: "Missing name" });

    const cars = readCars();
    const before = cars.length;

    const remaining = cars.filter(
      c => String(c.name || "").toLowerCase() !== name.toLowerCase()
    );

    if (remaining.length === before) {
      return sendJson(res, 404, { success: false, message: "Not found" });
    }

    writeJsonFile("cars.json", remaining);
    return sendJson(res, 200, { success: true });
  }

  // -----------------------------
  // OPTIONAL: Mark sold (simple endpoint)
  // POST /cars-sold?name=
  // -----------------------------
  if (req.method === "POST" && pathname === "/cars-sold") {
    if (!isAdmin(req)) return sendJson(res, 403, { success: false, message: "Wrong key" });

    const name = String(urlObj.searchParams.get("name") || "").trim();
    if (!name) return sendJson(res, 400, { success: false, message: "Missing name" });

    const cars = readCars();
    const idx = cars.findIndex(
      c => String(c.name || "").toLowerCase() === name.toLowerCase()
    );
    if (idx === -1) return sendJson(res, 404, { success: false, message: "Not found" });

    cars[idx].sold = true;
    cars[idx].soldDate = cars[idx].soldDate || todayUK();
    cars[idx].updatedAt = new Date().toISOString();

    writeJsonFile("cars.json", cars);
    return sendJson(res, 200, { success: true, soldDate: cars[idx].soldDate });
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
