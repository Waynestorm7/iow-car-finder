
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("server.js", "utf8");

const start = source.indexOf("function getAdminClientIp(req) {");
const end = source.indexOf("async function getGarageFromAuth(req)", start);

assert(start >= 0 && end > start, "Admin functions not found");

const fakeKey = "TEST-ONLY-" + "A".repeat(45);
const attempts = new Map();

const test = {
  require,
  ADMIN_KEY: fakeKey,
  adminFailedAttempts: attempts,
  ADMIN_FAILURE_LIMIT: 10,
  ADMIN_FAILURE_WINDOW_MS: 15 * 60 * 1000
};

vm.createContext(test);
vm.runInContext(source.slice(start, end), test);

function request(key, ip = "127.0.0.1") {
  return {
    headers: { "x-garage-key": key },
    socket: { remoteAddress: ip }
  };
}

assert.equal(test.isAdmin(request(fakeKey)), true);

for (let i = 0; i < 10; i++) {
  assert.equal(test.isAdmin(request("wrong-key")), false);
}

assert.equal(test.isAdmin(request(fakeKey)), false);
assert.equal(test.isAdmin(request(fakeKey, "127.0.0.2")), true);

attempts.get("127.0.0.1").resetAt = Date.now() - 1;

assert.equal(test.isAdmin(request(fakeKey)), true);

console.log("PASS: Admin rate-limit tests completed.");
