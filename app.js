// Refresh should run AI and populate everything
$("btnRefresh").addEventListener("click", async () => {
  try { await runAIAndPopulateAll(); }
  catch (e) {
    logEvent({ level:"ERROR", type:"ERROR", message:"AI failed. Check logs.", meta:{ err:String(e.message || e) } });
    toast("AI failed. Check logs.");
    console.error(e);
  }
});

// Generate Summary should also run AI (not the mock summarizer)
$("btnGenSummary").addEventListener("click", async () => {
  try { await runAIAndPopulateAll(); }
  catch (e) {
    logEvent({ level:"ERROR", type:"ERROR", message:"AI failed. Check logs.", meta:{ err:String(e.message || e) } });
    toast("AI failed. Check logs.");
    console.error(e);
  }
});

// Generate Reply: either call AI or just use what AI already returned.
// Easiest: call AI so it always gives the latest draft reply.
$("btnGenReply").addEventListener("click", async () => {
  try { await runAIAndPopulateAll(); }
  catch (e) {
    logEvent({ level:"ERROR", type:"ERROR", message:"AI failed. Check logs.", meta:{ err:String(e.message || e) } });
    toast("AI failed. Check logs.");
    console.error(e);
  }
});

// Opening / Closure buttons should show AI-generated text if available
$("btnOpening").addEventListener("click", () => {
  const text = window.__AI_OPENING || "";
  if (text.trim()) {
    $("openCloseOut").textContent = text;
    $("openCloseOut").classList.remove("empty");
    toast("AI opening shown");
  } else {
    // fallback to your mock
    openingMessage();
  }
});

$("btnClosure").addEventListener("click", () => {
  const text = window.__AI_CLOSURE || "";
  if (text.trim()) {
    $("openCloseOut").textContent = text;
    $("openCloseOut").classList.remove("empty");
    toast("AI closure shown");
  } else {
    // fallback to your mock
    closureMessage();
  }
});
