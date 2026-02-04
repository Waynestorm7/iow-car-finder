const http = require("http");
const fs = require("fs");
const path = require("path");

// =============================
// ADMIN KEY
// =============================
const ADMIN_KEY = process.env.ADMIN_KEY;

if (!ADMIN_KEY) {
  console.error("❌ ADMIN_KEY missing");
  process.exit(1);
}

// =============================
// HELPERS
// =============================
function serveHtml(res, filename) {
  const filePath = path.join(__dirname, filename);
  const html = fs.readFileSync(filePath);
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(html);
}

function safeReadJsonArray(file) {
  const filePath = path.join(__dirname, file);

  if (!fs.existsSync(filePath)) return [];

  try {
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data);
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

function sendJson(res, status, obj) {
  res.writeHead(status, {
    "Content-Type": "application/json"
  });
  res.end(JSON.stringify(obj));
}

// =============================
// SERVER
// =============================
const server = http.createServer((req, res) => {

  const cleanUrl = req.url.split("?")[0];

  // API
  if (req.method === "GET" && cleanUrl === "/cars") {
    return sendJson(res, 200, readCars());
  }

  if (req.method === "GET" && cleanUrl === "/garages") {
    return sendJson(res, 200, readGarages());
  }

  // Pages
  if (req.method === "GET" && cleanUrl === "/") {
    return serveHtml(res, "index.html");
  }

  if (req.method === "GET" && cleanUrl === "/cars-page") {
    return serveHtml(res, "cars.html");
  }

  if (req.method === "GET" && cleanUrl === "/for-garages") {
    return serveHtml(res, "for-garages.html");
  }

  // 404
  res.writeHead(404);
  res.end("Not found");
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("✅ Server running on port", PORT);
});
