const $ = (s) => document.querySelector(s);
let resource = "composers",
  catalog,
  session = "",
  expiresAt,
  returnedId = "",
  sequence = 0,
  busy = false,
  motion = !matchMedia("(prefers-reduced-motion: reduce)").matches;
try {
  session = sessionStorage.getItem("endpoint.workspace") || "";
} catch {}
const svgNS = "http://www.w3.org/2000/svg";
for (let i = 0; i < 30; i++) {
  const e = document.createElementNS(svgNS, "ellipse");
  e.setAttribute("cx", "200");
  e.setAttribute("cy", "200");
  e.setAttribute("rx", "150");
  e.setAttribute("ry", "65");
  e.setAttribute("fill", "none");
  e.setAttribute("stroke", "#657a4d");
  e.setAttribute("stroke-width", ".65");
  e.setAttribute("transform", `rotate(${i * 6} 200 200)`);
  $("#spiro").append(e);
}
function setSession(value) {
  session = value;
  try {
    if (value) sessionStorage.setItem("endpoint.workspace", value);
    else sessionStorage.removeItem("endpoint.workspace");
  } catch {
    $("#workspace-status").textContent =
      "Storage is unavailable: keep this tab open to retain your workspace.";
  }
  $("#send").disabled = !value;
  $("#workspace").textContent = value
    ? "Workspace active ✓"
    : "Start private workspace ↗";
  $("#workspace").disabled = !!value;
  $("#delete-workspace").hidden = !value;
}
async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(session ? { "X-Demo-Authorization": `Bearer ${session}` } : {}),
    },
  });
  const data = await response.json();
  return { response, data };
}
function presets() {
  const options =
    resource === "users"
      ? [
          ["signup", "Create demo user"],
          ["login", "Verify demo password"],
        ]
      : [
          ["list", "List records"],
          ["create", "Create a record"],
          ["get", "Read one record"],
          ["update", "Update a record"],
          ["delete", "Delete a record"],
        ];
  if (resource === "teams")
    options.push(
      ["players", "List team players"],
      ["add-player", "Add a team player"],
    );
  if (resource === "customers")
    options.push(
      ["invoices", "List customer invoices"],
      ["add-invoice", "Create customer invoice"],
    );
  $("#scenario").replaceChildren(
    ...options.map(([value, label]) => {
      const o = document.createElement("option");
      o.value = value;
      o.textContent = label;
      return o;
    }),
  );
  prepare();
}
function prepare() {
  const action = $("#scenario").value;
  let method = "GET",
    path = "/api/" + resource,
    body = catalog?.examples[resource] || {};
  if (
    ["create", "signup", "login", "add-player", "add-invoice"].includes(action)
  )
    method = "POST";
  if (action === "update") method = "PUT";
  if (action === "delete") method = "DELETE";
  if (["get", "update", "delete"].includes(action))
    path += "/" + (returnedId || "REPLACE_WITH_RECORD_ID");
  if (action === "signup" || action === "login") {
    path = "/api/" + action;
    body = {
      userName: "demo-visitor",
      password: "fictional-demo-pass-2026",
      ...(action === "signup" ? { emailAddress: "visitor@example.test" } : {}),
    };
  }
  if (action === "players" || action === "add-player") {
    path = "/api/teams/" + (returnedId || "REPLACE_WITH_TEAM_ID") + "/players";
    body = { firstName: "Jamie", lastName: "Morgan", salary: 48000 };
  }
  if (action === "invoices" || action === "add-invoice") {
    path = "/api/customers/taylor-demo/invoices";
    body = {
      tax: 1.5,
      lineItems: [{ name: "Desk plant", price: 15, quantity: 1 }],
    };
  }
  $("#method").value = method;
  $("#path").value = path;
  $("#payload").value = JSON.stringify(body, null, 2);
  $("#request-note").textContent = [
    "get",
    "update",
    "delete",
    "players",
    "add-player",
  ].includes(action)
    ? "Create a visitor record, then use its returned ID. Samples are read-only."
    : "Only requests to this demo’s own API are permitted.";
}
function resources() {
  const names = ["composers", "persons", "teams", "customers", "users"];
  $("#resource-buttons").replaceChildren(
    ...names.map((name, i) => {
      const b = document.createElement("button");
      b.textContent = `0${i + 1} ${name}`;
      b.setAttribute("aria-pressed", resource === name);
      b.onclick = () => {
        resource = name;
        returnedId = "";
        $("#use-id").hidden = true;
        resources();
        presets();
      };
      return b;
    }),
  );
}
$("#workspace").onclick = async () => {
  if (busy) return;
  busy = true;
  $("#workspace").disabled = true;
  try {
    const { response, data } = await api("/api/workspaces", {
      method: "POST",
      body: "{}",
    });
    if (!response.ok) throw Error(data.error);
    expiresAt = data.expiresAt;
    setSession(data.token);
    $("#workspace-status").textContent =
      "Private workspace · expires " +
      new Date(expiresAt).toLocaleString() +
      ". Edits do not renew it.";
  } catch (e) {
    $("#workspace-status").textContent = e.message;
    $("#workspace").disabled = false;
  } finally {
    busy = false;
  }
};
$("#delete-workspace").onclick = async () => {
  if (
    !confirm("Permanently delete your demo workspace and its visitor records?")
  )
    return;
  try {
    const { response, data } = await api("/api/workspace", {
      method: "DELETE",
    });
    if (!response.ok && response.status !== 401) throw Error(data.error);
    setSession("");
    $("#workspace-status").textContent =
      "Workspace deleted. Permanent samples are unchanged.";
    $("#response").textContent = "// Your workspace has been cleared.";
  } catch (e) {
    $("#feedback").textContent = e.message;
  }
};
$("#scenario").onchange = prepare;
$("#use-id").onclick = () => {
  $("#scenario").value = "get";
  prepare();
};
$("#send").onclick = async () => {
  if (busy || !session) return;
  const path = $("#path").value.trim(),
    method = $("#method").value;
  if (
    !/^\/api\/(composers|persons|teams|customers|signup|login)(\/[A-Za-z0-9_-]+){0,2}$/.test(
      path,
    )
  ) {
    $("#feedback").textContent =
      "Choose a supported path inside this demo’s API.";
    return;
  }
  let body;
  try {
    if (["POST", "PUT"].includes(method))
      body = JSON.stringify(JSON.parse($("#payload").value));
  } catch {
    $("#feedback").textContent =
      "The payload is not valid JSON. Check commas and quotation marks.";
    return;
  }
  busy = true;
  $("#send").disabled = true;
  $("#send").textContent = "In flight…";
  $("#feedback").textContent = "";
  const start = performance.now();
  try {
    const { response, data } = await api(path, { method, body });
    sequence++;
    $("#request-number").textContent = String(sequence).padStart(3, "0");
    $("#response").textContent = JSON.stringify(data, null, 2);
    $("#status-code").textContent = response.status;
    $("#duration").textContent =
      Math.round(performance.now() - start) + " MS / " + response.statusText;
    $("#response-size").textContent =
      new TextEncoder().encode($("#response").textContent).length + " BYTES";
    $("#response-indicator").className =
      "response-indicator " + (response.ok ? "ok" : "error");
    $("#feedback").textContent = response.ok
      ? "Response received."
      : data.error || "The request could not be completed.";
    if (data.id && method === "POST") {
      returnedId = data.id;
      $("#use-id").hidden = resource === "users";
    }
    if (response.status === 401 && data.error?.includes("workspace")) {
      setSession("");
      $("#workspace-status").textContent =
        "Your workspace has expired. Start a fresh one.";
    }
    if (motion) {
      $("#status-code").animate(
        [
          { transform: "perspective(300px) rotateX(-80deg)", opacity: 0.2 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 400, easing: "cubic-bezier(.2,1.3,.4,1)" },
      );
      $("#orbit").animate(
        [
          { transform: "scale(.95)" },
          { transform: "scale(1.04)" },
          { transform: "scale(1)" },
        ],
        { duration: 600 },
      );
    }
  } catch {
    $("#feedback").textContent =
      "No response. Check your connection and try again.";
  } finally {
    busy = false;
    $("#send").disabled = !session;
    $("#send").textContent = "Send request ↗";
  }
};
$("#copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText($("#response").textContent);
    $("#feedback").textContent = "Response copied.";
  } catch {
    $("#feedback").textContent =
      "Clipboard unavailable. Select and copy the response text.";
  }
};
$("#motion").onclick = () => {
  motion = !motion;
  document.body.classList.toggle("paused", !motion);
  $("#motion").setAttribute("aria-pressed", !motion);
  $("#motion").textContent = motion ? "Motion on" : "Motion paused";
};
if (!motion) {
  document.body.classList.add("paused");
  $("#motion").textContent = "Motion paused";
  $("#motion").setAttribute("aria-pressed", "true");
}
async function init() {
  try {
    const { response, data } = await api("/api/catalog");
    if (!response.ok) throw Error();
    catalog = data;
    resources();
    presets();
    $("#health").textContent = "READY";
    if (session) {
      const { response, data } = await api("/api/workspace");
      if (response.ok) {
        setSession(session);
        expiresAt = data.expiresAt;
        $("#workspace-status").textContent =
          "Private workspace · expires " + new Date(expiresAt).toLocaleString();
      } else setSession("");
    }
  } catch {
    $("#health").textContent = "OFFLINE";
    $("#workspace-status").textContent =
      "The API is temporarily unavailable. Please refresh in a moment.";
  }
}
init();
