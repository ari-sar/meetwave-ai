// Same-origin in production (Express serves /client). Falls back to localhost for `npm run client` dev.
const API_BASE = (location.port === "5000" || location.protocol === "https:" || location.hostname !== "127.0.0.1" && location.hostname !== "localhost")
  ? ""
  : "http://localhost:5000";

// === Lockout state (single source of truth) ===
let isJobInProgress = false;
let activePollTimerId = null;
let activePollJobId = null;
let currentSessionId = null;

// 3) Intercept overlay — full-screen invisible shield, blocks clicks/keys.
function ensureInterceptOverlay() {
  let el = document.getElementById("interceptOverlay");
  if (el) return el;
  el = document.createElement("div");
  el.id = "interceptOverlay";
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = "position:fixed;inset:0;z-index:9999;background:transparent;cursor:wait;display:none;";
  // Swallow every interaction.
  ["click", "mousedown", "mouseup", "touchstart", "touchend", "keydown", "keyup", "submit"].forEach(evt => {
    el.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); }, { capture: true });
  });
  document.body.appendChild(el);
  return el;
}
function showInterceptOverlay() { ensureInterceptOverlay().style.display = "block"; }
function hideInterceptOverlay() { ensureInterceptOverlay().style.display = "none"; }

// 2) Hard input lock — disables form controls at the DOM level.
function setUploadInputsDisabled(disabled) {
  const fileInput = document.getElementById("fileInput");
  const uploadBtn = document.getElementById("uploadBtn");
  if (fileInput) fileInput.disabled = disabled;
  if (uploadBtn) {
    uploadBtn.disabled = disabled;
    if (disabled) uploadBtn.setAttribute("aria-busy", "true");
    else uploadBtn.removeAttribute("aria-busy");
  }
  const dropLabel = document.querySelector(".upload-drop");
  if (dropLabel) dropLabel.style.pointerEvents = disabled ? "none" : "";
}

// 4) Singleton polling — kill any existing timer before starting a new one.
function stopPolling() {
  if (activePollTimerId) {
    clearTimeout(activePollTimerId);
    activePollTimerId = null;
  }
  activePollJobId = null;
}

function lockUI() {
  isJobInProgress = true;
  setUploadInputsDisabled(true);
  showInterceptOverlay();
}
function unlockUI() {
  isJobInProgress = false;
  setUploadInputsDisabled(false);
  hideInterceptOverlay();
}

document.getElementById('fileInput').addEventListener('change', function() {
  if (isJobInProgress) return;
  const file = this.files[0];
  const uploadBtn = document.getElementById('uploadBtn');
  const dropTitle = document.querySelector('.upload-title');
  if (file) {
    uploadBtn.classList.remove('hidden');
    if (dropTitle) dropTitle.textContent = file.name;
  } else {
    uploadBtn.classList.add('hidden');
  }
});

function getFingerprint() {
  return btoa(
    navigator.userAgent +
    screen.width +
    screen.height +
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
}

function renderComparison(data) {
  const container = document.getElementById("resultsGrid");
  container.innerHTML = `
    <div class="comparison-wrap">
      <img id="comparisonImg" class="comparison-img" src="${data.comparisonUrl}" alt="Your style report">
      <div class="lock-overlay" id="lockOverlay">
        <div class="lock-chip">🔒 Pay ₹19 to reveal</div>
      </div>
    </div>
  `;
}

function unlockComparison() {
  const img = document.getElementById("comparisonImg");
  const overlay = document.getElementById("lockOverlay");
  if (img) img.classList.add("unlocked");
  if (overlay) {
    const chip = overlay.querySelector(".lock-chip");
    if (chip) chip.textContent = "✓ Unlocked";
    setTimeout(() => overlay.remove(), 1200);
  }

  const pill = document.querySelector(".unlock-headline .lock-pill");
  if (pill) pill.textContent = "✓ Unlocked";
  const headline = document.querySelector(".unlock-headline h3");
  if (headline) headline.textContent = "Your report is ready";
  const headlineSub = document.querySelector(".unlock-headline .muted");
  if (headlineSub) headlineSub.classList.add("hidden");
}

function renderMetadata(data) {
  const section = document.getElementById("bestMatchSection");
  section.innerHTML = `
    <div class="info-card">
      <h4>Your best matches</h4>
      <ol>
        ${(data.bestMatch || []).map((s, i) => `<li><span class="num">${i + 1}.</span> ${s}</li>`).join("")}
      </ol>
    </div>
    <div class="info-card">
      <h4>Quick tips</h4>
      <ul>
        ${(data.tips || []).map(t => `<li>• ${t}</li>`).join("")}
      </ul>
    </div>
    <div class="info-card">
      <h4>Your palette</h4>
      <div class="palette-row">
        ${(data.palette || []).map(c => `<div style="background-color:${c}"></div>`).join("")}
      </div>
    </div>
  `;
}

const STAGE_MESSAGES = {
  queued: "Queuing your request…",
  analyzing: "Analyzing your features…",
  preparing: "Matching style aesthetics…",
  generating: "Generating your report card…",
  done: "Finalizing the details…"
};

function pollJob(jobId) {
  // Singleton: kill any prior loop before starting.
  stopPolling();
  activePollJobId = jobId;

  const loadingText = document.getElementById("loadingText");

  const tick = async () => {
    // If a different job has taken over (or we were stopped), bail.
    if (activePollJobId !== jobId) return;
    try {
      const res = await fetch(`${API_BASE}/api/generate/status/${jobId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Status check failed");

      // Late response from a stale loop — discard.
      if (activePollJobId !== jobId) return;

      if (data.stage && STAGE_MESSAGES[data.stage]) {
        loadingText.textContent = STAGE_MESSAGES[data.stage];
      }

      if (data.status === "done") {
        stopPolling();
        currentSessionId = data.result.sessionId;
        document.getElementById("loadingState").classList.add("hidden");
        document.getElementById("resultsSection").classList.remove("hidden");
        document.getElementById("unlockSection").classList.remove("hidden");
        renderComparison(data.result);
        renderMetadata(data.result);
        // Result is on screen — release the shield so the user can click Unlock.
        unlockUI();
        return;
      }

      if (data.status === "failed") {
        stopPolling();
        alert("Generation failed: " + (data.error || "unknown error"));
        document.getElementById("loadingState").classList.add("hidden");
        document.getElementById("uploadSection").classList.remove("hidden");
        unlockUI();
        return;
      }

      activePollTimerId = setTimeout(tick, 3000);
    } catch (err) {
      console.error("Poll error:", err);
      if (activePollJobId === jobId) {
        activePollTimerId = setTimeout(tick, 5000);
      }
    }
  };

  tick();
}

document.getElementById('uploadBtn').addEventListener('click', async function(event) {
  event.preventDefault();
  event.stopPropagation();

  // 1) Boolean gatekeeper — first check, before anything else.
  if (isJobInProgress) {
    console.warn("Job already in progress; click ignored.");
    return;
  }

  const fileInput = document.getElementById("fileInput");
  const file = fileInput.files[0];
  if (!file) return alert("Please select an image first.");

  // Lock immediately, BEFORE any await.
  lockUI();

  const formData = new FormData();
  formData.append("image", file);

  document.getElementById("uploadSection").classList.add("hidden");
  document.getElementById("loadingState").classList.remove("hidden");
  document.getElementById("resultsSection").classList.add("hidden");
  document.getElementById("unlockSection").classList.add("hidden");
  document.getElementById("loadingText").textContent = STAGE_MESSAGES.queued;

  try {
    const res = await fetch(`${API_BASE}/api/generate`, {
      method: "POST",
      headers: { "x-fingerprint": getFingerprint() },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");

    // Polling continues to hold the lock until job completes/fails.
    pollJob(data.jobId);
  } catch (err) {
    console.error(err);
    alert("Error: " + err.message);
    document.getElementById("loadingState").classList.add("hidden");
    document.getElementById("uploadSection").classList.remove("hidden");
    unlockUI();
  }
});

async function handlePaymentSuccess(razorpayResponse) {
  if (!currentSessionId) return alert("Session expired. Please upload again.");
  try {
    const res = await fetch(`${API_BASE}/api/payment/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: currentSessionId,
        razorpay_order_id: razorpayResponse.razorpay_order_id,
        razorpay_payment_id: razorpayResponse.razorpay_payment_id,
        razorpay_signature: razorpayResponse.razorpay_signature
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Confirmation failed");

    unlockComparison();
    const dl = document.getElementById("downloadBtn");
    dl.href = `${API_BASE}/api/verify/${data.downloadToken}`;
    dl.classList.remove("hidden");

    const unlockBtn = document.getElementById("unlockBtn");
    if (unlockBtn) unlockBtn.classList.add("hidden");
  } catch (err) {
    alert("Payment confirm error: " + err.message);
  }
}

async function startCheckout() {
  if (!currentSessionId) return alert("Generate your styles first.");
  const unlockBtn = document.getElementById("unlockBtn");
  if (unlockBtn?.disabled) return;
  if (unlockBtn) unlockBtn.disabled = true;

  try {
    const orderRes = await fetch(`${API_BASE}/api/payment/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: currentSessionId })
    });
    const order = await orderRes.json();
    if (!orderRes.ok) throw new Error(order.error || "Order failed");

    const rzp = new Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.orderId,
      name: "MeetWave AI",
      description: "Unlock full style report",
      handler: handlePaymentSuccess,
      theme: { color: "#FF5A1F" },
      modal: {
        ondismiss: () => {
          if (unlockBtn) unlockBtn.disabled = false;
        }
      }
    });
    rzp.open();
  } catch (err) {
    alert("Could not start checkout: " + err.message);
    if (unlockBtn) unlockBtn.disabled = false;
  }
}

document.getElementById('unlockBtn')?.addEventListener('click', startCheckout);
