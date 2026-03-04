// p44-zendesk-bridge.js
(function () {
  function nowIso() { return new Date().toISOString(); }

  function normalize(payload) {
    const p = payload || {};
    const idFromUrl = (() => {
      const m = String(p.url || "").match(/tickets\/(\d+)/);
      return m ? m[1] : "";
    })();

    return {
      id: String(p.id || idFromUrl || "—"),
      url: String(p.url || ""),
      subject: String(p.subject || "—"),
      rawText: String(p.rawText || p.description || ""),
      description: String(p.description || ""),
      requesterName: String(p.requesterName || "—"),
      requesterEmail: String(p.requesterEmail || ""),
      org: String(p.org || "Zendesk Sandbox"),
      createdAtUtc: String(p.createdAtUtc || nowIso()),
      tags: Array.isArray(p.tags) ? p.tags : [],
      priority: String(p.priority || "Medium")
    };
  }

  window.addEventListener("message", (event) => {
    const msg = event.data;
    if (!msg || msg.type !== "P44_ZD_TICKET") return;

    const ticket = normalize(msg.payload);

    window.P44_ZD_TICKET = ticket;

    window.dispatchEvent(new CustomEvent("P44_ZD_TICKET_EVENT", { detail: ticket }));
  });
})();
