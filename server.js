require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const { createClient } = require("@supabase/supabase-js");
const cloudinary = require("cloudinary").v2;
const multer = require("multer");

// =============================
// Upload temp directory
// =============================
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// =============================
// ENV
// =============================
const ADMIN_KEY = process.env.ADMIN_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET = process.env.SUPABASE_SECRET;
const PORT = process.env.PORT || 3000;

// ... your ENV checks stay the same ...

// =============================
// Cloudinary Config
// =============================
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer (disk temp)
const upload = multer({ dest: UPLOAD_DIR });

// Supabase client
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

function readGaragesFile() {
  // Legacy file-based garages.json (optional)
  return safeReadJsonArray("garages.json");
}

function isAdmin(req) {
  // Node lowercases headers
  const key = String(req.headers["x-garage-key"] || "").trim();
  return key === ADMIN_KEY;
}

async function getGarageFromAuth(req) {
  const authHeader = String(req.headers.authorization || "").trim();

  if (!authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.replace("Bearer ", "").trim();

  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData || !userData.user) {
    return null;
  }

  const userId = userData.user.id;

  const { data, error } = await supabase
    .from("garage_users")
    .select("garage_id, role, status")
    .eq("user_id", userId)
    .eq("status", "active")
    .single();

  if (error || !data) {
    return null;
  }

  return {
    userId,
    garageId: data.garage_id,
    role: data.role,
    status: data.status
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch { }
}

// =============================
// SUPABASE MAPPING (DB -> frontend)
// =============================
function mapDbCar(row) {
  const photos = Array.isArray(row.photos) ? row.photos.filter(Boolean) : [];

  // If you used a join, Supabase may return the garage row under "garages"
  const joinedGarage = row.garages || row.garage || null;

  return {
    id: row.id,
    name: row.name ?? null,
    year: row.year ?? null,
    price: row.price ?? null,

    // supports both column styles
    garageId: row.garage_id ?? null,

    // ✅ NEW: garageName (used by cars.html so you don’t show UUID)
    garageName: joinedGarage?.name ?? row.garageName ?? null,

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
    updatedAt: row.updatedAt ?? null,

    status: row.status ?? "available",
    sold: row.sold ?? false,
    soldDate: row.soldDate ?? row.sold_date ?? null,
  };
}

// =============================
// SUPABASE DB FUNCTIONS (CARS)
// =============================

async function dbListCars() {
  const { data, error } = await supabase
    .from("cars")
    .select(`
      *,
      garages (
        id,
        name
      )
    `)
    .order("updatedAt", { ascending: false });

  if (error) throw error;

  return (data || []).map(row => {
    const mapped = mapDbCar(row);
    mapped.garageName = row.garages?.name || null;
    return mapped;
  });
}

async function dbGetCarByName(name) {
  const { data, error } = await supabase
    .from("cars")
    .select(`
      *,
      garages (
        id,
        name
      )
    `)
    .ilike("name", name)
    .limit(1);

  if (error) throw error;

  const row = (data || [])[0];
  if (!row) return null;

  const mapped = mapDbCar(row);
  mapped.garageName = row.garages?.name || null;

  return mapped;
}

async function dbInsertCar(payload) {
  const name = String(payload.name || "").trim();

  const garage_id_raw = payload.garage_id ?? payload.garageId ?? null;
  const garage_id = garage_id_raw ? String(garage_id_raw).trim() : null;

  const row = {
    name,
    year: Number(payload.year),
    price: Number(payload.price),
    garage_id,
    mileage: payload.mileage
      ? Number(String(payload.mileage).replace(/[,\s.]/g, ""))
      : null,
    fuel: payload.fuel ?? null,
    transmission: payload.transmission ?? null,
    engine: payload.engine ?? null,
    owners: payload.owners ?? null,
    colour: payload.colour ?? null,
    description: (payload.description && String(payload.description).trim())
      ? String(payload.description).trim()
      : null,
    photos: (Array.isArray(payload.photos) ? payload.photos : [])
      .map(x => String(x).trim())
      .filter(Boolean),
    extras: (payload.extras && String(payload.extras).trim())
      ? String(payload.extras).trim()
      : null,

    status: "available",
    sold: false,
    soldDate: null,
    updatedAt: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("cars")
    .insert(row);

  if (error) throw error;
}

async function dbUpdateCar(payload) {

  const row = {
    name: payload.name,
    year: Number(payload.year),
    price: Number(payload.price),
    mileage: payload.mileage
      ? Number(String(payload.mileage).replace(/[,\s.]/g, ""))
      : null,
    fuel: payload.fuel ?? null,
    transmission: payload.transmission ?? null,
    engine: payload.engine ?? null,
    owners: payload.owners ?? null,
    colour: payload.colour ?? null,
    description: payload.description ?? null,
    photos: payload.photos ?? [],
    extras: payload.extras ?? null,
    updatedAt: new Date().toISOString()
  };

  const { error } = await supabase
    .from("cars")
    .update(row)
    .eq("id", payload.id);

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
    .single();

  if (error) throw error;
  return data?.soldDate || soldDate;
}

async function dbGetCarById(id) {
  const { data, error } = await supabase
    .from("cars")
    .select(`
      *,
      garages (
        id,
        name
      )
    `)
    .eq("id", id)
    .single();

  if (error) throw error;
  if (!data) return null;

  const mapped = mapDbCar(data);
  mapped.garageName = data.garages?.name || null;

  return mapped;
}


// =============================
// SUPABASE DB FUNCTIONS (GARAGES)
// =============================

async function dbListGarages() {
  const { data, error } = await supabase
    .from("garages")
    .select(`
      id,
      name,
      address,
      town,
      postcode,
      phone,
         email,
      website,
      logo_url,
      banner_url,
      opening_hours
    `)
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function dbGetGarageById(id) {
  const cleanId = String(id || "").trim();
  if (!cleanId) return null;

  const { data, error } = await supabase
    .from("garages")
    .select(`
      id,
      name,
      address,
      town,
      postcode,
      phone,
      email,
website,
logo_url,
banner_url,
opening_hours    `)
    .eq("id", cleanId)
    .single();

  if (error) throw error;
  return data || null;
}

async function dbUpdateGarage(id, payload) {
  const cleanId = String(id || "").trim();

  if (!cleanId) {
    throw new Error("Missing garage id");
  }

  const row = {
    name: payload.name ? String(payload.name).trim() : null,
    phone: payload.phone ? String(payload.phone).trim() : null,
    email: payload.email ? String(payload.email).trim() : null,
    website: payload.website ? String(payload.website).trim() : null,
    logo_url: payload.logo_url ? String(payload.logo_url).trim() : null,
    banner_url: payload.banner_url ? String(payload.banner_url).trim() : null,
    address: payload.address ? String(payload.address).trim() : null,
    opening_hours: payload.opening_hours ? String(payload.opening_hours).trim() : null,
    description: payload.description ? String(payload.description).trim() : null,
  };

  const { error } = await supabase
    .from("garages")
    .update(row)
    .eq("id", cleanId);

  if (error) throw error;
}

async function dbGetGaragesByIds(ids) {
  const clean = [...new Set((ids || []).filter(Boolean))];
  if (!clean.length) return [];

  const { data, error } = await supabase
    .from("garages")
    .select("id, name")
    .in("id", clean);

  if (error) throw error;
  return data || [];
}


// =============================
// SERVER
// =============================

const server = http.createServer(async (req, res) => {
  const base = `http://${req.headers.host || "localhost"}`;
  const urlObj = new URL(req.url, base);
  const pathname = urlObj.pathname;

  // =============================
  // ROUTE: POST /upload (Cloudinary multiple)
  // Field name: "photos" (up to 12)
  // Returns: { success: true, urls: [...] }
  // =============================
  if (req.method === "POST" && pathname === "/upload") {

    const auth = await getGarageFromAuth(req);

    if (!auth) {
      return sendJson(res, 401, {
        success: false,
        message: "Unauthorized"
      });
    }

    return upload.array("photos", 12)(req, res, async (err) => {
      if (err) {
        console.error("multer error:", err);
        return sendJson(res, 400, { success: false, message: "Upload parse failed" });
      }

      const files = Array.isArray(req.files) ? req.files : [];
      if (!files.length) {
        return sendJson(res, 400, { success: false, message: "No files uploaded. Field name must be 'photos'." });
      }

      try {
        const urls = await Promise.all(
          files.map((f) =>
            cloudinary.uploader
              .upload(f.path, { folder: "cars" })
              .then((r) => r.secure_url)
          )
        );

        // cleanup temp files
        files.forEach((f) => fs.unlink(f.path, () => { }));

        return sendJson(res, 200, { success: true, urls });
      } catch (e) {
        console.error("Cloudinary upload failed:", e);

        // cleanup temp files
        files.forEach((f) => fs.unlink(f.path, () => { }));

        return sendJson(res, 500, { success: false, message: "Cloudinary upload failed" });
      }
    });
  }

  // =============================
  // Admin: POST /admin-upload
  // Field name: "photos" (up to 12)
  // Returns: { success: true, urls: [...] }
  // =============================
  if (req.method === "POST" && pathname === "/admin-upload") {
    if (!isAdmin(req)) {
      return sendJson(res, 403, {
        success: false,
        message: "Forbidden"
      });
    }

    return upload.array("photos", 12)(req, res, async (err) => {
      if (err) {
        console.error("admin multer error:", err);
        return sendJson(res, 400, {
          success: false,
          message: "Upload parse failed"
        });
      }

      const files = Array.isArray(req.files) ? req.files : [];

      if (!files.length) {
        return sendJson(res, 400, {
          success: false,
          message: "No files uploaded. Field name must be 'photos'."
        });
      }

      try {
        const urls = await Promise.all(
          files.map((f) =>
            cloudinary.uploader
              .upload(f.path, { folder: "cars" })
              .then((r) => r.secure_url)
          )
        );

        files.forEach((f) => fs.unlink(f.path, () => { }));

        return sendJson(res, 200, {
          success: true,
          urls
        });

      } catch (e) {
        console.error("Admin Cloudinary upload failed:", e);

        files.forEach((f) => fs.unlink(f.path, () => { }));

        return sendJson(res, 500, {
          success: false,
          message: "Cloudinary upload failed"
        });
      }
    });
  }

  // -----------------------------
  // STATIC FILES
  // -----------------------------
  if (req.method === "GET" && pathname === "/favicon.ico") {
    return serveFile(res, path.join(__dirname, "favicon.ico"));
  }

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
  // API: GET /cars
  // -----------------------------
  if (req.method === "GET" && pathname === "/cars") {
    try {
      const carsRaw = (await dbListCars()).filter((c) => !soldTooOld(c));

      const garageIds = carsRaw.map(c => c.garageId).filter(Boolean);
      const garages = await dbGetGaragesByIds(garageIds);

      const garageMap = new Map(garages.map(g => [g.id, g.name]));

      const cars = carsRaw.map(c => ({
        ...c,
        garageName: garageMap.get(c.garageId) || null,
      }));

      return sendJson(res, 200, cars);
    } catch (e) {
      console.error("GET /cars error:", e);
      return sendJson(res, 500, { success: false, message: "Database error" });
    }
  }

  // API: GET /car-data?id=
  if (req.method === "GET" && pathname === "/car-data") {
    const id = String(urlObj.searchParams.get("id") || "").trim();
    if (!id) return sendJson(res, 400, { success: false, message: "Missing id" });

    try {
      const car = await dbGetCarById(id);
      if (!car || soldTooOld(car)) {
        return sendJson(res, 404, { success: false, message: "Car not found" });
      }

      // If you have garageName already on car, you may not even need this:
      const garage = car.garageId ? await dbGetGarageById(car.garageId) : null;

      return sendJson(res, 200, { car, garage });
    } catch (e) {
      console.error("GET /car-data error:", e);
      return sendJson(res, 500, { success: false, message: "Database error" });
    }
  }

  // -----------------------------
  // (Optional/legacy) GET /garages-data from file
  // -----------------------------
  if (req.method === "GET" && pathname === "/garages-data") {
    try {
      const garages = await dbListGarages();
      return sendJson(res, 200, garages);
    } catch (e) {
      console.error("GET /garages-data error:", e);
      return sendJson(res, 200, readGaragesFile());
    }
  }

  // -----------------------------
  // Auth: GET /my-garage
  // -----------------------------
  if (req.method === "GET" && pathname === "/my-garage") {
    const auth = await getGarageFromAuth(req);

    if (!auth) {
      return sendJson(res, 401, {
        success: false,
        message: "Unauthorized"
      });
    }

    try {
      const garage = await dbGetGarageById(auth.garageId);

      if (!garage) {
        return sendJson(res, 404, {
          success: false,
          message: "Garage not found"
        });
      }

      return sendJson(res, 200, {
        success: true,
        garage
      });

    } catch (e) {
      console.error("GET /my-garage error:", e);

      return sendJson(res, 500, {
        success: false,
        message: "Database error"
      });
    }
  }

  // -----------------------------
  // Auth: PUT /my-garage
  // -----------------------------
  if (req.method === "PUT" && pathname === "/my-garage") {
    const auth = await getGarageFromAuth(req);

    if (!auth) {
      return sendJson(res, 401, {
        success: false,
        message: "Unauthorized"
      });
    }

    let data;

    try {
      const raw = await readBody(req);
      data = JSON.parse(raw || "{}");
    } catch {
      return sendJson(res, 400, {
        success: false,
        message: "Bad JSON"
      });
    }

    try {
      await dbUpdateGarage(auth.garageId, data);

      return sendJson(res, 200, {
        success: true
      });

    } catch (e) {
      console.error("PUT /my-garage error:", e);

      return sendJson(res, 500, {
        success: false,
        message: "Garage profile update failed"
      });
    }
  }

  // -----------------------------
  // Auth: GET /my-cars
  // -----------------------------
  if (req.method === "GET" && pathname === "/my-cars") {
    const auth = await getGarageFromAuth(req);

    if (!auth) {
      return sendJson(res, 401, {
        success: false,
        message: "Unauthorized"
      });
    }

    try {
      const cars = await dbListCars();

      const myCars = cars.filter(
        car => String(car.garageId) === String(auth.garageId)
      );

      return sendJson(res, 200, myCars);

    } catch (e) {
      console.error("GET /my-cars error:", e);

      return sendJson(res, 500, {
        success: false,
        message: "Database error"
      });
    }
  }

  // -----------------------------
  // Admin: GET /cars-admin
  // -----------------------------
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
  // API: POST /garage-apply
  // -----------------------------
  if (req.method === "POST" && pathname === "/garage-apply") {
    let data;

    try {
      const raw = await readBody(req);
      data = JSON.parse(raw || "{}");
    } catch {
      return sendJson(res, 400, {
        success: false,
        message: "Bad JSON"
      });
    }

    const garageName = String(data.garageName || "").trim();
    const contactName = String(data.contactName || "").trim();
    const email = String(data.email || "").trim().toLowerCase();
    const phone = String(data.phone || "").trim();
    const website = String(data.website || "").trim();
    const message = String(data.message || "").trim();
    const password = String(data.password || "").trim();

    if (!garageName || !email || !password) {
      return sendJson(res, 400, {
        success: false,
        message: "Garage name, email and password are required."
      });
    }

    if (password.length < 8) {
      return sendJson(res, 400, {
        success: false,
        message: "Password must be at least 8 characters."
      });
    }

    try {
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });

      if (authError) {
        console.error("Create auth user error:", authError);

        return sendJson(res, 400, {
          success: false,
          message: authError.message || "Could not create login account."
        });
      }

      const userId = authData?.user?.id;

      if (!userId) {
        return sendJson(res, 500, {
          success: false,
          message: "Login account was not created correctly."
        });
      }

      const { error } = await supabase
        .from("garage_applications")
        .insert({
          garage_name: garageName,
          contact_name: contactName || null,
          email,
          phone: phone || null,
          website: website || null,
          message: message || null,
          user_id: userId,
          status: "pending"
        });

      if (error) {
        console.error("Create garage application error:", error);
        throw error;
      }

      return sendJson(res, 200, {
        success: true
      });

    } catch (err) {
      console.error("POST /garage-apply:", err);

      return sendJson(res, 500, {
        success: false,
        message: "Could not save application."
      });
    }
  }

  // -----------------------------
  // Auth: POST /my-cars
  // -----------------------------
  if (req.method === "POST" && pathname === "/my-cars") {
    const auth = await getGarageFromAuth(req);

    if (!auth) {
      return sendJson(res, 401, {
        success: false,
        message: "Unauthorized"
      });
    }

    let data;

    try {
      const raw = await readBody(req);
      data = JSON.parse(raw || "{}");
    } catch {
      return sendJson(res, 400, {
        success: false,
        message: "Bad JSON"
      });
    }

    const name = String(data.name || "").trim();
    const year = Number(data.year);
    const price = Number(String(data.price).replace(/[£,\s.]/g, ""));
    data.price = price;
    const photos = Array.isArray(data.photos) ? data.photos.filter(Boolean) : [];

    if (!name) return sendJson(res, 400, { success: false, message: "Missing name" });
    if (!Number.isInteger(year)) return sendJson(res, 400, { success: false, message: "Year must be integer" });
    if (!Number.isFinite(price) || price <= 0) return sendJson(res, 400, { success: false, message: "Price must be > 0" });
    if (!photos.length) return sendJson(res, 400, { success: false, message: "At least 1 photo required" });

    data.garageId = auth.garageId;
    data.garage_id = auth.garageId;

    try {
      await dbInsertCar(data);
      return sendJson(res, 200, {
        success: true
      });
    } catch (e) {
      console.error("POST /my-cars error:", e);
      return sendJson(res, 500, {
        success: false,
        message: "Database insert failed"
      });
    }
  }

  // -----------------------------
  // Auth: PUT /my-cars
  // -----------------------------
  if (req.method === "PUT" && pathname === "/my-cars") {

    const auth = await getGarageFromAuth(req);

    if (!auth) {
      return sendJson(res, 401, {
        success: false,
        message: "Unauthorized"
      });
    }

    let data;

    try {
      const raw = await readBody(req);
      data = JSON.parse(raw || "{}");
    } catch {
      return sendJson(res, 400, {
        success: false,
        message: "Bad JSON"
      });
    }

    try {
      await dbUpdateCar(data);

      return sendJson(res, 200, {
        success: true
      });

    } catch (e) {
      console.error("PUT /my-cars error:", e);

      return sendJson(res, 500, {
        success: false,
        message: "Database update failed"
      });
    }

  }

  // -----------------------------
  // API: POST /cars
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
    const price = Number(String(data.price).replace(/[£,\s.]/g, ""));
    data.price = price;
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
  // Auth: DELETE /my-cars?name=
  // -----------------------------
  if (req.method === "DELETE" && pathname === "/my-cars") {
    const auth = await getGarageFromAuth(req);

    if (!auth) {
      return sendJson(res, 401, {
        success: false,
        message: "Unauthorized"
      });
    }

    const name = String(urlObj.searchParams.get("name") || "").trim();
    if (!name) return sendJson(res, 400, { success: false, message: "Missing name" });

    try {
      const car = await dbGetCarByName(name);

      if (!car) {
        return sendJson(res, 404, {
          success: false,
          message: "Car not found"
        });
      }

      if (String(car.garageId) !== String(auth.garageId)) {
        return sendJson(res, 403, {
          success: false,
          message: "Forbidden"
        });
      }

      const { error, count } = await supabase
        .from("cars")
        .delete({ count: "exact" })
        .eq("name", name)
        .eq("garage_id", auth.garageId);

      if (error) throw error;

      if (!count) {
        return sendJson(res, 404, {
          success: false,
          message: "Not found"
        });
      }

      return sendJson(res, 200, { success: true });

    } catch (e) {
      console.error("DELETE /my-cars error:", e);
      return sendJson(res, 500, {
        success: false,
        message: "Database delete failed"
      });
    }
  }

  // -----------------------------
  // API: POST /cars-sold?name=
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
  // API: POST /cars-status
  // -----------------------------
  if (req.method === "POST" && pathname === "/cars-status") {
    const auth = await getGarageFromAuth(req);

    if (!auth) {
      return sendJson(res, 401, {
        success: false,
        message: "Unauthorized"
      });
    }

    let data;
    try {
      const raw = await readBody(req);
      data = JSON.parse(raw || "{}");
    } catch {
      return sendJson(res, 400, { success: false, message: "Bad JSON" });
    }

    const name = String(data.name || "").trim();
    const status = String(data.status || "").trim().toLowerCase();

    if (!name) {
      return sendJson(res, 400, { success: false, message: "Missing name" });
    }

    if (!["available", "reserved", "sold"].includes(status)) {
      return sendJson(res, 400, { success: false, message: "Invalid status" });
    }

    try {
      const car = await dbGetCarByName(name);

      if (!car) {
        return sendJson(res, 404, {
          success: false,
          message: "Car not found"
        });
      }

      if (String(car.garageId) !== String(auth.garageId)) {
        return sendJson(res, 403, {
          success: false,
          message: "Forbidden"
        });
      }

      const update = {
        status,
        sold: status === "sold",
        soldDate: status === "sold" ? todayUK() : null,
        updatedAt: new Date().toISOString()
      };

      const { error } = await supabase
        .from("cars")
        .update(update)
        .eq("name", name)
        .eq("garage_id", auth.garageId);

      if (error) throw error;

      return sendJson(res, 200, {
        success: true,
        status,
        soldDate: update.soldDate
      });

    } catch (e) {
      console.error("POST /cars-status error:", e);
      return sendJson(res, 500, {
        success: false,
        message: "Database update failed"
      });
    }
  }

  // -----------------------------
  // Admin: GET /admin-garages-data
  // -----------------------------
  if (req.method === "GET" && pathname === "/admin-garages-data") {
    if (!isAdmin(req)) {
      return sendJson(res, 403, {
        success: false,
        message: "Forbidden"
      });
    }

    try {
      const { data: garages, error: garageError } = await supabase
        .from("garages")
        .select(`
          id,
          name,
          town,
          phone,
          email,
          website
        `)
        .order("name", { ascending: true });

      if (garageError) throw garageError;

      const { data: cars, error: carError } = await supabase
        .from("cars")
        .select("id, garage_id, status, sold");

      if (carError) throw carError;

      const counts = new Map();

      (cars || []).forEach((car) => {
        const garageId = car.garage_id;
        if (!garageId) return;

        if (!counts.has(garageId)) {
          counts.set(garageId, {
            total: 0,
            available: 0,
            reserved: 0,
            sold: 0
          });
        }

        const item = counts.get(garageId);
        const status = String(car.status || "available").toLowerCase();

        item.total += 1;

        if (status === "reserved") {
          item.reserved += 1;
        } else if (status === "sold" || car.sold === true) {
          item.sold += 1;
        } else {
          item.available += 1;
        }
      });

      const result = (garages || []).map((garage) => ({
        ...garage,
        counts: counts.get(garage.id) || {
          total: 0,
          available: 0,
          reserved: 0,
          sold: 0
        }
      }));

      return sendJson(res, 200, {
        success: true,
        garages: result
      });

    } catch (e) {
      console.error("GET /admin-garages-data error:", e);

      return sendJson(res, 500, {
        success: false,
        message: "Could not load garages."
      });
    }
  }

  // -----------------------------
  // Admin: GET /admin-cars-data?garageId=
  // -----------------------------
  if (req.method === "GET" && pathname === "/admin-cars-data") {
    if (!isAdmin(req)) {
      return sendJson(res, 403, {
        success: false,
        message: "Forbidden"
      });
    }

    const garageId = String(urlObj.searchParams.get("garageId") || "").trim();

    if (!garageId) {
      return sendJson(res, 400, {
        success: false,
        message: "Missing garageId"
      });
    }

    try {
      const garage = await dbGetGarageById(garageId);

      if (!garage) {
        return sendJson(res, 404, {
          success: false,
          message: "Garage not found"
        });
      }

      const cars = await dbListCars();

      const garageCars = cars.filter(
        car => String(car.garageId) === String(garageId)
      );

      return sendJson(res, 200, {
        success: true,
        garage,
        cars: garageCars
      });

    } catch (e) {
      console.error("GET /admin-cars-data error:", e);

      return sendJson(res, 500, {
        success: false,
        message: "Could not load garage cars."
      });
    }
  }

  // -----------------------------
  // Admin: POST /admin-cars-status
  // -----------------------------
  if (req.method === "POST" && pathname === "/admin-cars-status") {
    if (!isAdmin(req)) {
      return sendJson(res, 403, {
        success: false,
        message: "Forbidden"
      });
    }

    let data;

    try {
      const raw = await readBody(req);
      data = JSON.parse(raw || "{}");
    } catch {
      return sendJson(res, 400, {
        success: false,
        message: "Bad JSON"
      });
    }

    const id = String(data.id || "").trim();
    const status = String(data.status || "").trim().toLowerCase();

    if (!id) {
      return sendJson(res, 400, {
        success: false,
        message: "Missing car id"
      });
    }

    if (!["available", "reserved", "sold"].includes(status)) {
      return sendJson(res, 400, {
        success: false,
        message: "Invalid status"
      });
    }

    try {
      const update = {
        status,
        sold: status === "sold",
        soldDate: status === "sold" ? todayUK() : null,
        updatedAt: new Date().toISOString()
      };

      const { error } = await supabase
        .from("cars")
        .update(update)
        .eq("id", id);

      if (error) throw error;

      return sendJson(res, 200, {
        success: true,
        status,
        soldDate: update.soldDate
      });

    } catch (e) {
      console.error("POST /admin-cars-status error:", e);

      return sendJson(res, 500, {
        success: false,
        message: "Could not update car status."
      });
    }
  }

  // -----------------------------
  // Admin: PUT /admin-cars
  // -----------------------------
  if (req.method === "PUT" && pathname === "/admin-cars") {
    if (!isAdmin(req)) {
      return sendJson(res, 403, {
        success: false,
        message: "Forbidden"
      });
    }

    let data;

    try {
      const raw = await readBody(req);
      data = JSON.parse(raw || "{}");
    } catch {
      return sendJson(res, 400, {
        success: false,
        message: "Bad JSON"
      });
    }

    const id = String(data.id || "").trim();
    const name = String(data.name || "").trim();
    const year = Number(data.year);
    const price = Number(String(data.price).replace(/[£,\s.]/g, ""));
    const photos = Array.isArray(data.photos) ? data.photos.filter(Boolean) : [];

    if (!id) {
      return sendJson(res, 400, {
        success: false,
        message: "Missing car id"
      });
    }

    if (!name) {
      return sendJson(res, 400, {
        success: false,
        message: "Missing name"
      });
    }

    if (!Number.isInteger(year)) {
      return sendJson(res, 400, {
        success: false,
        message: "Year must be integer"
      });
    }

    if (!Number.isFinite(price) || price <= 0) {
      return sendJson(res, 400, {
        success: false,
        message: "Price must be > 0"
      });
    }

    if (!photos.length) {
      return sendJson(res, 400, {
        success: false,
        message: "At least 1 photo required"
      });
    }

    data.id = id;
    data.name = name;
    data.year = year;
    data.price = price;
    data.photos = photos;

    try {
      await dbUpdateCar(data);

      return sendJson(res, 200, {
        success: true
      });

    } catch (e) {
      console.error("PUT /admin-cars error:", e);

      return sendJson(res, 500, {
        success: false,
        message: "Could not update vehicle."
      });
    }
  }

  // -----------------------------
  // Admin: DELETE /admin-cars?id=
  // -----------------------------
  if (req.method === "DELETE" && pathname === "/admin-cars") {
    if (!isAdmin(req)) {
      return sendJson(res, 403, {
        success: false,
        message: "Forbidden"
      });
    }

    const id = String(urlObj.searchParams.get("id") || "").trim();

    if (!id) {
      return sendJson(res, 400, {
        success: false,
        message: "Missing car id"
      });
    }

    try {
      const { error, count } = await supabase
        .from("cars")
        .delete({ count: "exact" })
        .eq("id", id);

      if (error) throw error;

      if (!count) {
        return sendJson(res, 404, {
          success: false,
          message: "Car not found"
        });
      }

      return sendJson(res, 200, {
        success: true
      });

    } catch (e) {
      console.error("DELETE /admin-cars error:", e);

      return sendJson(res, 500, {
        success: false,
        message: "Could not delete car."
      });
    }
  }

  // -----------------------------
  // Admin: GET /garage-applications-data
  // -----------------------------
  if (req.method === "GET" && pathname === "/garage-applications-data") {
    if (!isAdmin(req)) {
      return sendJson(res, 403, {
        success: false,
        message: "Forbidden"
      });
    }

    try {
      const { data, error } = await supabase
        .from("garage_applications")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      return sendJson(res, 200, data || []);
    } catch (e) {
      console.error("POST /cars-status error:", e);
      return sendJson(res, 500, {
        success: false,
        message: "Database update failed"
      });
    }
  }

  // -----------------------------
  // Admin: POST /garage-applications-approve
  // -----------------------------
  if (req.method === "POST" && pathname === "/garage-applications-approve") {
    if (!isAdmin(req)) {
      return sendJson(res, 403, {
        success: false,
        message: "Forbidden"
      });
    }

    let data;

    try {
      const raw = await readBody(req);
      data = JSON.parse(raw || "{}");
    } catch {
      return sendJson(res, 400, {
        success: false,
        message: "Bad JSON"
      });
    }

    const applicationId = String(data.applicationId || "").trim();

    if (!applicationId) {
      return sendJson(res, 400, {
        success: false,
        message: "Missing application id."
      });
    }

    try {
      const { data: application, error: appError } = await supabase
        .from("garage_applications")
        .select("*")
        .eq("id", applicationId)
        .single();

      if (appError || !application) {
        return sendJson(res, 404, {
          success: false,
          message: "Application not found."
        });
      }

      if (!application.user_id) {
        return sendJson(res, 400, {
          success: false,
          message: "This application has no user_id, so it cannot be approved automatically."
        });
      }

      const { data: garage, error: garageError } = await supabase
        .from("garages")
        .insert({
          name: application.garage_name || "Unnamed garage",
          phone: application.phone || null,
          email: application.email || null,
          website: application.website || null,
          description: application.message || null
        })
        .select("id")
        .single();

      if (garageError || !garage) {
        console.error("Create garage error:", garageError);
        throw garageError;
      }

      const { error: linkError } = await supabase
        .from("garage_users")
        .insert({
          user_id: application.user_id,
          garage_id: garage.id,
          role: "owner",
          status: "active",
          subscription_status: "trial"
        });

      if (linkError) {
        console.error("Create garage user link error:", linkError);
        throw linkError;
      }

      const { error: updateError } = await supabase
        .from("garage_applications")
        .update({
          status: "approved"
        })
        .eq("id", applicationId);

      if (updateError) {
        console.error("Update application error:", updateError);
        throw updateError;
      }

      return sendJson(res, 200, {
        success: true,
        garageId: garage.id
      });

    } catch (e) {
      console.error("POST /garage-applications-approve error:", e);

      return sendJson(res, 500, {
        success: false,
        message: "Could not approve application."
      });
    }
  }

  // -----------------------------
  // Admin: POST /garage-applications-reject
  // -----------------------------
  if (req.method === "POST" && pathname === "/garage-applications-reject") {
    if (!isAdmin(req)) {
      return sendJson(res, 403, {
        success: false,
        message: "Forbidden"
      });
    }

    let data;

    try {
      const raw = await readBody(req);
      data = JSON.parse(raw || "{}");
    } catch {
      return sendJson(res, 400, {
        success: false,
        message: "Bad JSON"
      });
    }

    const applicationId = String(data.applicationId || "").trim();

    if (!applicationId) {
      return sendJson(res, 400, {
        success: false,
        message: "Missing application id."
      });
    }

    try {
      const { error } = await supabase
        .from("garage_applications")
        .update({
          status: "rejected"
        })
        .eq("id", applicationId);

      if (error) {
        console.error("Reject application error:", error);
        throw error;
      }

      return sendJson(res, 200, {
        success: true
      });

    } catch (e) {
      console.error("POST /garage-applications-reject error:", e);

      return sendJson(res, 500, {
        success: false,
        message: "Could not reject application."
      });
    }
  }

  // -----------------------------
  // PAGES
  // -----------------------------
  if (req.method === "GET" && pathname === "/header.html") {
    return serveFile(res, path.join(__dirname, "public", "header.html"));
  }
  if (req.method === "GET" && pathname === "/cookie-consent.js") {
    return serveFile(res, path.join(__dirname, "public", "cookie-consent.js"));
  }

  if (req.method === "GET" && pathname === "/") return serveFile(res, path.join(__dirname, "index.html"));
  if (req.method === "GET" && pathname === "/cars-page") return serveFile(res, path.join(__dirname, "cars.html"));
  if (req.method === "GET" && pathname === "/garages") return serveFile(res, path.join(__dirname, "garages-page.html"));
  if (req.method === "GET" && pathname === "/car") return serveFile(res, path.join(__dirname, "car.html"));
  if (req.method === "GET" && pathname === "/garages-page") return serveFile(res, path.join(__dirname, "garages-page.html"));
  if (req.method === "GET" && pathname === "/garage") return serveFile(res, path.join(__dirname, "garage.html"));
  if (req.method === "GET" && pathname === "/for-garages") return serveFile(res, path.join(__dirname, "for-garages.html"));
  if (req.method === "GET" && pathname === "/garage-dashboard") return serveFile(res, path.join(__dirname, "garage-dashboard.html"));
  if (req.method === "GET" && pathname === "/admin-dashboard") return serveFile(res, path.join(__dirname, "admin-dashboard.html"));
  if (req.method === "GET" && pathname === "/admin-garages") return serveFile(res, path.join(__dirname, "admin-garages.html"));
  if (req.method === "GET" && pathname === "/admin-stock") return serveFile(res, path.join(__dirname, "admin-stock.html"));
  if (req.method === "GET" && pathname === "/login") return serveFile(res, path.join(__dirname, "login.html"));
  if (req.method === "GET" && pathname === "/reset-password") return serveFile(res, path.join(__dirname, "reset-password.html"));
  if (req.method === "GET" && pathname === "/privacy") return serveFile(res, path.join(__dirname, "privacy.html"));
  if (req.method === "GET" && pathname === "/terms") return serveFile(res, path.join(__dirname, "terms.html"));
  if (req.method === "GET" && pathname === "/cookie-policy") return serveFile(res, path.join(__dirname, "cookie-policy.html"));

  if (req.method === "GET" && pathname === "/garage-applications") {
    return serveFile(res, path.join(__dirname, "garage-applications.html"));
  }

  // -----------------------------
  // 404
  // -----------------------------
  return fs.readFile(path.join(__dirname, "404.html"), (err, data) => {
    if (err) {
      return send(res, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not found");
    }

    return send(res, 404, { "Content-Type": "text/html; charset=utf-8" }, data);
  });

});

server.listen(PORT, () => {
  console.log("✅ Server running on port", PORT);
});