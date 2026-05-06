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

async function cropFaceRegion(preparedPath) {
  const outPath = path.join(os.tmpdir(), `face-${uuidv4()}.png`);
  const meta = await sharp(preparedPath).metadata();
  const cropSide = Math.min(meta.width, Math.round(meta.height * 0.55));
  const left = Math.round((meta.width - cropSide) / 2);
  const top = Math.round(meta.height * 0.05);

  await sharp(preparedPath)
    .extract({ left, top, width: cropSide, height: cropSide })
    .resize(1024, 1024, { fit: "cover" })
    .png()
    .toFile(outPath);

  console.log(`🔍 Face reference crop: ${outPath}`);
  return outPath;
}

const COMPARISON_PROMPT = `Create a high-resolution fashion collage using the provided reference images.

IDENTITY LOCK — HIGHEST PRIORITY:
The person in every cell MUST be exactly the same person from the reference photos.

Treat the face as immutable reference content; only the outfit and styling are editable.

Preserve exactly:
- eye shape, eye size, eye spacing, iris color
- nose bridge, nostril width, nose tip shape
- lip shape, lip fullness, mouth width
- jawline, chin shape, cheekbone structure
- eyebrow shape and density
- ear shape and placement
- skin tone, skin texture, pores, under-eye shape, natural asymmetry
- facial proportions and overall head shape
- apparent age, ethnicity, and gender presentation
- natural hairline

Hard identity rules:
- Do NOT beautify the face.
- Do NOT glamorize the face.
- Do NOT replace the face with a generic attractive face.
- Do NOT alter facial proportions.
- Do NOT slim the face.
- Do NOT smooth skin excessively.
- Do NOT sharpen or stylize facial features.
- Do NOT make the person look younger or older.
- Do NOT increase facial symmetry.
- Do NOT re-render the face from scratch.
- Do NOT apply “AI beauty filter” aesthetics.
- Do NOT modify the identity for cinematic or editorial styling.
- Keep facial geometry identical across all 16 cells.

FACE CONSISTENCY RULE:
The face must remain visually identical in every cell.
Only these elements may change:
- clothing
- hairstyle
- accessories
- makeup styling
- lighting on clothing/background only

The identity must remain stable across all 16 portraits.

REFERENCE PRIORITY:
Use the uploaded images as hard identity references.
The tight face crop is for identity preservation only.
Do not reinterpret or redesign the face.

LAYOUT (mandatory):
- 4 columns × 4 rows = 16 cells exactly
- No extra row
- No cropped cells
- Equal-sized cells with uniform spacing
- Clean off-white background (#FAFAF7)

HEADER:
Top centered title:
“Outfit Analysis”

Typography:
- refined serif italic
- elegant editorial style
- dark ink color
- centered in top header band

CELL STRUCTURE:
Each cell contains:
- one waist-up portrait
- one short style-name label below

No descriptions.
No ratings.
No extra text.

FRAMING:
- waist-up half-body framing only
- subject centered
- facing camera
- neutral relaxed pose
- from slightly above head down to mid-torso/waist
- no full-body framing
- no dramatic perspective distortion

BACKGROUND:
- seamless off-white studio background (#FAFAF7)
- identical background in every cell
- minimal editorial studio aesthetic

LIGHTING:
- soft daylight-balanced studio lighting (~5500K)
- bright high-key studio setup
- soft natural shadows
- consistent brightness and white balance across all 16 cells

IMPORTANT:
Apply lighting adjustments only to clothing and environment.
Preserve the original facial identity and facial structure.
Do not use studio lighting as justification to redesign facial features.

STYLES (left-to-right, top-to-bottom):

Row 1:
1. Korean
2. Streetwear
3. Tea-toned
4. Chic

Row 2:
5. Luxury
6. Indian Style
7. Baddie
8. Niche/Indie

Row 3:
9. Vintage
10. Gen-Z
11. Sporty
12. Old Money

Row 4:
13. Athleisure
14. Indo-Western Fusion
15. Y2K Revival
16. Bollywood Glam

STYLE EXECUTION:
Each style should differ through:
- clothing
- color palette
- layering
- accessories
- hairstyle
- fashion mood

But NEVER through facial redesign.

QUALITY TARGET:
Photorealistic.
Identity-preserving.
Editorial fashion collage.
Clean composition.
Consistent studio presentation.
Natural human realism.
No uncanny AI face artifacts.`;

async function runImageEdit(referencePaths, prompt, sessionId, filename) {
  const files = await Promise.all(
    referencePaths.map((p, i) =>
      toFile(fs.readFileSync(p), `ref-${i}.png`, { type: "image/png" })
    )
  );

  const response = await openai.images.edit({
    model: "gpt-image-1.5",
    image: files,
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
    url: `/${r2Key}`,
    r2Key
  };
}

async function generatePreview(imagePath, onStage = async () => { }) {
  try {
    console.log("📸 Starting full comparison generation (single AI call, all 16 styles)...");

    await onStage("analyzing");
    const analysis = await analyzePortrait(imagePath);
    const sessionId = uuidv4();

    await onStage("preparing");
    const preparedPath = await prepareImageForEdit(imagePath);
    const facePath = await cropFaceRegion(preparedPath);

    console.log(`🎨 Generating comparison card with all 16 styles...`);
    await onStage("generating");
    const { url: comparisonUrl } = await runImageEdit(
      [preparedPath, facePath],
      COMPARISON_PROMPT,
      sessionId,
      "comparison.png"
    );

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