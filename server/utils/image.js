const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// We still accept imagePath from the route, but we won't pass it to OpenAI for now
async function generatePreview(imagePath) {
  try {
    console.log("MVP Mode: Using standard DALL-E 2 for system plumbing...");

    const styles = [
      "trendy urban streetwear, oversized hoodie, cargo pants",
      "preppy academia clothing, tweed blazer, turtleneck",
      "sleek athletic athleisure wear, running jacket"
    ];

    // Generate the 3 style images in parallel
    const generationPromises = styles.map(async (style) => {
      // Standard text-to-image prompt without vision/face mapping
      const prompt = `A highly realistic fashion photography portrait of a person wearing ${style}. Clean studio lighting, photorealistic, premium aesthetic.`;

      try {
        const response = await openai.images.generate({
          model: "dall-e-2", // Cheap, fast, universally available
          prompt: prompt,
          n: 1,
          size: "512x512" // Keeping it small to save you API credits during testing
        });

        // Return the standard URL
        return response.data[0].url;
        
      } catch (error) {
        console.error(`OpenAI MVP Generation Error for style [${style}]:`, error.message);
        return null; 
      }
    });

    const results = await Promise.all(generationPromises);
    
    // Filter out any nulls
    const validResults = results.filter(url => url !== null);

    if (validResults.length === 0) {
      throw new Error("All MVP OpenAI generations failed.");
    }

    return validResults;

  } catch (error) {
    console.error("Critical error in generatePreview MVP:", error.message);
    throw error;
  }
}

module.exports = { generatePreview };