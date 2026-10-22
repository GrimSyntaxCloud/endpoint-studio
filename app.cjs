const crypto = require("node:crypto"),
  { promisify } = require("node:util");
const scrypt = promisify(crypto.scrypt);
const { base, finish, fail } = require("./lib/http.cjs"),
  { hash, token } = require("./lib/store.cjs");
const {
  resources,
  examples,
  samples,
  validate,
  player,
  invoice,
  keys,
  text,
} = require("./lib/domain.cjs");
const RETENTION = 96 * 3600000;
function createApp({ store, now = () => Date.now() }) {
  const app = base();
  app.get("/api/health", async (req, res) => {
    await store.count();
    res.json({ status: "ok", storage: "connected" });
  });
  app.get("/api/catalog", (req, res) =>
    res.json({ resources, examples, samples, retentionHours: 96 }),
  );
  app.post("/api/workspaces", async (req, res) => {
    await store.cleanup(now());
    if ((await store.count()) >= 150)
      fail(503, "The free demo is at capacity. Please return later.");
    const secret = token(),
      createdAt = new Date(now()),
      expiresAt = new Date(now() + RETENTION);
    await store.create({
      _id: hash(secret),
      revision: 0,
      createdAt,
      expiresAt,
      isDemo: false,
      records: Object.fromEntries(resources.map((k) => [k, []])),
      users: [],
      attempts: [],
    });
    res.status(201).json({ token: secret, createdAt, expiresAt });
  });
  async function workspace(req) {
    const bearer = req.get("Authorization")?.match(/^Bearer ([\w-]{43})$/)?.[1];
    if (!bearer) fail(401, "Start a private workspace first.");
    const w = await store.get(hash(bearer));
    if (!w || +new Date(w.expiresAt) <= now())
      fail(401, "This workspace has expired. Start a new one.");
    return w;
  }
  async function change(req, fn) {
    for (let i = 0; i < 3; i++) {
      const w = await workspace(req);
      const result = await fn(w);
      if (Buffer.byteLength(JSON.stringify(w)) > 120000)
        fail(413, "Workspace storage limit reached. Remove a record first.");
      if (await store.replace(w, w.revision)) return result;
    }
    fail(409, "Another request changed this workspace. Try again.");
  }
  app.get("/api/workspace", async (req, res) => {
    const w = await workspace(req);
    res.json({ expiresAt: w.expiresAt, records: w.records });
  });
  app.delete("/api/workspace", async (req, res) => {
    const w = await workspace(req);
    await store.remove(w._id);
    res.json({ deleted: true });
  });
  app.post("/api/signup", async (req, res) => {
    keys(req.body, ["userName", "password", "emailAddress"]);
    const userName = text(req.body.userName, "Username", 40),
      emailAddress = text(req.body.emailAddress, "Email", 100);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress))
      fail(400, "Use a valid fictional email address.");
    const password = text(req.body.password, "Password", 128);
    if (password.length < 12)
      fail(400, "Use at least 12 characters for the demo password.");
    const salt = crypto.randomBytes(16).toString("hex"),
      passwordHash = (await scrypt(password, salt, 64)).toString("hex");
    const user = {
      id: crypto.randomUUID(),
      userName,
      emailAddress,
      salt,
      passwordHash,
    };
    await change(req, (w) => {
      if (w.users.length >= 8) fail(400, "Maximum eight demo users.");
      if (
        w.users.some((u) => u.userName.toLowerCase() === userName.toLowerCase())
      )
        fail(409, "Username already exists in this workspace.");
      w.users.push(user);
    });
    res.status(201).json({ id: user.id, userName, emailAddress });
  });
  app.post("/api/login", async (req, res) => {
    keys(req.body, ["userName", "password"]);
    const name = text(req.body.userName, "Username", 40),
      password = text(req.body.password, "Password", 128);
    const result = await change(req, async (w) => {
      w.attempts = w.attempts.filter((t) => t > now() - 60000);
      if (w.attempts.length >= 5)
        fail(429, "Wait a minute before another login attempt.");
      w.attempts.push(now());
      const user = w.users.find(
        (u) => u.userName.toLowerCase() === name.toLowerCase(),
      );
      const candidate = await scrypt(
        password,
        user?.salt || "not-a-user-salt",
        64,
      );
      const valid =
        user &&
        crypto.timingSafeEqual(
          candidate,
          Buffer.from(user.passwordHash, "hex"),
        );
      return valid ? { authenticated: true, userName: user.userName } : null;
    });
    if (!result) fail(401, "The username or password did not match.");
    res.json(result);
  });
  app.get("/api/:kind", async (req, res) => {
    const kind = req.params.kind;
    if (!resources.includes(kind)) fail(404, "Unknown resource.");
    const w = await workspace(req);
    res.json({
      data: [...samples[kind], ...w.records[kind]],
      expiresAt: w.expiresAt,
    });
  });
  app.get("/api/:kind/:id", async (req, res) => {
    const { kind, id } = req.params;
    if (!resources.includes(kind)) fail(404, "Unknown resource.");
    const w = await workspace(req),
      record = [...samples[kind], ...w.records[kind]].find((r) => r.id === id);
    if (!record) fail(404, "Record not found.");
    res.json(record);
  });
  app.post("/api/:kind", async (req, res) => {
    const kind = req.params.kind,
      data = validate(kind, req.body),
      record = {
        ...data,
        id: crypto.randomUUID(),
        isDemo: false,
        createdAt: new Date(now()),
      };
    await change(req, (w) => {
      if (resources.reduce((n, k) => n + w.records[k].length, 0) >= 60)
        fail(400, "Maximum 60 visitor records.");
      if (
        kind === "customers" &&
        w.records[kind].some((r) => r.userName === record.userName)
      )
        fail(409, "Username already exists.");
      w.records[kind].push(record);
    });
    res.status(201).json(record);
  });
  app.put("/api/:kind/:id", async (req, res) => {
    const { kind, id } = req.params;
    const data = validate(kind, req.body);
    if (id.startsWith("sample-"))
      fail(403, "Permanent samples are read-only. Create your own record.");
    const result = await change(req, (w) => {
      const row = w.records[kind].find((r) => r.id === id);
      if (!row) fail(404, "Record not found.");
      if (kind === "customers") delete data.invoices;
      Object.assign(row, data);
      return row;
    });
    res.json(result);
  });
  app.delete("/api/:kind/:id", async (req, res) => {
    const { kind, id } = req.params;
    if (!resources.includes(kind)) fail(404, "Unknown resource.");
    if (id.startsWith("sample-")) fail(403, "Permanent samples are read-only.");
    await change(req, (w) => {
      const i = w.records[kind].findIndex((r) => r.id === id);
      if (i < 0) fail(404, "Record not found.");
      w.records[kind].splice(i, 1);
    });
    res.json({ deleted: true });
  });
  app.get("/api/teams/:id/players", async (req, res) => {
    const w = await workspace(req),
      r = [...samples.teams, ...w.records.teams].find(
        (t) => t.id === req.params.id,
      );
    if (!r) fail(404, "Team not found.");
    res.json(r.players);
  });
  app.post("/api/teams/:id/players", async (req, res) => {
    const data = player(req.body);
    const result = await change(req, (w) => {
      const team = w.records.teams.find((t) => t.id === req.params.id);
      if (!team) fail(404, "Create a visitor team first.");
      if (team.players.length >= 12) fail(400, "Maximum twelve players.");
      team.players.push({ ...data, id: crypto.randomUUID() });
      return team.players;
    });
    res.status(201).json(result);
  });
  app.get("/api/customers/:username/invoices", async (req, res) => {
    const w = await workspace(req),
      r = w.records.customers.find((c) => c.userName === req.params.username);
    if (!r) fail(404, "Customer not found.");
    res.json(r.invoices);
  });
  app.post("/api/customers/:username/invoices", async (req, res) => {
    const data = {
      ...invoice(req.body),
      id: crypto.randomUUID(),
      dateCreated: new Date(now()),
    };
    const result = await change(req, (w) => {
      const c = w.records.customers.find(
        (v) => v.userName === req.params.username,
      );
      if (!c) fail(404, "Customer not found.");
      if (c.invoices.length >= 10)
        fail(400, "Maximum ten invoices per customer.");
      c.invoices.push(data);
      return data;
    });
    res.status(201).json(result);
  });
  return finish(app);
}
module.exports = { createApp, RETENTION };
