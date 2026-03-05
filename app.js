// -----------------------------
// CONFIG
// -----------------------------
// ✅ Paste your Cloudflare Worker URL here:
const AI_ENDPOINT = "https://p44-ai-gateway.vercel.app/api/analyze-ticket";

// -----------------------------
// Mock Tickets (generic dataset)
// -----------------------------
const TICKETS = {
  user_creation: {
    id: "2601123",
    subject: "Request: Create new STS user for onboarding",
    requester: { name: "Fahd", email: "fahd@customer.com", org: "CustomerCo" },
    createdAtUtc: "2026-02-27T09:10:00Z",
    events: [
      { ts: "2026-02-27T09:10:00Z", by: "Requester", text: "Please create a new STS user for Priya Nair (priya.nair@customer.com). Role: Admin. Region: APAC. Manager: Rohan. Cost center: APAC-109." },
      { ts: "2026-02-27T09:11:10Z", by: "Automation", text: "Thanks for contacting support. An agent will respond soon." }
    ],
    classification: { category: "User Assistance", intent: "User Creation", sentiment: "Neutral", priority: "Medium" }
  },

  howto: {
    id: "2600871",
    subject: "How do I export shipment data for last month?",
    requester: { name: "Isaac", email: "isaac@customer.com", org: "FedEx" },
    createdAtUtc: "2026-02-25T12:02:00Z",
    events: [
      { ts: "2026-02-25T12:02:00Z", by: "Requester", text: "I need to export shipment data for last month. Where do I do it in the UI?" }
    ],
    classification: { category: "User Assistance", intent: "How-To Assistance", sentiment: "Positive", priority: "Low" }
  },

  bug: {
    id: "2600659",
    subject: "Ocean Visibility page loads blank for some users",
    requester: { name: "Mel", email: "mel@customer.com", org: "ShipperX" },
    createdAtUtc: "2026-02-23T16:30:00Z",
    events: [
      { ts: "2026-02-23T16:30:00Z", by: "Requester", text: "Ocean Visibility page loads blank. Started today. Browser: Chrome." },
      { ts: "2026-02-23T16:35:40Z", by: "Agent", text: "Can you share HAR file + console logs?" }
    ],
    classification: { category: "Incident", intent: "Bug Report", sentiment: "Neutral", priority: "High" }
  },

  access: {
    id: "2518307",
    subject: "Permissions request: enable feature access",
    requester: { name: "Isaac Dominguez Ortiz", email: "isaac.dominguez.ortiz@fedex.com", org: "FedEx" },
    createdAtUtc: "2025-06-20T07:34:03Z",
    events: [
      { ts: "2025-06-20T07:34:03Z", by: "Requester", text: "Please enable feature access for eric.lazell@fedex.com." },
      { ts: "2025-06-20T07:34:12Z", by: "Automation", text: "Thanks for contacting support. An agent will respond soon." }
    ],
    classification: { category: "User Assistance", intent: "Access/Permissions", sentiment: "Neutral", priority: "Low" }
  }
};

// Mock Jira links per ticket
const JIRA_BY_TICKET = {
  user_creation: [
    { key: "P44-21001", status: "To Do", assignee: "Access Ops", updated: "2026-02-27T09:14:00Z", note: "Admin role approvals required." }
  ],
  howto: [],
  bug: [
    { key: "P44-20911", status: "In Progress", assignee: "Ocean Team", updated: "2026-02-23T18:05:00Z", note: "Investigating blank page regression." }
  ],
  access: [
    { key: "P44-19321", status: "Done", assignee: "Ops Enablement", updated: "2025-06-20T08:40:10Z", note: "Permissions updated." }
  ]
};

// Mock KB entries
const KB = [
  { title: "User creation workflow (STS)", source: "internal", snippet: "Required fields, validations, approvals, and audit logging for creating STS users.", url: "https://www.project44.com/help-center/", tags: ["sts", "user_creation", "approvals"] },
  { title: "Export shipment data from UI", source: "helpcenter", snippet: "Steps to export shipments from filters and download CSV.", url: "https://www.project44.com/help-center/", tags: ["export", "shipments", "csv"] },
  { title: "Troubleshooting blank page issues", source: "internal", snippet: "Collect HAR + console logs, check feature flags, confirm permissions and org mapping.", url: "https://www.project44.com/help-center/", tags: ["troubleshooting", "har", "browser"] },
  { title: "Authentication and access control overview", source: "helpcenter", snippet: "How authentication impacts access to product features and what to check first.", url: "https://www.project44.com/help-center/", tags: ["authentication", "access_control"] }
];

// Mock side conversations per ticket
const SIDE_CONVO_BY_TICKET = {
  user_creation: [
    { ts: "2026-02-27T09:15:00Z", by: "Agent", text: "Need to confirm admin approval path for CustomerCo." },
    { ts: "2026-02-27T09:18:00Z", by: "Access Ops", text: "Admin role requires manager approval. Collect manager email." }
  ],
  howto: [
    { ts: "2026-02-25T12:05:00Z", by: "Agent", text: "Point user to export documentation + confirm permission to export." }
  ],
  bug: [
    { ts: "2026-02-23T17:10:00Z", by: "Ocean Team", text: "Looks like a recent release; check feature flag + console errors." }
  ],
  access: [
    { ts: "2025-06-20T08:21:18Z", by: "Access Team", text: "Add permission set; re-login required." }
  ]
};

// -----------------------------
// Helpers
// -----------------------------
const $ = (id) => document.getElementById(id);

function isoNow() { return new Date().toISOString(); }
function fmt(ts) { return new Date(ts).toLocaleString(); }
function rid() { return `REQ-${Math.random().toString(16).slice(2, 10).toUpperCase()}`; }
function safeLower(s) { return (s || "").toLowerCase(); }

function escapeHtml(str) {
  return String(str)
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2200);
}

// -----------------------------
// Observe Logs
// -----------------------------
let LOGS = [];
let ACTIVE_KEY = "user_creation";
let ACTIVE = TICKETS[ACTIVE_KEY];

// Store latest AI outputs so buttons can use them
let AI_CACHE = {
  opening_message: null,
  closure_message: null
};

function logEvent({ level="INFO", type="AI", message="", meta={} }) {
  LOGS.push({
    ts: isoNow(),
    level,
    type,
    ticketId: ACTIVE.id,
    actor: "agent@nayana (demo)",
    message,
    meta
  });
  renderLogs();
}

function renderLogs() {
  const filter = $("logFilter").value;
  const el = $("logs");
  const list = (filter === "ALL") ? LOGS : LOGS.filter(x => x.type === filter);

  if (!list.length) {
    el.innerHTML = `<div class="muted" style="padding:12px;">No logs yet. Use Refresh / Generate actions.</div>`;
    return;
  }

  el.innerHTML = list.slice().reverse().map(l => `
    <div class="logRow">
      <div class="logMeta">${escapeHtml(fmt(l.ts))}</div>
      <div><span class="logType ${escapeHtml(l.type)}">${escapeHtml(l.type)}</span></div>
      <div class="logMsg">
        ${escapeHtml(l.message)}
        ${l.meta && Object.keys(l.meta).length ? `<div class="muted small" style="margin-top:6px;">${escapeHtml(JSON.stringify(l.meta))}</div>` : ""}
      </div>
    </div>
  `).join("");
}

function exportLogs() {
  const blob = new Blob([JSON.stringify(LOGS, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `observe-logs-${ACTIVE.id}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  logEvent({ type: "ACTION", message: "Exported observe logs", meta: { count: LOGS.length } });
}

// -----------------------------
// Rail Navigation
// -----------------------------
document.querySelectorAll(".railItem").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".railItem").forEach(x => x.classList.remove("railItem--active"));
    btn.classList.add("railItem--active");

    const name = btn.dataset.tab;
    document.querySelectorAll(".tabPanel").forEach(p => p.classList.remove("tabPanel--active"));
    $(`tab-${name}`).classList.add("tabPanel--active");

    logEvent({ type: "AI", message: `Switched view: ${name}` });
  });
});

// -----------------------------
// Rendering blocks
// -----------------------------
function setChips(category, intent, sentiment, priority) {
  $("chipCategory").textContent = `Category: ${category}`;
  $("chipIntent").textContent = `Intent: ${intent}`;
  $("chipSentiment").textContent = `Sentiment: ${sentiment}`;
  $("chipPriority").textContent = `Priority: ${priority}`;
}

function renderTicketSummaryEmpty() {
  $("ticketSummary").innerHTML = `<div class="muted">Click <b>Generate Summary</b> or <b>Refresh</b> to populate summary for the selected ticket.</div>`;
  setChips("—","—","—","—");
}

function renderJira() {
  const links = JIRA_BY_TICKET[ACTIVE_KEY] || [];
  $("jiraLinks").innerHTML = links.length ? links.map(j => `
    <div class="item">
      <div class="item__top">
        <div class="item__t">${escapeHtml(j.key)}</div>
        <div class="kv">${escapeHtml(j.status)}</div>
      </div>
      <div class="item__m">${escapeHtml(j.note)}</div>
      <div class="item__kvs">
        <span class="kv">Assignee: ${escapeHtml(j.assignee)}</span>
        <span class="kv">Updated: ${escapeHtml(new Date(j.updated).toLocaleString())}</span>
      </div>
    </div>
  `).join("") : `<div class="muted">No linked Jira issues found.</div>`;

  logEvent({ type: "API", message: "Loaded linked Jira issues (mock)", meta: { count: links.length } });
}

function renderSeekerEmpty() {
  $("seeker").innerHTML = `
    <div class="item"><div class="item__t">Suggested Macros</div><div class="item__m muted">Run Seeker or Refresh to get recommendations.</div></div>
    <div class="item"><div class="item__t">Similar Tickets</div><div class="item__m muted">Run Seeker or Refresh to list similar tickets.</div></div>
  `;
}

function renderSideConvo() {
  const msgs = SIDE_CONVO_BY_TICKET[ACTIVE_KEY] || [];
  $("sideConvo").innerHTML = msgs.length ? msgs.map(m => `
    <div class="msg">
      <div class="msg__meta">${escapeHtml(m.by)} • ${escapeHtml(fmt(m.ts))}</div>
      <div class="msg__txt">${escapeHtml(m.text)}</div>
    </div>
  `).join("") : `<div class="muted">No side conversations found.</div>`;
}

function renderKbResults(items) {
  const el = $("kbResults");
  if (!items.length) {
    el.innerHTML = `
      <div class="kbItem">
        <div class="kbItem__t">No results</div>
        <div class="kbItem__m">Try: “user creation”, “permissions”, “export”, “HAR”</div>
      </div>`;
    return;
  }
  el.innerHTML = items.map(k => `
    <div class="kbItem">
      <div class="kbItem__t">${escapeHtml(k.title)}</div>
      <div class="kbItem__m">${escapeHtml(k.snippet)}</div>
      <div class="kbItem__a">
        <span class="badge">${escapeHtml(k.source)}</span>
        ${k.tags.map(t => `<span class="badge">${escapeHtml(t)}</span>`).join("")}
        <span class="link">${escapeHtml(k.url)}</span>
      </div>
    </div>
  `).join("");
}

function kbSearch(query, scope) {
  const q = safeLower(query).trim();
  if (!q) return [];

  return KB.filter(k => {
    if (scope !== "all" && k.source !== scope) return false;
    const hay = safeLower(k.title + " " + k.snippet + " " + k.tags.join(" "));
    return hay.includes(q) || q.split(/\s+/).some(w => w && hay.includes(w));
  });
}

// -----------------------------
// ✅ AI: analyze ticket and hydrate ALL widgets
// -----------------------------
async function aiAnalyzeTicket(ticket) {
  const res = await fetch(AI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticket })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `AI error: ${res.status}`);
  }
  return res.json();
}

function setOpenClose(text) {
  $("openCloseOut").textContent = text;
  $("openCloseOut").classList.remove("empty");
}

function setAnswerBox(text) {
  $("qaAnswer").textContent = text;
  $("qaAnswer").classList.remove("empty");
}

async function hydrateAllFromAI() {
  try {
    logEvent({ type: "AI", message: "AI analyze started", meta: { ticketId: ACTIVE.id } });
    toast("Analyzing ticket with AI…");

    const out = await aiAnalyzeTicket(ACTIVE);

    // 1) classification/chips
    const c = out.classification || ACTIVE.classification;
    ACTIVE.classification = c;
    setChips(c.category || "—", c.intent || "—", c.sentiment || "—", c.priority || "—");

    // 2) ticket summary widget
    const requester = `${ACTIVE.requester.name} (${ACTIVE.requester.email}) • Org: ${ACTIVE.requester.org}`;
    const timeline = ACTIVE.events.map(e => `• ${new Date(e.ts).toLocaleString()} — ${e.by}: ${e.text}`).join("\n");

    $("ticketSummary").innerHTML = `
      <div><b>Ticket Summary</b></div>
      <div class="muted" style="margin-top:6px;">${escapeHtml(ACTIVE.subject)}</div>
      <div class="muted" style="margin-top:6px;">${escapeHtml(requester)}</div>

      <div style="margin-top:10px;"><b>AI Summary</b></div>
      <pre style="margin-top:8px; border:1px solid #E3E8F2; border-radius:14px; padding:10px; background:#fff; overflow:auto; font-family: var(--mono); font-size: 12px; white-space: pre-wrap;">${escapeHtml(out.summary_markdown || "—")}</pre>

      <details style="margin-top:10px;">
        <summary class="muted" style="cursor:pointer;">Show full timeline</summary>
        <pre style="margin-top:8px; border:1px solid #E3E8F2; border-radius:14px; padding:10px; background:#fff; overflow:auto; font-family: var(--mono); font-size: 12px; white-space: pre-wrap;">${escapeHtml(timeline)}</pre>
      </details>
    `;

    // 3) seeker widget
    const macros = (out.seeker?.suggested_macros || []).map(x => `• ${x}`).join("\n");
    const queries = (out.seeker?.similar_ticket_queries || []).map(x => `• ${x}`).join("\n");

    $("seeker").innerHTML = `
      <div class="item">
        <div class="item__t">Suggested Macros</div>
        <div class="item__m" style="white-space:pre-wrap;">${escapeHtml(macros || "• —")}</div>
        <div class="item__kvs">
          <span class="kv">AI-generated</span>
          <span class="kv">Intent: ${escapeHtml(c.intent || "—")}</span>
        </div>
      </div>
      <div class="item">
        <div class="item__t">Similar Tickets</div>
        <div class="item__m" style="white-space:pre-wrap;">${escapeHtml(queries || "• —")}</div>
        <div class="item__kvs">
          <span class="kv">Org: ${escapeHtml(ACTIVE.requester.org || "—")}</span>
        </div>
      </div>
    `;

    // 4) ASK ME default
    if (out.ask_me_default) {
      setAnswerBox(out.ask_me_default);
    } else {
      $("qaAnswer").textContent = "Ask a question to see an answer.";
      $("qaAnswer").classList.add("empty");
    }

    // 5) Draft reply
    if (out.draft_reply) {
      $("draft").value = out.draft_reply;
    }

    // 6) Side conversation summary
    if (out.side_convo_summary) {
      $("sideConvo").insertAdjacentHTML("afterbegin", `
        <div class="msg" style="border-style:dashed;">
          <div class="msg__meta">AI Summary • ${escapeHtml(fmt(isoNow()))}</div>
          <div class="msg__txt" style="white-space:pre-wrap;">${escapeHtml(out.side_convo_summary)}</div>
        </div>
      `);
    }

    // 7) Cache opening/closure
    AI_CACHE.opening_message = out.opening_message || null;
    AI_CACHE.closure_message = out.closure_message || null;

    logEvent({
      type: "AI",
      message: "AI analyze complete",
      meta: { intent: c.intent, priority: c.priority }
    });
    toast("AI populated all widgets ✅");
  } catch (err) {
    logEvent({ type: "ERROR", message: "AI analyze failed", meta: { error: String(err?.message || err) } });
    toast("AI failed — check logs");
  }
}

// -----------------------------
// Opening / Closure (uses AI cache first)
// -----------------------------
function openingMessage() {
  const t = AI_CACHE.opening_message;
  if (t) {
    setOpenClose(t);
    logEvent({ type: "AI", message: "Generated opening message (AI)" });
    toast("Opening generated");
    return;
  }

  const text =
`Hi ${ACTIVE.requester.name},

Thanks for reaching out to project44 Support. I’m looking into: "${ACTIVE.subject}".

To proceed, could you confirm any missing details (e.g., user email/org, affected module, expected outcome)? Once confirmed, I’ll take the next steps.

Best regards,
Nayana`;

  setOpenClose(text);
  logEvent({ type: "AI", message: "Generated opening message (fallback)" });
  toast("Opening generated");
}

function closureMessage() {
  const t = AI_CACHE.closure_message;
  if (t) {
    setOpenClose(t);
    logEvent({ type: "AI", message: "Generated closure message (AI)" });
    toast("Closure generated");
    return;
  }

  const text =
`Hi ${ACTIVE.requester.name},

Thank you for confirming. We’ve completed the requested steps for "${ACTIVE.subject}".

If the issue persists or you need anything else, reply to this ticket and we’ll continue assisting.

Best regards,
Nayana`;

  setOpenClose(text);
  logEvent({ type: "AI", message: "Generated closure message (fallback)" });
  toast("Closure generated");
}

// -----------------------------
// ASK ME (still your mocked logic for custom questions)
// -----------------------------
function askMe(question) {
  const q = safeLower(question);
  const intent = ACTIVE.classification.intent;

  const basicFacts = [
    `Ticket: ${ACTIVE.id}`,
    `Intent: ${intent}`,
    `Requester: ${ACTIVE.requester.name} (${ACTIVE.requester.email})`,
    `Org: ${ACTIVE.requester.org}`,
    `Subject: ${ACTIVE.subject}`
  ].join("\n");

  let ans = `Grounded on the current ticket:\n${basicFacts}\n\n`;

  if (q.includes("summarize") || q.includes("summary")) {
    ans += "(Use Refresh / Generate Summary for AI summary above.)";
    return ans;
  }

  if (q.includes("ask next") || q.includes("next question") || q.includes("clarify")) {
    ans += $("qaAnswer").textContent || "Refresh to get AI suggestions.";
    return ans;
  }

  if (q.includes("recommend") || q.includes("kb") || q.includes("article")) {
    const top = KB.slice(0, 3).map(k => `- ${k.title} (${k.source})`).join("\n");
    ans += `Recommended KB:\n${top}`;
    return ans;
  }

  ans +=
`I can help with:
- Ticket summary + classification
- KB suggestions
- Draft replies (opening/closure/full reply)
- Linked Jira summary
- Side conversation summary
- Observe logs (audit trail)`;
  return ans;
}

// -----------------------------
// Draft utilities (optional manual buttons)
// -----------------------------
function shortenDraft() {
  const { name } = ACTIVE.requester;
  return `Hi ${name},

Regarding "${ACTIVE.subject}": we’re on it. Please share any missing details (screenshot/errors/user email), and we’ll proceed.

Thanks,
Nayana`;
}

function formalDraft() {
  const { name } = ACTIVE.requester;
  return `Dear ${name},

This is to acknowledge your request regarding "${ACTIVE.subject}". Kindly provide any missing details (e.g., user email/org, screenshots, logs), and we will proceed with the appropriate next steps.

Sincerely,
Nayana Ananda
Customer Support`;
}

// -----------------------------
// Core UI
// -----------------------------
async function refreshContext() {
  logEvent({
    type: "API",
    message: "Fetched ticket context (mock)",
    meta: { ticketId: ACTIVE.id, requester: ACTIVE.requester.email }
  });

  renderJira();
  renderSideConvo();

  // ✅ this is the “read ticket → populate everything” step
  await hydrateAllFromAI();

  toast(`Refreshed: ${ACTIVE.id}`);
}

function resetDemoUI() {
  $("qaAnswer").textContent = "Ask a question to see an answer.";
  $("qaAnswer").classList.add("empty");

  $("openCloseOut").textContent = "Click Opening or Closure to generate text.";
  $("openCloseOut").classList.add("empty");

  $("draft").value = "";
  $("kbQuery").value = "";
  $("qaInput").value = "";

  AI_CACHE.opening_message = null;
  AI_CACHE.closure_message = null;

  renderTicketSummaryEmpty();
  renderSeekerEmpty();
  renderKbResults([]);
  renderJira();
  renderSideConvo();
  renderLogs();
}

function setActiveTicket(key) {
  ACTIVE_KEY = key;
  ACTIVE = TICKETS[key];

  LOGS = [];
  resetDemoUI();
  logEvent({ type: "API", message: "Switched active ticket", meta: { ticketId: ACTIVE.id, key } });
  toast(`Ticket set: ${ACTIVE.id}`);
}

// -----------------------------
// Zendesk Live Ticket Integration
// -----------------------------
function classifyFromText(text) {
  const t = safeLower(text);

  const hasUser = t.includes("user") || t.includes("account") || t.includes("login");
  const userCreateVerb =
    t.includes("create") || t.includes("add") || t.includes("onboard") || t.includes("provision") || t.includes("set up");

  const hasAccessVerb =
    t.includes("permission") || t.includes("permissions") || t.includes("enable") || t.includes("access") || t.includes("role");

  const bugSignals =
    t.includes("bug") || t.includes("error") || t.includes("blank") || t.includes("not working") || t.includes("fails") || t.includes("issue");

  const howToSignals =
    t.includes("how do i") || t.includes("how to") || t.includes("where do i") || t.includes("steps") || t.includes("export");

  const priority = bugSignals ? "High" : (t.includes("urgent") || t.includes("asap") ? "High" : "Medium");

  if (hasUser && userCreateVerb) return { category:"User Assistance", intent:"User Creation", sentiment:"Neutral", priority };
  if (bugSignals) return { category:"Incident", intent:"Bug Report", sentiment:"Neutral", priority:"High" };
  if (hasAccessVerb) return { category:"User Assistance", intent:"Access/Permissions", sentiment:"Neutral", priority:"Low" };
  if (howToSignals) return { category:"User Assistance", intent:"How-To Assistance", sentiment:"Neutral", priority:"Low" };

  return { category:"User Assistance", intent:"General Support", sentiment:"Neutral", priority };
}

function ensureLiveOption(label) {
  const sel = $("ticketSelect");
  const key = "zendesk_live";
  let opt = sel.querySelector(`option[value="${key}"]`);
  if (!opt) {
    opt = document.createElement("option");
    opt.value = key;
    opt.textContent = label;
    sel.appendChild(opt);
  } else {
    opt.textContent = label;
  }
  return key;
}

window.addEventListener("P44_ZD_TICKET_EVENT", (e) => {
  const zd = e.detail || {};
  const raw = zd.rawText || "";
  const subject = zd.subject || `Zendesk Ticket #${zd.id || "—"}`;

  const klass = classifyFromText(`${subject}\n${raw}`);

  const key = ensureLiveOption(`Zendesk Live • #${zd.id || "—"}`);

  TICKETS[key] = {
    id: String(zd.id || "—"),
    subject,
    requester: {
      name: zd.requesterName || "Requester",
      email: zd.requesterEmail || "",
      org: zd.org || "Zendesk Sandbox"
    },
    createdAtUtc: zd.createdAtUtc || isoNow(),
    events: [
      { ts: zd.createdAtUtc || isoNow(), by: "Ticket", text: raw || "(No text extracted from page)" }
    ],
    classification: klass
  };

  SIDE_CONVO_BY_TICKET[key] = SIDE_CONVO_BY_TICKET[key] || [];
  JIRA_BY_TICKET[key] = JIRA_BY_TICKET[key] || [];

  $("ticketSelect").value = key;
  setActiveTicket(key);

  logEvent({ type: "API", message: "Loaded live Zendesk ticket via bookmarklet", meta: { ticketId: TICKETS[key].id } });
  toast(`Loaded Zendesk ticket #${TICKETS[key].id}`);

  // ✅ auto-hydrate from AI for live ticket
  hydrateAllFromAI();
});

// -----------------------------
// Wire events
// -----------------------------
$("ticketSelect").addEventListener("change", (e) => setActiveTicket(e.target.value));
$("btnRefresh").addEventListener("click", refreshContext);

$("btnResetDemo").addEventListener("click", () => {
  LOGS = [];
  resetDemoUI();
  logEvent({ type: "API", message: "Reset demo state" });
  toast("Reset");
});

// Generate Summary now just calls AI hydrate (same outcome)
$("btnGenSummary").addEventListener("click", hydrateAllFromAI);

$("btnLoadJira").addEventListener("click", renderJira);

// Keep Seeker button for demo; it just calls AI hydrate too
$("btnRunSeeker").addEventListener("click", hydrateAllFromAI);

$("btnOpening").addEventListener("click", openingMessage);
$("btnClosure").addEventListener("click", closureMessage);

$("btnSummSide").addEventListener("click", () => {
  // For now, side convo summary comes from AI via Refresh/Generate Summary.
  // This button can still just run AI.
  hydrateAllFromAI();
});

$("btnKbSearch").addEventListener("click", () => {
  const q = $("kbQuery").value;
  const scope = $("kbScope").value;
  logEvent({ type: "KB", message: "KB search executed (mock)", meta: { query: q, scope } });
  const results = kbSearch(q, scope);
  renderKbResults(results);
});

$("btnAsk").addEventListener("click", () => {
  const q = $("qaInput").value.trim();
  if (!q) return;
  logEvent({ type: "AI", message: "Follow-up question asked", meta: { question: q } });
  const ans = askMe(q);
  $("qaAnswer").textContent = ans;
  $("qaAnswer").classList.remove("empty");
});

// Draft controls
$("btnShorten").addEventListener("click", () => {
  if (!$("draft").value.trim()) return;
  $("draft").value = shortenDraft();
  logEvent({ type: "AI", message: "Shortened draft" });
  toast("Draft shortened");
});

$("btnMoreFormal").addEventListener("click", () => {
  if (!$("draft").value.trim()) return;
  $("draft").value = formalDraft();
  logEvent({ type: "AI", message: "Adjusted draft to formal tone" });
  toast("Formal tone");
});

// Generate Reply button: re-run AI and populate draft reply
$("btnGenReply").addEventListener("click", async () => {
  const requestId = rid();
  await hydrateAllFromAI();
  logEvent({ type: "AI", message: "Generated draft reply (AI)", meta: { requestId } });
  toast(`Draft generated • ${requestId}`);
});

$("btnCopy").addEventListener("click", async () => {
  const t = $("draft").value;
  if (!t) return toast("Nothing to copy");
  await navigator.clipboard.writeText(t);
  logEvent({ type: "ACTION", message: "Copied draft to clipboard" });
  toast("Copied");
});

$("btnInsert").addEventListener("click", () => {
  const t = $("draft").value;
  if (!t) return toast("Nothing to insert");
  logEvent({ type: "ACTION", message: "Inserted reply into Zendesk editor (demo)", meta: { ticketId: ACTIVE.id } });
  toast("Inserted (demo)");
});

// Observe controls
$("logFilter").addEventListener("change", renderLogs);
$("btnClearLogs").addEventListener("click", () => {
  LOGS = [];
  renderLogs();
  toast("Logs cleared");
});
$("btnExportLogs").addEventListener("click", exportLogs);

// -----------------------------
// Init
// -----------------------------
function init() {
  renderTicketSummaryEmpty();
  renderSeekerEmpty();
  renderKbResults([]);
  renderJira();
  renderSideConvo();
  renderLogs();
  logEvent({ type: "API", message: "UI loaded", meta: { ticketId: ACTIVE.id } });
}
init();
