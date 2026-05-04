let currentSessionId = null;

document.getElementById('fileInput').addEventListener('change', function() {
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
  if (overlay) overlay.remove();
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

document.getElementById('uploadBtn').addEventListener('click', async function(event) {
  event.preventDefault();
  event.stopPropagation();

  const fileInput = document.getElementById("fileInput");
  const file = fileInput.files[0];
  if (!file) return alert("Please select an image first.");

  const formData = new FormData();
  formData.append("image", file);

  document.getElementById("uploadSection").classList.add("hidden");
  document.getElementById("loadingState").classList.remove("hidden");
  document.getElementById("resultsSection").classList.add("hidden");
  document.getElementById("unlockSection").classList.add("hidden");

  const loadingText = document.getElementById("loadingText");
  const messages = [
    "Analyzing your features…",
    "Matching style aesthetics…",
    "Generating your report card…",
    "Finalizing the details…"
  ];
  let i = 0;
  const interval = setInterval(() => {
    i = (i + 1) % messages.length;
    loadingText.textContent = messages[i];
  }, 2500);

  try {
    const res = await fetch("http://localhost:5000/api/generate", {
      method: "POST",
      headers: { "x-fingerprint": getFingerprint() },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Generation failed");

    clearInterval(interval);
    currentSessionId = data.sessionId;

    document.getElementById("loadingState").classList.add("hidden");
    document.getElementById("resultsSection").classList.remove("hidden");
    document.getElementById("unlockSection").classList.remove("hidden");

    renderComparison(data);
    renderMetadata(data);
  } catch (err) {
    clearInterval(interval);
    console.error(err);
    alert("Error: " + err.message);
    document.getElementById("loadingState").classList.add("hidden");
    document.getElementById("uploadSection").classList.remove("hidden");
  }
});

// Unlock flow — wires into Razorpay success callback when integrated.
async function handlePaymentSuccess() {
  if (!currentSessionId) return alert("Session expired. Please upload again.");
  try {
    const res = await fetch("http://localhost:5000/api/payment/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: currentSessionId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Confirmation failed");

    unlockComparison();
    const dl = document.getElementById("downloadBtn");
    dl.href = `http://localhost:5000/api/verify/${data.downloadToken}`;
    dl.classList.remove("hidden");

    const unlockBtn = document.getElementById("unlockBtn");
    if (unlockBtn) unlockBtn.classList.add("hidden");
  } catch (err) {
    alert("Payment confirm error: " + err.message);
  }
}

// TODO(razorpay): replace this stub click with the Razorpay button success callback.
document.getElementById('unlockBtn')?.addEventListener('click', handlePaymentSuccess);
