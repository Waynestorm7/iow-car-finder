require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

// =============================
// ENV
// =============================
const ADMIN_KEY = process.env.ADMIN_KEY;
if (!ADMIN_KEY) {
  console.error("❌ ADMIN_KEY missing");
  process.exit(1);
}

const PORT = process.env.PORT || 3000;

// =============================
// HELPERS
// =============================
function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, obj) {
  send(res, status, { "Content-Type": "application/json" }, JSON.stringify(obj));
}

function serveFile(res, filePath) {
  if (!fs.existsSync(filePath)) {
    send(res, 404, { "Content-Type": "text/plain" }, "Not found");
    return;
  }

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
    ".svg": "image/svg+xml"
  };

  const contentType = types[ext] || "application/octet-stream";
  const data = fs.readFileSync(filePath);

  send(res, 200, { "Content-Type": contentType }, data);
}

function serveHtml(res, filename) {
  const filePath = path.join(__dirname, filename);
  serveFile(res, filePath);
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

function readCars() {
  return safeReadJsonArray("cars.json");
}

function readGarages() {
  return safeReadJsonArray("garages.json");
}

// =============================
// SERVER
// =============================
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // -----------------------------
  // STATIC: /images/* (and any file that exists)
  // -----------------------------
  if (pathname.startsWith("/images/")) {
    const filePath = path.join(__dirname, pathname);
    return serveFile(res, filePath);
  }

  // (Optional) serve other static files if you add them later
  // e.g. /styles.css or /app.js
  const possibleStatic = path.join(__dirname, pathname);
  if (
    req.method === "GET" &&
    !pathname.endsWith("/") &&
    fs.existsSync(possibleStatic) &&
    fs.statSync(possibleStatic).isFile()
  ) {
    return serveFile(res, possibleStatic);
  }

  // -----------------------------
  // API
  // -----------------------------
  if (req.method === "GET" && pathname === "/cars") {
    return sendJson(res, 200, readCars());
  }

  if (req.method === "GET" && pathname === "/garages") {
    return sendJson(res, 200, readGarages());
  }

  // Your car.html expects these:
  if (req.method === "GET" && pathname === "/garages-data") {
    return sendJson(res, 200, readGarages());
  }

  if (req.method === "GET" && pathname === "/car-data") {
    const name = String(parsed.query.name || "").trim();
    if (!name) return sendJson(res, 400, { success: false, message: "Missing name" });

    const cars = readCars();
    const car = cars.find(c => String(c.name || "").toLowerCase() === name.toLowerCase());

    if (!car) return sendJson(res, 404, { success: false, message: "Car not found" });
    return sendJson(res, 200, car);
  }

  // -----------------------------
  // PAGES
  // -----------------------------
  if (req.method === "GET" && pathname === "/") {
    return serveHtml(res, "index.html");
  }

  if (req.method === "GET" && pathname === "/cars-page") {
    return serveHtml(res, "cars.html");
  }

  if (req.method === "GET" && pathname === "/car") {
    return serveHtml(res, "car.html");
  }

  if (req.method === "GET" && pathname === "/for-garages") {
    return serveHtml(res, "for-garages.html");
  }

  if (req.method === "GET" && pathname === "/garage-dashboard") {
    return serveHtml(res, "garage-dashboard.html");
  }

  // -----------------------------
  // 404
  // -----------------------------
  send(res, 404, { "Content-Type": "text/plain" }, "Not found");
});

server.listen(PORT, () => {
  console.log("✅ Server running on port", PORT);
});
