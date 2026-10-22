const { fail, text } = require("./http.cjs");
const resources = ["composers", "persons", "teams", "customers"];
const examples = {
  composers: { firstName: "Mira", lastName: "Solis" },
  persons: {
    firstName: "Alex",
    lastName: "Rivera",
    birthDate: "1994-05-12",
    roles: [{ text: "Developer" }],
    dependents: [],
  },
  teams: { name: "Moonlight Owls", mascot: "Owl", players: [] },
  customers: { firstName: "Taylor", lastName: "Reed", userName: "taylor-demo" },
};
const samples = Object.fromEntries(
  resources.map((kind, i) => [
    kind,
    [
      {
        ...structuredClone(examples[kind]),
        id: "sample-" + (i + 1),
        isDemo: true,
        ...(kind === "customers" ? { invoices: [] } : {}),
      },
    ],
  ]),
);
function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(400, "A JSON object is required.");
  return value;
}
function keys(body, allowed) {
  object(body);
  if (Object.keys(body).some((k) => !allowed.includes(k)))
    fail(400, "Unknown or server-controlled field.");
}
function list(value, mapper, max = 12) {
  if (!Array.isArray(value) || value.length > max)
    fail(400, `Use an array of at most ${max} entries.`);
  return value.map(mapper);
}
function money(v) {
  if (
    typeof v !== "number" ||
    !Number.isFinite(v) ||
    v < 0 ||
    v > 1e7 ||
    Math.abs(v * 100 - Math.round(v * 100)) > 1e-6
  )
    fail(400, "Use a non-negative amount with at most two decimal places.");
  return v;
}
function date(v) {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    !Number.isFinite(Date.parse(v)) ||
    new Date(v).toISOString().slice(0, 10) !== v
  )
    fail(400, "Use a real date in YYYY-MM-DD format.");
  return v;
}
function person(b) {
  keys(b, ["firstName", "lastName"]);
  return {
    firstName: text(b.firstName, "First name", 50),
    lastName: text(b.lastName, "Last name", 50),
  };
}
function player(b) {
  keys(b, ["firstName", "lastName", "salary"]);
  return {
    ...person({ firstName: b.firstName, lastName: b.lastName }),
    salary: money(b.salary),
  };
}
function invoice(b) {
  keys(b, ["tax", "dateShipped", "lineItems"]);
  const lineItems = list(
    b.lineItems,
    (v) => {
      keys(v, ["name", "price", "quantity"]);
      if (!Number.isInteger(v.quantity) || v.quantity < 1 || v.quantity > 100)
        fail(400, "Quantity must be 1–100.");
      return {
        name: text(v.name, "Item name"),
        price: money(v.price),
        quantity: v.quantity,
      };
    },
    20,
  );
  if (!lineItems.length) fail(400, "Add an invoice line.");
  const subtotal =
    lineItems.reduce(
      (sum, v) => sum + Math.round(v.price * 100) * v.quantity,
      0,
    ) / 100;
  return {
    lineItems,
    subtotal,
    tax: money(b.tax ?? 0),
    dateShipped: b.dateShipped ? date(b.dateShipped) : null,
  };
}
function validate(kind, b) {
  if (kind === "composers") return person(b);
  if (kind === "persons") {
    keys(b, ["firstName", "lastName", "birthDate", "roles", "dependents"]);
    return {
      ...person({ firstName: b.firstName, lastName: b.lastName }),
      birthDate: date(b.birthDate),
      roles: list(b.roles ?? [], (v) => {
        keys(v, ["text"]);
        return { text: text(v.text, "Role", 50) };
      }),
      dependents: list(b.dependents ?? [], person),
    };
  }
  if (kind === "teams") {
    keys(b, ["name", "mascot", "players"]);
    return {
      name: text(b.name, "Team name"),
      mascot: text(b.mascot, "Mascot", 50),
      players: list(b.players ?? [], player),
    };
  }
  if (kind === "customers") {
    keys(b, ["firstName", "lastName", "userName"]);
    return {
      ...person({ firstName: b.firstName, lastName: b.lastName }),
      userName: text(b.userName, "Username", 40),
      invoices: [],
    };
  }
  fail(404, "Unknown resource.");
}
module.exports = {
  resources,
  examples,
  samples,
  validate,
  player,
  invoice,
  keys,
  text,
};
