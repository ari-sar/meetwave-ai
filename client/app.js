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

// Free render: 12-card grid; only previewStyle card is real, others blurred
function renderGrid(data) {
  const container = document.getElementById("resultsGrid");
  container.innerHTML = "";
  container.className = "grid grid-cols-4 gap-3 w-full";

  data.allStyles.forEach(style => {
    const isPreview = style === data.previewStyle;
    const rating = (data.ratings && data.ratings[style]) || "average";

    let ratingBg, ratingText, ratingIcon;
    if (rating === "recommended") {
      ratingBg = "bg-[#C8E6C9]"; ratingText = "text-[#398E4B]"; ratingIcon = "✓";
    } else if (rating === "average") {
      ratingBg = "bg-[#FFE082]"; ratingText = "text-[#BF741F]"; ratingIcon = "–";
    } else {
      ratingBg = "bg-[#FFCDD2]"; ratingText = "text-[#C62828]"; ratingIcon = "✕";
    }

    const cardElement = document.createElement("div");
    cardElement.className = `relative rounded-lg overflow-hidden glass shadow-lg aspect-[3/4] flex flex-col transition-all duration-300 ${isPreview ? "" : "blur-md"}`;

    cardElement.innerHTML = `
      <div class="w-full text-center py-1.5 text-xs font-bold uppercase tracking-wider bg-[#424242] text-white">${style}</div>
      <div class="flex-grow w-full relative overflow-hidden bg-gray-300">
        ${isPreview ? `<img src="${data.previewUrl}" class="w-full h-full object-cover" alt="${style}">` : `<div class="w-full h-full bg-gradient-to-br from-gray-400 to-gray-500"></div>`}
        ${!isPreview ? `<div class="absolute inset-0 flex items-center justify-center bg-black bg-opacity-40"><svg class="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M5 9a2 2 0 114 0 2 2 0 01-4 0z"/><path fill-rule="evenodd" d="M0 10a10 10 0 1120 0 10 10 0 01-20 0zm10-8a2 2 0 100 4 2 2 0 000-4zm0 10a4 4 0 100-8 4 4 0 000 8z"/></svg></div>` : ""}
      </div>
      <div class="w-full flex items-center justify-center gap-1 py-1.5 text-xs font-bold ${ratingBg}">
        <span>${ratingIcon}</span><span class="${ratingText}">${rating.toUpperCase()}</span>
      </div>
    `;
    container.appendChild(cardElement);
  });
}

// Paid render: replace grid with single comparison image
function renderComparison(comparisonUrl) {
  const container = document.getElementById("resultsGrid");
  container.innerHTML = "";
  container.className = "w-full flex justify-center";
  container.innerHTML = `<img src="${comparisonUrl}" class="w-full max-w-3xl rounded-xl shadow-2xl" alt="Outfit comparison card">`;
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
            <div class="w-8 h-8 rounded-full" style="background-color: #E8DFD0;"></div>
            <div class="w-8 h-8 rounded-full" style="background-color: #A0896A;"></div>
            <div class="w-8 h-8 rounded-full" style="background-color: #5C5A5A;"></div>
            <div class="w-8 h-8 rounded-full" style="background-color: #8C8C8C;"></div>
            <div class="w-8 h-8 rounded-full" style="background-color: #EFEFEF;"></div>
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

    renderGrid(data);
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

// Unlock button handler (simulating payment success)
document.getElementById('unlockBtn')?.addEventListener('click', async function() {
  if (!currentSessionId) return alert("Session expired. Please upload again.");

  this.disabled = true;
  this.textContent = "Generating full report...";

  try {
    const res = await fetch("http://localhost:5000/api/generate/full", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: currentSessionId })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Generation failed");
    }

    renderComparison(data.comparisonUrl);

    this.textContent = "All styles unlocked!";
    this.disabled = true;

  } catch (error) {
    console.error("Error:", error);
    alert(`Error: ${error.message}`);
    this.disabled = false;
    this.textContent = "Unlock Full Report";
  }
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