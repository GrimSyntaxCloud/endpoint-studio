const test = require("node:test"),
  assert = require("node:assert/strict"),
  request = require("supertest");
const { createApp, RETENTION } = require("../app.cjs"),
  { MemoryStore } = require("../lib/store.cjs");
function setup() {
  const store = new MemoryStore();
  let time = Date.UTC(2026, 9, 22);
  const app = createApp({ store, now: () => time });
  const agent = request(app);
  return { store, agent, advance: (n) => (time += n) };
}
async function workspace(agent) {
  const r = await agent.post("/api/workspaces").send({}).expect(201);
  return {
    token: r.body.token,
    expires: r.body.expiresAt,
    auth: { "X-Demo-Authorization": "Bearer " + r.body.token },
  };
}
test("workspaces isolate records and expire at a fixed 96-hour boundary", async () => {
  const { agent, advance } = setup(),
    a = await workspace(agent),
    b = await workspace(agent);
  const r = await agent
    .post("/api/composers")
    .set(a.auth)
    .send({ firstName: "Mira", lastName: "Solis" })
    .expect(201);
  await agent
    .get("/api/composers/" + r.body.id)
    .set(b.auth)
    .expect(404);
  advance(RETENTION - 1);
  await agent
    .put("/api/composers/" + r.body.id)
    .set(a.auth)
    .send({ firstName: "Mira", lastName: "Reed" })
    .expect(200);
  assert.equal(
    (await agent.get("/api/workspace").set(a.auth)).body.expiresAt,
    a.expires,
  );
  advance(1);
  await agent.get("/api/composers").set(a.auth).expect(401);
});
test("samples survive cleanup; forged metadata and query operators are rejected", async () => {
  const { agent, store, advance } = setup(),
    a = await workspace(agent);
  await agent.delete("/api/composers/sample-1").set(a.auth).expect(403);
  await agent
    .post("/api/composers")
    .set(a.auth)
    .send({ firstName: { $ne: null }, lastName: "Solis" })
    .expect(400);
  await agent
    .post("/api/composers")
    .set(a.auth)
    .send({ firstName: "Mira", lastName: "Solis", isDemo: true })
    .expect(400);
  await agent
    .post("/api/persons")
    .set(a.auth)
    .send({ firstName: "A", lastName: "B", birthDate: "2026-02-30" })
    .expect(400);
  advance(RETENTION);
  assert.equal(await store.cleanup(Date.UTC(2026, 9, 22) + RETENTION), 1);
  const catalog = await agent.get("/api/catalog").expect(200);
  assert.equal(catalog.body.samples.composers[0].isDemo, true);
});
test("teams retain players, invoices compute server totals, and customer edits preserve invoices", async () => {
  const { agent } = setup(),
    a = await workspace(agent);
  const team = (
    await agent
      .post("/api/teams")
      .set(a.auth)
      .send({ name: "Owls", mascot: "Owl" })
      .expect(201)
  ).body;
  await agent
    .post(`/api/teams/${team.id}/players`)
    .set(a.auth)
    .send({ firstName: "Alex", lastName: "Reed", salary: 100.1 })
    .expect(201);
  assert.equal(
    (await agent.get(`/api/teams/${team.id}/players`).set(a.auth)).body.length,
    1,
  );
  const c = (
    await agent
      .post("/api/customers")
      .set(a.auth)
      .send({ firstName: "A", lastName: "B", userName: "demo" })
      .expect(201)
  ).body;
  const invoice = (
    await agent
      .post("/api/customers/demo/invoices")
      .set(a.auth)
      .send({
        tax: 1.2,
        lineItems: [{ name: "Widget", price: 12.35, quantity: 2 }],
      })
      .expect(201)
  ).body;
  assert.equal(invoice.subtotal, 24.7);
  await agent
    .post("/api/customers/demo/invoices")
    .set(a.auth)
    .send({ subtotal: 0, tax: 0, lineItems: [] })
    .expect(400);
  await agent
    .put("/api/customers/" + c.id)
    .set(a.auth)
    .send({ firstName: "C", lastName: "D", userName: "demo" })
    .expect(200);
  assert.equal(
    (await agent.get("/api/customers/demo/invoices").set(a.auth)).body.length,
    1,
  );
  const second = (
    await agent
      .post("/api/customers")
      .set(a.auth)
      .send({ firstName: "E", lastName: "F", userName: "second" })
      .expect(201)
  ).body;
  await agent
    .put("/api/customers/" + second.id)
    .set(a.auth)
    .send({ firstName: "E", lastName: "F", userName: "demo" })
    .expect(409);
  assert.equal(
    (await agent.get("/api/customers/" + second.id).set(a.auth)).body.userName,
    "second",
  );
});
test("signup hashes the submitted password, rejects duplicates, and throttles failed logins", async () => {
  const { agent, store } = setup(),
    a = await workspace(agent);
  const user = {
    userName: "demo",
    emailAddress: "demo@example.test",
    password: "a-real-demo-password",
  };
  const signup = await agent
    .post("/api/signup")
    .set(a.auth)
    .send(user)
    .expect(201);
  assert.equal(signup.body.passwordHash, undefined);
  await agent.post("/api/signup").set(a.auth).send(user).expect(409);
  await agent
    .post("/api/login")
    .set(a.auth)
    .send({ userName: "demo", password: user.password })
    .expect(200);
  await agent
    .post("/api/login")
    .set(a.auth)
    .send({ userName: "demo", password: "user1password" })
    .expect(401);
  for (let i = 0; i < 3; i++)
    await agent
      .post("/api/login")
      .set(a.auth)
      .send({ userName: "demo", password: "wrong" })
      .expect(401);
  await agent
    .post("/api/login")
    .set(a.auth)
    .send({ userName: "demo", password: "wrong" })
    .expect(429);
  const saved = [...store.docs.values()][0].users[0];
  assert.ok(saved.salt && saved.passwordHash);
  assert.ok(!JSON.stringify(saved).includes(user.password));
});
test("malformed JSON, missing access and unknown endpoints fail safely", async () => {
  const { agent } = setup();
  await agent.get("/api/composers").expect(401);
  await agent
    .post("/api/composers")
    .set("Content-Type", "application/json")
    .send("{")
    .expect(400);
  const r = await agent.get("/api/no-such-route").expect(404);
  assert.ok(!JSON.stringify(r.body).includes("stack"));
});
