// Show the upload button only when a file is actually selected
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

// Basic device fingerprinting for rate limiting
function getFingerprint() {
  return btoa(
    navigator.userAgent +
    screen.width +
    screen.height +
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
}

// Hard-bind the click event to prevent ANY native browser reloading
document.getElementById('uploadBtn').addEventListener('click', async function(event) {
  // 1. STOP THE REFRESH
  event.preventDefault();
  event.stopPropagation();

  const fileInput = document.getElementById("fileInput");
  const file = fileInput.files[0];
  
  if (!file) return alert("Please select an image first.");

  console.log("[Network] Starting upload sequence. Page reload blocked.");

  const formData = new FormData();
  formData.append("image", file);

  // UI Setup: Hide upload, show loading
  document.getElementById("uploadSection").classList.add("hidden");
  document.getElementById("loadingState").classList.remove("hidden");
  document.getElementById("resultsSection").classList.add("hidden");
  document.getElementById("unlockSection").classList.add("hidden");

  // --- Dynamic Loader Text Logic ---
  const loadingText = document.getElementById("loadingText");
  const progressMessages = [
    "Uploading your portrait...",
    "Connecting to MeetWave AI servers...",
    "Generating Urban Streetwear...",
    "Generating Preppy Academia...",
    "Generating Athletic Wear...",
    "Applying final premium polish..."
  ];
  let msgIndex = 0;
  const progressInterval = setInterval(() => {
    msgIndex = (msgIndex + 1) % progressMessages.length;
    loadingText.textContent = progressMessages[msgIndex];
    console.log(`[UI Status] ${progressMessages[msgIndex]}`);
  }, 2500); 

  try {
    console.log("[Network] Sending POST request to backend API...");
    
    const res = await fetch("http://localhost:5000/api/generate", {
      method: "POST",
      headers: {
        "x-fingerprint": getFingerprint()
      },
      body: formData
    });

    const data = await res.json();
    console.log("[Network] Response received:", { status: res.status, data });

    if (!res.ok) {
      throw new Error(data.message || data.error || "Generation failed");
    }

    // Stop the progress interval
    clearInterval(progressInterval);
    console.log("[UI] Images generated successfully. Rendering grid...");

    // UI Setup: Hide loading, show results
    document.getElementById("loadingState").classList.add("hidden");
    document.getElementById("resultsSection").classList.remove("hidden");
    document.getElementById("resultsSection").classList.add("flex"); 
    
    const container = document.getElementById("resultsGrid");
    container.innerHTML = ""; 
    
    // OVERRIDE: Force a tight, 3-column grid with a max width so it stays compact and premium
    container.className = "grid grid-cols-3 gap-2 md:gap-4 w-full max-w-3xl mx-auto";

    // The data defining our UI layout mapping
    const recommendations = ["RECOMMENDED", "AVERAGE", "AVOID"];
    const styles = ["Streetwear", "Preppy", "Sporty"]; // Shortened text to fit smaller cards
    
    // Define style color mapping inspired by sample
    const styleColors = ["bg-[#424242]", "bg-[#966245]", "bg-[#EFEFEF]"];
    const styleTextColors = ["text-white", "text-black", "text-black"];

    // Map over the array of 3 image URLs
    data.previews.forEach((imgUrl, index) => {
      
      // Determine colors and scaled-down icons based on recommendation state
      let recBg, recText, recIcon;
      if (index === 0) { // Recommended (e.g. green check)
        recBg = "bg-[#C8E6C9]";
        recText = "text-[#398E4B]";
        recIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 md:h-4 md:w-4" viewBox="0 0 20 20" fill="#398E4B"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>`;
      } else if (index === 1) { // Average (e.g. orange dash)
        recBg = "bg-[#FFE082]";
        recText = "text-[#BF741F]";
        recIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 md:h-4 md:w-4" viewBox="0 0 20 20" fill="#FF9800"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM6 10a1 1 0 110-2h8a1 1 0 110 2H6z" clip-rule="evenodd" /></svg>`;
      } else { // Avoid (e.g. red X)
        recBg = "bg-[#FFCDD2]";
        recText = "text-[#C62828]";
        recIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 md:h-4 md:w-4" viewBox="0 0 20 20" fill="#C62828"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" /></svg>`;
      }

      const card = document.createElement("div");
      // Kept aspect-[3/4] but inside a restricted grid, it becomes compact
      card.className = "flex flex-col relative rounded-xl md:rounded-3xl overflow-hidden glass shadow-xl transition-transform hover:scale-105 duration-300 w-full aspect-[3/4]";
      
      card.innerHTML = `
        <!-- Top Style Label Bar (Thinner padding, smaller text) -->
        <div class="w-full text-center py-1.5 md:py-2 text-[9px] md:text-xs font-bold uppercase tracking-wider ${styleTextColors[index]} ${styleColors[index]}">
          ${styles[index]}
        </div>

        <!-- Image Area -->
        <div class="flex-grow w-full relative overflow-hidden">
          <img src="${imgUrl}" class="w-full h-full object-cover" alt="${styles[index]} Outfit">
        </div>

        <!-- Bottom Recommendation Bar (Thinner padding, smaller text) -->
        <div class="w-full flex items-center justify-center gap-1 md:gap-2 py-1.5 md:py-2 text-center ${recBg}">
          ${recIcon}
          <span class="text-[9px] md:text-xs font-bold ${recText}">
            ${recommendations[index]}
          </span>
        </div>
      `;
      
      container.appendChild(card);
    });

    // Reveal the upsell section
    document.getElementById("unlockSection").classList.remove("hidden");

  } catch (error) {
    clearInterval(progressInterval); 
    console.error("[CRITICAL ERROR]", error);
    alert(`Error: ${error.message}`);
    
    document.getElementById("loadingState").classList.add("hidden");
    document.getElementById("uploadSection").classList.remove("hidden");
  }
});