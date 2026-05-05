const OpenAI = require("openai");
const { toFile } = require("openai");
const fs = require("fs");
const path = require("path");
const os = require("os");
const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60000,
  maxRetries: 2
});

const ALL_STYLES = [
  "Korean",
  "Streetwear",
  "Tea-Toned",
  "Chic",
  "Premium Clothing",
  "Indian Style",
  "Baddie",
  "Niche/Indie",
  "Vintage",
  "Gen-Z",
  "Sporty",
  "Old Money",
  "Athleisure",
  "Indo-Western Fusion",
  "Y2K Revival",
  "Bollywood Glam"
];

async function analyzePortrait(imagePath) {
  try {
    console.log("🔍 Analyzing portrait with GPT-4o vision...");

    const downscaled = await sharp(imagePath)
      .resize(512, 512, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    const base64Image = downscaled.toString("base64");

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            },
            {
              type: "text",
              text: `You are a fashion stylist assistant. Based on the general visual cues in this photo (overall coloring, hair, clothing style), suggest which of these 12 fashion aesthetics would visually complement the look. This is a styling recommendation tool, not a personal analysis.

Styles: ${ALL_STYLES.join(", ")}

Return ONLY valid JSON (no markdown, no code blocks) with this exact structure:
{
  "ratings": {
    "Korean": "recommended",
    "Streetwear": "recommended",
    ...
  },
  "bestMatch": ["Korean", "Tea-Toned", "Chic", "Streetwear", "Preppy/Academia"],
  "tips": [
    "Keep hair volume natural and slightly tousled",
    "Earth tones & neutrals suit you best",
    "Well-groomed appearance enhances overall look"
  ],
  "palette": ["#E8DFD0", "#A0896A", "#5C5A5A", "#8C8C8C", "#EFEFEF"]
}

Use "recommended", "average", or "avoid" for each rating. bestMatch should be 5 styles. Tips should be 3 specific grooming/style tips tailored to this person. Palette should be 5 hex color codes that flatter this person's complexion and suit their best-match styles.`
            }
          ]
        }
      ]
    });

    const analysisText = response.choices[0].message.content;
    console.log("Raw response from GPT-4o:", analysisText);
    const cleanedText = analysisText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const analysis = JSON.parse(cleanedText);

    console.log("✅ Analysis complete");
    return analysis;
  } catch (error) {
    console.error("❌ Portrait analysis failed:", error.message);
    console.error("Error details:", JSON.stringify(error, null, 2));
    throw error;
  }
}

async function prepareImageForEdit(imagePath) {
  const outPath = path.join(os.tmpdir(), `prepared-${uuidv4()}.png`);

  const stats = await sharp(imagePath).stats();
  const meanLum = (stats.channels[0].mean + stats.channels[1].mean + stats.channels[2].mean) / 3;
  const TARGET_LUM = 165;
  const brightnessFactor = Math.max(0.85, Math.min(1.6, TARGET_LUM / Math.max(meanLum, 40)));

  await sharp(imagePath)
    .resize(1024, 1536, { fit: "cover", position: "centre" })
    .normalise()
    .linear(1.05, 0)
    .modulate({ brightness: brightnessFactor, saturation: 1.05 })
    .gamma(1.0)
    .toColorspace("srgb")
    .ensureAlpha()
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  console.log(`🖼️  Adaptive-normalized upload (meanLum=${meanLum.toFixed(0)} → factor=${brightnessFactor.toFixed(2)}): ${outPath}`);
  return outPath;
}

const COMPARISON_PROMPT = `Create a personal outfit analysis card from the uploaded portrait.

LAYOUT (mandatory):
- Exactly 16 panels arranged in a 4-column × 4-row grid. Every cell must be filled — no empty cells, no extra rows, no clipped panels.
- All 16 panels must be fully visible inside the canvas, with equal-sized cells and small uniform gutters.
- Off-white (#FAFAF7) seamless background behind every cell, identical across all 16.
- Title "Outfit Analysis Card" centered at top. Below each cell, a single short style-name label only — no rating words, no body text, no descriptions.

FRAMING (mandatory for every cell):
- Waist-up half-body shot only. Frame from just above the head down to roughly mid-torso/waist. Do NOT show legs, hips, or full body.
- Subject centered in each cell, facing camera, neutral pose, arms relaxed.

STYLES (in this exact order, top-left to bottom-right, row by row):
Row 1: Korean, Streetwear, Tea-toned, Chic
Row 2: Premium Clothing, Indian Style, Baddie, Niche/Indie
Row 3: Vintage, Gen-Z, Sporty, Old Money
Row 4: Athleisure, Indo-Western Fusion, Y2K Revival, Bollywood Glam

IDENTITY: Preserve the subject's facial features, skin tone, face shape, and hair across all 16 cells. Same person, 16 different outfits.

LIGHTING & COLOR (mandatory — DO NOT inherit from input):
- Bright, high-key studio photography. Daylight-balanced (~5500K). Soft, even shadows.
- Off-white (#FAFAF7) seamless background in every cell, identical across all 16.
- Identical brightness, contrast, saturation, and white balance in every cell.
- Treat the input photo ONLY as a reference for the subject's identity. Discard its lighting, ambient color, background, and tone entirely.
- Outfits must look freshly photographed in a controlled studio — never dim, warm-cast, low-key, or environmental.

Clean, fashionable, magazine-quality. High resolution. Suitable for sharing.`;

async function runImageEdit(preparedPath, prompt, sessionId, filename) {
  const preparedBuffer = fs.readFileSync(preparedPath);

  const response = await openai.images.edit({
    model: "gpt-image-1.5",
    image: await toFile(preparedBuffer, "portrait.png", { type: "image/png" }),
    prompt,
    n: 1,
    size: "1024x1536"
  });

  const b64 = response.data[0].b64_json;
  const filepath = path.join("uploads", "generated", sessionId, filename);
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filepath, Buffer.from(b64, "base64"));

  return {
    url: `/generated/${sessionId}/${filename}`,
    imagePath: filepath
  };
}

async function generatePreview(imagePath, onStage = async () => {}) {
  try {
    console.log("📸 Starting full comparison generation (single AI call, all 12 styles)...");

    await onStage("analyzing");
    const analysis = await analyzePortrait(imagePath);
    const sessionId = uuidv4();

    await onStage("preparing");
    const preparedPath = await prepareImageForEdit(imagePath);

    console.log(`🎨 Generating comparison card with all 12 styles...`);
    await onStage("generating");
    const { url: comparisonUrl } = await runImageEdit(preparedPath, COMPARISON_PROMPT, sessionId, "comparison.png");

    console.log("✅ Comparison card generated");
    return {
      sessionId,
      comparisonUrl,
      ratings: analysis.ratings,
      bestMatch: analysis.bestMatch,
      tips: analysis.tips,
      palette: analysis.palette
    };
  } catch (error) {
    console.error("❌ Preview generation failed:", error.message);
    throw error;
  }
}

module.exports = { generatePreview };