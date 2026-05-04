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
  "Chanel-Inspired",
  "Soft Feminine",
  "Baddie",
  "Niche/Indie",
  "Vintage",
  "Preppy/Academia",
  "Sporty",
  "Old Money"
];

const STYLE_DESCRIPTIONS = {
  "Korean": "minimalist Korean fashion with clean lines, earthy tones, and effortless elegance",
  "Streetwear": "trendy urban streetwear with oversized silhouettes and bold graphics",
  "Tea-Toned": "warm tea-toned earth tones with vintage-inspired cuts",
  "Chic": "sophisticated chic style with tailored fits and neutral palette",
  "Chanel-Inspired": "classic Chanel-inspired luxury with tweed and pearls",
  "Soft Feminine": "soft feminine style with delicate fabrics and pastel colors",
  "Baddie": "bold baddie aesthetic with dark colors and edgy attitude",
  "Niche/Indie": "indie alternative style with vintage band tees and eclectic pieces",
  "Vintage": "classic vintage style from the 1970s-1990s era",
  "Preppy/Academia": "preppy academia style with structured blazers and classic cuts",
  "Sporty": "athletic sporty style with performance wear and casual comfort",
  "Old Money": "old money quiet luxury style with understated elegance and expensive basics"
};

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
  const meta = await sharp(imagePath).metadata();
  const stats = fs.statSync(imagePath);
  const isPng = meta.format === "png";
  const isSquare = meta.width === meta.height;
  const underLimit = stats.size < 4 * 1024 * 1024;

  if (isPng && underLimit) return imagePath;

  const outPath = path.join(os.tmpdir(), `prepared-${uuidv4()}.png`);
  await sharp(imagePath)
    .resize(1024, 1536, { fit: "cover", position: "centre" })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log(`🖼️  Converted upload to square PNG: ${outPath}`);
  return outPath;
}

const FREE_TIER_STYLE = "Niche/Indie";

const COMPARISON_PROMPT = `Outfit Analysis: Please use the portrait photo I've uploaded to create a high-quality personal outfit analysis card. Style categories to include: Korean, Streetwear, Tea-toned, Chic, Chanel-inspired, Indian Style, Baddie, Niche/Indie, Vintage, Gen-Z Style Clothing, and Sporty. Preserve the subject's original facial features, skin tone, face shape, and real characteristics. Using a side-by-side comparison layout, show the effect of different outfits on the subject, clearly distinguishing between styles, making it immediately obvious which looks enhance the complexion and elevate overall quality. The layout should be clean and fashionable, resembling a professional image consultant report, visually driven throughout, using only short labels (e.g.: Recommended, Average, Avoid), with no lengthy body text. High resolution, information clearly presented, suitable for sharing on social media.`;

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
    url: `http://localhost:5000/generated/${sessionId}/${filename}`,
    imagePath: filepath
  };
}

async function generatePreview(imagePath) {
  try {
    console.log("📸 Starting full comparison generation (single AI call, all 12 styles)...");

    const analysis = await analyzePortrait(imagePath);
    const sessionId = uuidv4();
    const preparedPath = await prepareImageForEdit(imagePath);

    console.log(`🎨 Generating comparison card with all 12 styles...`);
    const { url: comparisonUrl } = await runImageEdit(preparedPath, COMPARISON_PROMPT, sessionId, "comparison.png");

    console.log("✅ Comparison card generated");
    return {
      sessionId,
      comparisonUrl,
      allStyles: ALL_STYLES,
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