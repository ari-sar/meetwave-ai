// Global state
let currentSessionId = null;
let currentRatings = null;

// Show upload button when file selected
document.getElementById('fileInput').addEventListener('change', function() {
  const file = this.files[0];
  const uploadBtn = document.getElementById('uploadBtn');

  if (file) {
    uploadBtn.classList.remove('hidden');
    uploadBtn.textContent = `Generate Styles for "${file.name}"`;
    console.log(`[UI] File selected: ${file.name}`);
  } else {
    uploadBtn.classList.add('hidden');
  }
});

// Device fingerprinting for rate limiting
function getFingerprint() {
  return btoa(
    navigator.userAgent +
    screen.width +
    screen.height +
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
}

// Render comparison card: full image blurred, with top-left 1/12 cell unblurred as the free preview
function renderComparison(data) {
  const container = document.getElementById("resultsGrid");
  container.innerHTML = "";
  container.className = "w-full flex justify-center";
  container.innerHTML = `
    <div id="comparisonWrapper" class="relative w-full max-w-3xl rounded-xl overflow-hidden shadow-2xl">
      <img id="comparisonBg" src="${data.comparisonUrl}" class="w-full block transition-all duration-500" style="filter: blur(20px); transform: scale(1.05);" alt="Outfit comparison card">
      <img id="comparisonPeek" src="${data.comparisonUrl}" class="absolute inset-0 w-full block" style="clip-path: inset(0 75% 66.67% 0);" alt="Free preview cell">
      <div id="lockOverlay" class="absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none">
        <div class="mb-6 px-4 py-2 bg-black/70 rounded-full text-white text-sm font-semibold">🔒 Unlock to reveal all 12 styles</div>
      </div>
    </div>
  `;
}

// On payment: remove blur, hide the peek crop and lock overlay
function unlockComparison() {
  const bg = document.getElementById("comparisonBg");
  const peek = document.getElementById("comparisonPeek");
  const lock = document.getElementById("lockOverlay");
  if (bg) { bg.style.filter = "none"; bg.style.transform = "none"; }
  if (peek) peek.remove();
  if (lock) lock.remove();
}

// Render best match + tips section
function renderMetadata(data) {
  let metadataSection = document.getElementById("bestMatchSection");

  if (!metadataSection) {
    metadataSection = document.createElement("div");
    metadataSection.id = "bestMatchSection";
    document.getElementById("resultsSection").appendChild(metadataSection);
  }

  metadataSection.className = "mt-12 w-full max-w-3xl mx-auto";
  metadataSection.innerHTML = `
    <div class="grid grid-cols-2 gap-8">
      <!-- Best Match Styles -->
      <div class="glass p-6 rounded-xl">
        <h4 class="text-lg font-bold mb-4 text-purple-400">Your Best Matches</h4>
        <ol class="space-y-2 text-sm">
          ${data.bestMatch.map((style, i) => `<li class="flex items-center gap-2"><span class="text-purple-400 font-bold">${i + 1}.</span> ${style}</li>`).join("")}
        </ol>
      </div>

      <!-- Quick Tips + Color Palette -->
      <div>
        <div class="glass p-6 rounded-xl mb-4">
          <h4 class="text-lg font-bold mb-4 text-purple-400">Quick Tips</h4>
          <ul class="space-y-2 text-sm">
            ${data.tips.map(tip => `<li class="flex gap-2"><span>•</span> <span>${tip}</span></li>`).join("")}
          </ul>
        </div>

        <div class="glass p-6 rounded-xl">
          <h4 class="text-lg font-bold mb-4 text-purple-400">Your Palette</h4>
          <div class="flex gap-2">
            ${(data.palette || []).map(c => `<div class="w-8 h-8 rounded-full" style="background-color: ${c};"></div>`).join("")}
          </div>
        </div>
      </div>
    </div>
  `;
}

// Main upload handler
document.getElementById('uploadBtn').addEventListener('click', async function(event) {
  event.preventDefault();
  event.stopPropagation();

  const fileInput = document.getElementById("fileInput");
  const file = fileInput.files[0];

  if (!file) return alert("Please select an image first.");

  const formData = new FormData();
  formData.append("image", file);

  // UI: Hide upload, show loading
  document.getElementById("uploadSection").classList.add("hidden");
  document.getElementById("loadingState").classList.remove("hidden");
  document.getElementById("resultsSection").classList.add("hidden");
  document.getElementById("unlockSection").classList.add("hidden");

  const loadingText = document.getElementById("loadingText");
  const progressMessages = [
    "Analyzing your features...",
    "Generating Korean style...",
    "Generating Baddie style...",
    "Generating Vintage style...",
    "Applying final touches...",
    "Finalizing your analysis..."
  ];
  let msgIndex = 0;
  const progressInterval = setInterval(() => {
    msgIndex = (msgIndex + 1) % progressMessages.length;
    loadingText.textContent = progressMessages[msgIndex];
  }, 2500);

  try {
    const res = await fetch("http://localhost:5000/api/generate", {
      method: "POST",
      headers: {
        "x-fingerprint": getFingerprint()
      },
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Generation failed");
    }

    clearInterval(progressInterval);

    currentSessionId = data.sessionId;
    currentRatings = data.ratings;

    document.getElementById("loadingState").classList.add("hidden");
    document.getElementById("resultsSection").classList.remove("hidden");
    document.getElementById("resultsSection").classList.add("flex");

    renderComparison(data);
    renderMetadata(data);

    // Show unlock section
    document.getElementById("unlockSection").classList.remove("hidden");

  } catch (error) {
    clearInterval(progressInterval);
    console.error("Error:", error);
    alert(`Error: ${error.message}`);

    document.getElementById("loadingState").classList.add("hidden");
    document.getElementById("uploadSection").classList.remove("hidden");
  }
});

// Unlock button: client-side only — no API call. Removes blur from already-generated image.
document.getElementById('unlockBtn')?.addEventListener('click', function() {
  if (!currentSessionId) return alert("Session expired. Please upload again.");
  unlockComparison();
  this.textContent = "All styles unlocked!";
  this.disabled = true;
});

// Store data in localStorage for re-rendering after full generation
document.getElementById('uploadBtn').addEventListener('click', function() {
  // This will be called after successful generation
  setTimeout(() => {
    const resultsGrid = document.getElementById("resultsGrid");
    if (resultsGrid && resultsGrid.children.length > 0) {
      // Optionally store state for debugging
    }
  }, 1000);
});