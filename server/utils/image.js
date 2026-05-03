const OpenAI = require("openai");
const { toFile } = require("openai");
const fs = require("fs");
const path = require("path");
const os = require("os");
const sharp = require("sharp");
const { v4: uuidv4 } = require("uuid");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
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

    const imageData = fs.readFileSync(imagePath);
    const base64Image = imageData.toString("base64");

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
  ]
}

Use "recommended", "average", or "avoid" for each rating. bestMatch should be 5 styles. Tips should be 3 specific grooming/style tips.`
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

  if (isPng && isSquare && underLimit) return imagePath;

  const outPath = path.join(os.tmpdir(), `prepared-${uuidv4()}.png`);
  const size = Math.min(1024, Math.min(meta.width, meta.height));
  await sharp(imagePath)
    .resize(size, size, { fit: "cover", position: "centre" })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  console.log(`🖼️  Converted upload to square PNG: ${outPath}`);
  return outPath;
}

async function generateImagesForStyles(imagePath, stylesToGenerate, sessionId) {
  try {
    console.log(`🎨 Generating images for ${stylesToGenerate.length} styles with dall-e-2...`);

    const preparedPath = await prepareImageForEdit(imagePath);
    const preparedBuffer = fs.readFileSync(preparedPath);

    const generationPromises = stylesToGenerate.map(async (styleName) => {
      try {
        const description = STYLE_DESCRIPTIONS[styleName];
        const prompt = `Transform this person wearing ${description}. Keep the face and facial features identical. Realistic fashion photography, studio lighting, professional quality, upper body visible.`;

        const response = await openai.images.edit({
          model: "dall-e-2",
          image: await toFile(preparedBuffer, "portrait.png", { type: "image/png" }),
          prompt: prompt,
          n: 1,
          size: "1024x1024",
          response_format: "b64_json"
        });

        const b64 = response.data[0].b64_json;
        const filename = `${styleName.toLowerCase().replace(/\//g, "-")}.png`;
        const filepath = path.join("uploads", "generated", sessionId, filename);

        // Ensure directory exists
        const dir = path.dirname(filepath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Save base64 as PNG
        fs.writeFileSync(filepath, Buffer.from(b64, "base64"));

        return {
          style: styleName,
          url: `/generated/${sessionId}/${filename}`,
          imagePath: filepath
        };
      } catch (error) {
        console.error(`❌ Generation failed for ${styleName}:`, error.message);
        return null;
      }
    });

    const results = await Promise.allSettled(generationPromises);
    const validResults = results
      .map(r => r.status === "fulfilled" ? r.value : null)
      .filter(r => r !== null);

    if (validResults.length === 0) {
      throw new Error("All image generations failed");
    }

    console.log(`✅ Generated ${validResults.length}/${stylesToGenerate.length} images`);
    return validResults;
  } catch (error) {
    console.error("❌ Image generation error:", error.message);
    throw error;
  }
}

async function generatePreview(imagePath) {
  try {
    console.log("📸 Starting free preview generation (3 images)...");

    // Step 1: Analyze portrait
    const analysis = await analyzePortrait(imagePath);

    // Step 2: Pick 1 recommended, 1 average, 1 avoid
    const ratings = analysis.ratings;
    const recommended = Object.keys(ratings).find(s => ratings[s] === "recommended");
    const average = Object.keys(ratings).find(s => ratings[s] === "average");
    const avoid = Object.keys(ratings).find(s => ratings[s] === "avoid");

    const stylesToGenerate = [recommended, average, avoid].filter(Boolean);

    // Step 3: Generate session directory
    const sessionId = uuidv4();
    const generatedImages = await generateImagesForStyles(imagePath, stylesToGenerate, sessionId);

    // Step 4: Add ratings to each image
    const previewsWithRatings = generatedImages.map(img => ({
      ...img,
      rating: ratings[img.style]
    }));

    return {
      sessionId,
      previews: previewsWithRatings,
      allStyles: ALL_STYLES,
      ratings,
      bestMatch: analysis.bestMatch,
      tips: analysis.tips
    };
  } catch (error) {
    console.error("❌ Preview generation failed:", error.message);
    throw error;
  }
}

async function generateFull(imagePath, sessionId, ratings) {
  try {
    console.log("🎨 Generating remaining 9 images for paid tier...");

    const previewedStyles = new Set();
    const generatedDir = path.join("uploads", "generated", sessionId);

    if (fs.existsSync(generatedDir)) {
      fs.readdirSync(generatedDir).forEach(file => {
        const styleName = file.replace(".png", "").replace(/-/g, "/");
        previewedStyles.add(styleName);
      });
    }

    const remainingStyles = ALL_STYLES.filter(s => !previewedStyles.has(s));

    const fullImages = await generateImagesForStyles(imagePath, remainingStyles, sessionId);

    return fullImages.map(img => ({
      ...img,
      rating: ratings[img.style]
    }));
  } catch (error) {
    console.error("❌ Full generation failed:", error.message);
    throw error;
  }
}

module.exports = { generatePreview, generateFull };