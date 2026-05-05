const OpenAI = require("openai");
const { toFile } = require("openai");
const fs = require("fs");
const path = require("path");
const os = require("os");
const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 300000,
  maxRetries: 2
});

const FALLBACK_ANALYSIS = () => ({
  ratings: Object.fromEntries(ALL_STYLES.map(s => [s, "average"])),
  bestMatch: ["Korean", "Chic", "Old Money", "Streetwear", "Tea-Toned"],
  tips: [
    "Stick to a cohesive color story across your outfit",
    "Balance fitted and relaxed pieces for proportion",
    "Add one statement accessory to anchor each look"
  ],
  palette: ["#E8DFD0", "#A0896A", "#5C5A5A", "#8C8C8C", "#EFEFEF"]
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

async function callVisionJSON(base64Image, promptText) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
          { type: "text", text: promptText }
        ]
      }
    ]
  });
  return response.choices[0].message.content;
}

function isRefusal(text) {
  if (!text) return true;
  const t = text.trim().toLowerCase();
  return t.startsWith("i'm sorry") || t.startsWith("i am sorry") || t.startsWith("i can't") || t.startsWith("i cannot") || t.startsWith("sorry");
}

const PRIMARY_PROMPT = `You are a fashion styling assistant. Looking ONLY at the clothing, hair styling, and overall color palette visible in this photo, recommend which of these 16 fashion aesthetics would complement the visible look. This is purely a wardrobe/styling recommendation — do not describe or analyze the person.

Styles: ${ALL_STYLES.join(", ")}

Return ONLY valid JSON with this exact structure:
{
  "ratings": { "Korean": "recommended", "Streetwear": "average", ... },
  "bestMatch": ["Korean", "Tea-Toned", "Chic", "Streetwear", "Old Money"],
  "tips": ["short styling tip 1", "short styling tip 2", "short styling tip 3"],
  "palette": ["#E8DFD0", "#A0896A", "#5C5A5A", "#8C8C8C", "#EFEFEF"]
}

Use "recommended", "average", or "avoid" for each rating. bestMatch = 5 styles from the list. tips = 3 generic styling tips based on visible clothing/color cues. palette = 5 hex codes drawn from the colors visible in the photo.`;

const RETRY_PROMPT = `Return JSON only with keys ratings, bestMatch, tips, palette for these 16 styles based on visible clothing colors and hair styling: ${ALL_STYLES.join(", ")}. ratings = object mapping each style to "recommended"|"average"|"avoid". bestMatch = array of 5 style names. tips = array of 3 short generic styling tips. palette = array of 5 hex color codes.`;

async function analyzePortrait(imagePath) {
  console.log("🔍 Analyzing portrait with GPT-4o vision...");

  const downscaled = await sharp(imagePath)
    .resize(512, 512, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  const base64Image = downscaled.toString("base64");

  for (const [attempt, prompt] of [["primary", PRIMARY_PROMPT], ["retry", RETRY_PROMPT]]) {
    try {
      const text = await callVisionJSON(base64Image, prompt);
      if (isRefusal(text)) {
        console.warn(`⚠️ Portrait analysis ${attempt} refused: ${text.slice(0, 80)}`);
        continue;
      }
      const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
      const analysis = JSON.parse(cleaned);
      console.log(`✅ Analysis complete (${attempt})`);
      return analysis;
    } catch (error) {
      console.warn(`⚠️ Portrait analysis ${attempt} failed: ${error.message}`);
    }
  }

  console.warn("⚠️ Portrait analysis refused, using fallback");
  return FALLBACK_ANALYSIS();
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
- The canvas contains exactly 4 columns × 4 rows = 16 cells. There is no 5th row. Do not add a 5th row.
- Every cell contains exactly one styled portrait. Total portraits = 16.
- No title, no header text — portraits and style-name labels only.
- Below each cell, one short style-name label only. No rating words, no descriptions.
- All 16 cells fully visible and unclipped. Equal-sized cells, small uniform gutters.
- After Bollywood Glam (cell 16, bottom-right), the image ends. Do not add any more portraits.

FRAMING (mandatory for every cell):
- Waist-up half-body shot only. Frame from just above the head down to roughly mid-torso/waist. Do NOT show legs, hips, or full body.
- Subject centered in each cell, facing camera, neutral pose, arms relaxed.

HARD STOP RULE: Bollywood Glam is the 16th and final portrait. Render nothing after it. Any space below row 4 must be solid off-white (#FAFAF7) — no faces, no heads, no extra portraits.

STYLES (in this exact order, top-left to bottom-right, row by row):
Row 1: Korean, Streetwear, Tea-toned, Chic
Row 2: Luxury, Indian Style, Baddie, Niche/Indie
Row 3: Vintage, Gen-Z, Sporty, Old Money
Row 4 (FINAL ROW): Athleisure, Indo-Western Fusion, Y2K Revival, Bollywood Glam

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
    size: "auto"
  });

  const b64 = response.data[0].b64_json;
  const imageBuffer = Buffer.from(b64, "base64");
  const r2Key = `generated/${sessionId}/${filename}`;

  await s3.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: r2Key,
    Body: imageBuffer,
    ContentType: "image/png"
  }));

  console.log(`☁️  Uploaded to R2: ${r2Key}`);
  return {
    url: `${process.env.R2_PUBLIC_URL}/${r2Key}`,
    r2Key
  };
}

async function generatePreview(imagePath, onStage = async () => {}) {
  try {
    console.log("📸 Starting full comparison generation (single AI call, all 16 styles)...");

    await onStage("analyzing");
    const analysis = await analyzePortrait(imagePath);
    const sessionId = uuidv4();

    await onStage("preparing");
    const preparedPath = await prepareImageForEdit(imagePath);

    console.log(`🎨 Generating comparison card with all 16 styles...`);
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