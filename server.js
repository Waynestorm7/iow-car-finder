console.log("SERVER FILE LOADED FROM:", __filename);

const http = require("http");
const fs = require("fs");
const path = require("path");

// ==================================================
// 🔐 ADMIN KEY (MUST be set in hosting environment)
// ==================================================
const ADMIN_KEY = process.env.ADMIN_KEY || "iowcfPROD_7X9mQ2L5A8RkS6UeT4H1C0B";

if (!ADMIN_KEY) {
  console.error("❌ ERROR: ADMIN_KEY is not set.");
  console.error("Set it in your hosting control panel.");
  process.exit(1);
}

// ==================================================
// HELPERS
// ==================================================
function serveHtml(res, filename) {
  const filePath = path.join(__dirname, filename);
  const html = fs.readFileSync(filePath);
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function safeReadJsonArray(fileName) {
  const filePath = path.join(__dirname, fileName);

  if (!fs.existsSync(filePath)) return [];

  try {
    const data = fs.readFileSync(filePath, "utf8").trim();
    if (!data) return [];
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.error(`${fileName} invalid JSON.`);
    return [];
  }
}

function readCars() {
  return safeReadJsonArray("cars.json");
}

function readGarages() {
  return safeReadJsonArray("garages.json");
}

function writeCars(cars) {
  const filePath = path.join(__dirname, "cars.json");
  const tmpPath = path.join(__dirname, "cars.json.tmp");
  const bakPath = path.join(__dirname, "cars.json.bak");

  const json = JSON.stringify(cars, null, 2);

  fs.writeFileSync(tmpPath, json, "utf8");

  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, bakPath);
  }

  fs.renameSync(tmpPath, filePath);
}

function sendJson(res, status, obj) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8"
  });
  res.end(JSON.stringify(obj));
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";

  return "application/octet-stream";
}

// ==================================================
// DASHBOARD AUTH (KEY ONLY, NO COOKIE)
// ==================================================
function isAuthedForDashboard(urlObj) {
  const key = String(urlObj.searchParams.get("k") || "").trim();
  return key === ADMIN_KEY;
}

// ==================================================
// SERVER
// ==================================================
const server = http.createServer((req, res) => {

  const cleanUrl = req.url.split("?")[0];
  const urlObj = new URL(req.url, "http://localhost");

  // ==================================================
  // API
  // ==================================================

  // GET /cars
  if (req.method === "GET" && cleanUrl === "/cars") {
    return sendJson(res, 200, readCars());
  }

  // GET /car-data?name=
  if (req.method === "GET" && cleanUrl === "/car-data") {

    const name = String(urlObj.searchParams.get("name") || "").trim();

    if (!name) {
      return sendJson(res, 400, { success: false });
    }

    const cars = readCars();

    const found = cars.find(c =>
      String(c.name || "").toLowerCase() === name.toLowerCase()
    );

    if (!found) {
      return sendJson(res, 404, { success: false });
    }

    return sendJson(res, 200, found);
  }

  // GET /garages-data
  if (req.method === "GET" && cleanUrl === "/garages-data") {
    return sendJson(res, 200, readGarages());
  }

  // POST /cars (protected)
  if (req.method === "POST" && cleanUrl === "/cars") {

    const key = req.headers["x-garage-key"];

    if (key !== ADMIN_KEY) {
      return sendJson(res, 403, { success: false });
    }

    let body = "";

    req.on("data", chunk => body += chunk);

    req.on("end", () => {

      let data;

      try {
        data = JSON.parse(body || "{}");
      } catch {
        return sendJson(res, 400, { success: false });
      }

      const name = String(data.name || "").trim();
      const year = Number(data.year);
      const price = Number(data.price);
      const garageId = String(data.garageId || "").trim();

      if (!name || !garageId) {
        return sendJson(res, 400, { success: false });
      }

      if (!Number.isInteger(year)) {
        return sendJson(res, 400, { success: false });
      }

      if (!Number.isFinite(price) || price <= 0) {
        return sendJson(res, 400, { success: false });
      }

      const photos = Array.isArray(data.photos) ? data.photos : [];

      const cars = readCars();

      const car = {
        name,
        year,
        price,
        garageId,
        photos,
        photo: photos[0] || "/images/hero.jpg",
        updatedAt: new Date().toISOString()
      };

      // Optional fields
      [
        "mileage",
        "engine",
        "fuel",
        "transmission",
        "colour",
        "owners",
        "serviceHistory",
        "motUntil",
        "description"
      ].forEach(k => {
        if (data[k]) car[k] = data[k];
      });

      cars.push(car);

      writeCars(cars);

      return sendJson(res, 200, { success: true });
    });

    return;
  }

  // DELETE /cars
  if (req.method === "DELETE" && cleanUrl === "/cars") {

    const key = req.headers["x-garage-key"];

    if (key !== ADMIN_KEY) {
      return sendJson(res, 403, { success: false });
    }

    const name = String(urlObj.searchParams.get("name") || "").trim();

    if (!name) {
      return sendJson(res, 400, { success: false });
    }

    let cars = readCars();

    const before = cars.length;

    cars = cars.filter(c => c.name !== name);

    if (cars.length === before) {
      return sendJson(res, 404, { success: false });
    }

    writeCars(cars);

    return sendJson(res, 200, { success: true });
  }

  // ==================================================
  // PAGES
  // ==================================================

  if (req.method === "GET" && cleanUrl === "/") {
    return serveHtml(res, "index.html");
  }

  if (req.method === "GET" && cleanUrl === "/cars-page") {
    return serveHtml(res, "cars.html");
  }

  if (req.method === "GET" && cleanUrl === "/car") {
    return serveHtml(res, "car.html");
  }

  if (req.method === "GET" && cleanUrl === "/for-garages") {
    return serveHtml(res, "for-garages.html");
  }

  // 🔐 Hidden dashboard
  if (req.method === "GET" && cleanUrl === "/garage-dashboard") {

    if (!isAuthedForDashboard(urlObj)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }

    return serveHtml(res, "garage-dashboard.html");
  }

  // ==================================================
  // IMAGES
  // ==================================================

  if (req.method === "GET" && cleanUrl.startsWith("/images/")) {

    const img = path.join(
      __dirname,
      "images",
      path.basename(cleanUrl.replace("/images/", ""))
    );

    if (!fs.existsSync(img)) {
      res.writeHead(404);
      return res.end("Not found");
    }

    res.writeHead(200, {
      "Content-Type": getMimeType(img)
    });

    return res.end(fs.readFileSync(img));
  }

  // ==================================================
  // 404
  // ==================================================

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.listen(3000, () => {
  console.log("✅ Server running: http://localhost:3000");
});
