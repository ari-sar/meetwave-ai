const API_BASE = "";

// PostHog initialization
if (typeof posthog !== "undefined" && posthog) {
  posthog.capture("page_visit");
}

let isJobInProgress = false;
let activePollTimerId = null;
let activePollJobId = null;
let currentSessionId = null;

// Ensure persistent lock state is checked on page load
document.addEventListener("DOMContentLoaded", async () => {
  try {
    const fingerprint = getFingerprint();
    const res = await fetch(`${API_BASE}/api/generate/session-check`, {
      headers: { 'x-fingerprint': fingerprint }
    });
    
    if (!res.ok) return;
    const data = await res.json();
    
    if (data.locked && data.lastJobId) {
      console.log("User is locked. Restoring previous session.");
      // Hide upload instantly
      document.getElementById("uploadSection").classList.add("hidden");
      document.getElementById("loadingState").classList.remove("hidden");
      document.getElementById("loadingText").textContent = "Restoring your report...";
      
      // Hook straight into the polling logic to pull down the locked image
      pollJob(data.lastJobId);
    }
  } catch (err) {
    console.error("Failed to restore session state:", err);
  }
});

function ensureInterceptOverlay() {
  let el = document.getElementById("interceptOverlay");
  if (el) return el;
  el = document.createElement("div");
  el.id = "interceptOverlay";
  el.setAttribute("aria-hidden", "true");
  el.style.cssText = "position:fixed;inset:0;z-index:9999;background:transparent;cursor:wait;display:none;";
  ["click", "mousedown", "mouseup", "touchstart", "touchend", "keydown", "keyup", "submit"].forEach(evt => {
    el.addEventListener(evt, e => { e.preventDefault(); e.stopPropagation(); }, { capture: true });
  });
  document.body.appendChild(el);
  return el;
}
function showInterceptOverlay() { ensureInterceptOverlay().style.display = "block"; }
function hideInterceptOverlay() { ensureInterceptOverlay().style.display = "none"; }

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
        <div class="lock-chip">🔒 Pay ₹49 to reveal <span class="lock-chip-arrow">↓</span></div>
      </div>
    </div>
  `;
  container.querySelector(".lock-chip")?.addEventListener("click", () => {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  });
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
  stopPolling();
  activePollJobId = jobId;

  const loadingText = document.getElementById("loadingText");

  const tick = async () => {
    if (activePollJobId !== jobId) return;
    try {
      const res = await fetch(`${API_BASE}/api/generate/status/${jobId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Status check failed");

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
        if (typeof posthog !== "undefined" && posthog) {
          posthog.capture("paywall_viewed");
        }
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

  if (isJobInProgress) {
    console.warn("Job already in progress; click ignored.");
    return;
  }

  const fileInput = document.getElementById("fileInput");
  const file = fileInput.files[0];
  if (!file) return alert("Please select an image first.");

  if (typeof posthog !== "undefined" && posthog) {
    posthog.capture("image_uploaded");
  }

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
    
    // SAFE JSON PARSING TO FIX THE "JSON ERROR" ISSUE
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: "A server error occurred." }));
      throw new Error(errData.error);
    }
    
    const data = await res.json();
    pollJob(data.jobId);
    
  } catch (err) {
    console.error(err);
    alert(err.message);
    document.getElementById("loadingState").classList.add("hidden");
    document.getElementById("uploadSection").classList.remove("hidden");
    unlockUI();
  }
});

let paymentPollTimerId = null;
let paymentPollStartedAt = null;
const PAYMENT_POLL_TIMEOUT_MS = 60 * 1000;

function showPaymentFailure() {
  const verifyMsg = document.getElementById("paymentVerifyMsg");
  if (verifyMsg) verifyMsg.classList.add("hidden");

  const form = document.getElementById("razorpayPaymentForm");
  if (form) form.style.display = "none";

  const mount = document.getElementById("razorpayMount");
  if (mount) {
    const failureBox = document.createElement("div");
    failureBox.className = "payment-failure";
    failureBox.style.cssText = "margin-top:16px;padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--surface-2);text-align:left;";
    failureBox.innerHTML = `
      <h4 style="margin:0 0 8px 0;color:var(--accent);">Payment verification failed</h4>
      <p class="muted" style="margin:0 0 12px 0;font-size:0.9rem;">We couldn't confirm your payment within 60 seconds. If money was deducted, please contact support with the details below.</p>
      <div style="font-family:monospace;font-size:0.8rem;background:var(--surface);padding:10px;border-radius:8px;margin-bottom:12px;word-break:break-all;">
        <div><strong>Session ID:</strong> ${currentSessionId || "unknown"}</div>
        <div><strong>Time:</strong> ${new Date().toISOString()}</div>
      </div>
      <button id="contactSupportBtn" class="btn btn-primary" style="width:100%;">Contact Support</button>
    `;
    mount.appendChild(failureBox);

    document.getElementById("contactSupportBtn")?.addEventListener("click", () => {
      const supportOverlay = document.getElementById("supportOverlay");
      const messageInput = document.getElementById("messageInput");
      if (messageInput) {
        messageInput.value = `Payment issue — Session: ${currentSessionId}\nTime: ${new Date().toISOString()}\n\nDetails: `;
      }
      if (supportOverlay) supportOverlay.classList.remove("hidden");
    });
  }
}

function startPaymentPolling() {
  if (!currentSessionId || paymentPollTimerId) return;

  const verifyMsg = document.getElementById("paymentVerifyMsg");
  paymentPollStartedAt = Date.now();

  const pollPayment = async () => {
    if (Date.now() - paymentPollStartedAt > PAYMENT_POLL_TIMEOUT_MS) {
      clearTimeout(paymentPollTimerId);
      paymentPollTimerId = null;
      showPaymentFailure();
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/payment/status/${currentSessionId}`);
      const data = await res.json();

      if (data.paid && data.downloadToken) {
        clearTimeout(paymentPollTimerId);
        paymentPollTimerId = null;
        if (verifyMsg) verifyMsg.classList.add("hidden");

        if (typeof posthog !== "undefined" && posthog) {
          posthog.capture("payment_successful", { amount: 4900, currency: "INR" });
        }

        unlockComparison();
        const dl = document.getElementById("downloadBtn");
        dl.href = `${API_BASE}/api/verify/${data.downloadToken}`;
        dl.classList.remove("hidden");

        const form = document.getElementById("razorpayPaymentForm");
        if (form) form.style.display = "none";
        return;
      }
    } catch (err) {
      console.error("Payment poll error:", err);
    }
    paymentPollTimerId = setTimeout(pollPayment, 4000);
  };

  paymentPollTimerId = setTimeout(pollPayment, 3000);
}

async function startCheckout() {
  if (!currentSessionId) return;

  if (typeof posthog !== "undefined" && posthog) {
    posthog.capture("checkout_started");
  }

  try {
    const orderRes = await fetch(`${API_BASE}/api/payment/create-order`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: currentSessionId })
    });
    const order = await orderRes.json();
    if (!orderRes.ok) throw new Error(order.error || "Order creation failed");

    const rzp = new Razorpay({
      key: order.keyId,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      name: "MeetWave AI",
      description: "Style report unlock",
      notes: { sessionId: currentSessionId },
      handler: async (response) => {
        const verifyMsg = document.getElementById("paymentVerifyMsg");
        if (verifyMsg) verifyMsg.classList.remove("hidden");
        try {
          const confirmRes = await fetch(`${API_BASE}/api/payment/confirm`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId: currentSessionId,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            })
          });
          const data = await confirmRes.json();
          if (!confirmRes.ok) throw new Error(data.error || "Payment confirmation failed");

          if (typeof posthog !== "undefined" && posthog) {
            posthog.capture("payment_successful", { amount: 4900, currency: "INR" });
          }
          if (verifyMsg) verifyMsg.classList.add("hidden");
          unlockComparison();
          const dl = document.getElementById("downloadBtn");
          dl.href = `${API_BASE}/api/verify/${data.downloadToken}`;
          dl.classList.remove("hidden");
          const unlockBtn = document.getElementById("unlockBtn");
          if (unlockBtn) unlockBtn.style.display = "none";
        } catch (err) {
          console.error("Confirm error:", err);
          startPaymentPolling();
        }
      },
      modal: {
        ondismiss: () => {
          startPaymentPolling();
        }
      }
    });
    rzp.open();
  } catch (err) {
    console.error("Checkout error:", err);
    alert("Could not start payment: " + err.message);
  }
}

document.getElementById("unlockBtn")?.addEventListener("click", startCheckout);

// Support overlay
const supportOverlay = document.getElementById('supportOverlay');
const helpBtn = document.getElementById('helpBtn');
const closeSupportBtn = document.getElementById('closeSupportBtn');
const supportForm = document.getElementById('supportForm');
const supportStatus = document.getElementById('supportStatus');

helpBtn.addEventListener('click', () => {
  supportOverlay.classList.remove('hidden');
});

closeSupportBtn.addEventListener('click', () => {
  supportOverlay.classList.add('hidden');
  supportForm.reset();
  supportStatus.classList.add('hidden');
});

supportOverlay.addEventListener('click', (e) => {
  if (e.target === supportOverlay) {
    supportOverlay.classList.add('hidden');
    supportForm.reset();
    supportStatus.classList.add('hidden');
  }
});

supportForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const phone = document.getElementById('phoneInput').value.trim();
  const message = document.getElementById('messageInput').value.trim();

  if (!phone || !message) return alert('Please fill all fields');

  supportStatus.classList.remove('hidden');
  supportStatus.textContent = 'Sending...';
  supportStatus.style.color = 'var(--ink-soft)';

  try {
    const res = await fetch(`${API_BASE}/api/support`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, message })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to send');

    supportStatus.textContent = '✓ Message sent! We\'ll get back to you soon.';
    supportStatus.style.color = 'var(--accent)';
    supportForm.reset();
    setTimeout(() => {
      supportOverlay.classList.add('hidden');
      supportStatus.classList.add('hidden');
    }, 2000);
  } catch (err) {
    supportStatus.textContent = 'Error: ' + err.message;
    supportStatus.style.color = 'var(--accent)';
  }
});