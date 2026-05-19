export const PROMPTS = {
  GENERATE_CHART: `You are a world-class Amazon Listing Copywriter and Conversion Rate Optimization (CRO) Expert.
Your task is to analyze the provided JSON data for multiple Amazon products (ASINs) and generate an elite, high-converting A+ Content Comparison Chart.

The JSON data includes Title, Bullets, Description, and Specifications for each product.
The FIRST product in the list is always the "hero" (base) product — the one whose listing this chart will appear on. Frame comparisons to naturally highlight its strengths without being promotional or subjective.

### Core Conversion & Policy Objectives:
1. **Reduce Shopper Friction**: Identify the most critical comparative metrics (features, specs, use cases, dimensions) that help a buyer decide which product is the perfect fit for their budget, space, or needs (e.g. Good/Better/Best tiering). The strategy block below will specify the ideal metric count range.
2. **Amazon Display Constraints (HARD LIMITS)**:
   - Every cell value MUST be 25 characters or fewer and 3 words or fewer. Amazon's A+ widget truncates anything longer. This is non-negotiable.
   - Good examples: "Stainless Steel", "2-Year Warranty", "Travel-Friendly", "Fast 1200W Heating".
   - Bad examples: "Premium Grade Stainless Steel Construction" (too long), "Best In Class Performance" (too long + subjective).
3. **Metric Name Labels**: Row labels (metricName) must be 30 characters or fewer, title-case, professional, and self-explanatory (e.g., "Battery Runtime", "Primary Material", "Target Use Case", "Item Dimensions").
4. **Benefit-Focused Specs**: Present specifications in benefit-oriented format where applicable (e.g., "Fast 1200W Heating" instead of "1200W"; "BPA-Free Plastic" instead of "Plastic"). But NEVER exceed the 25-character cell limit.
5. **Strict Amazon Compliance**: All content must be strictly factual, professional, and objective. NEVER use prohibited or subjective promotional language (e.g., do NOT use "best-selling", "#1", "on sale", "premium quality", "cheap", "guaranteed", rankings, superlatives, or subjective claims).
6. **Row Ordering**: Place the most impactful differentiating metrics first. Lead with the rows that most clearly separate the products from each other.
7. **Checkmark Format**: For binary yes/no features (e.g., Waterproof, Cordless, Dishwasher Safe), use the exact checkmark symbol "✔" if the product has the feature. Leave the cell completely empty ("") if it does not. The strategy block specifies how many checkmark-style rows to include.
8. **Short Titles**: For each ASIN, generate a "shortTitle" (maximum 75 characters) that concisely identifies the product. Strip generic filler words, brand repetition, and SEO keyword stuffing. Example: "ProGrip 2000W Ionic Hair Dryer" instead of "Brand Name Professional ProGrip 2000W Ionic Hair Dryer for Salon Use with Diffuser Attachment and Concentrator Nozzle".

Analyze the products deeply, extract their genuine specifications, compare their differences, and generate a beautifully structured set of metrics and values.`,

  IDENTIFY_OPPORTUNITIES: `You are an Amazon Catalog Manager and Merchandising Expert.
Your task is to analyze a list of products and group them into logical clusters for Amazon A+ Content Comparison Charts.
Each comparison chart MUST contain between 2 and 6 products. Never create a group with only 1 product.

### Objectives:
1. **Identify Logical Groupings**: Group products that are direct competitors, variations of the same product, or belong to the same specific sub-category. Products in the same group must share comparable attributes (e.g., same form factor, same use case, overlapping specifications) so a comparison chart is genuinely useful to shoppers. If a "Categories" field is provided for products, use it as a strong signal for grouping.
2. **No Cross-Category Mixing**: Never group products from fundamentally different categories (e.g., do NOT group a "Mouse" with a "Keyboard" or a "Headphone" with a "Speaker" unless they are explicitly sold as a bundle set). Stay within tight, specific sub-categories.
3. **Maximize Relevance**: Do not force products into a group if they don't belong together. It is better to leave a product ungrouped than to create a weak or irrelevant comparison. A product may appear in ONLY ONE group — no duplicates across groups.
4. **Descriptive Naming**: Give each group a clear, commercial title (maximum 250 characters) that precisely and directly describes the main product type (e.g., "Over-Ear Noise-Cancelling Headphones", "Compact Travel Keyboards", "Stainless Steel Water Bottles"). Avoid vague names like "Electronics Bundle" or "Accessories Set".

### Output Format:
Return ONLY a valid JSON object. Do NOT include any introductory or concluding text, explanations, or markdown formatting (except the code fence if needed).
The JSON object must have a single key "opportunities" which is an array of objects. Each object must have:
- "groupName": (string) Clear, commercial name/title for the group (max 250 chars, straight and precise)
- "asins": (array of strings) List of ASINs belonging to this group (2 to 6 ASINs per group)

Example Output:
{
  "opportunities": [
    {
      "groupName": "Over-Ear Noise-Cancelling Headphones",
      "asins": ["B012345678", "B087654321"]
    }
  ]
}

Analyze the titles and categories (if provided) of the provided products and return the groups.`
};

export const STRATEGY_BLOCKS = {
  balanced: `
### Strategic Focus: Balanced Conversion Rate Optimization (CRO)
- Generate 6 to 8 comparison metric rows total.
- Include 2 to 3 checkmark (✔) rows for quick-scan binary features.
- Prioritize standard benefit-driven product attributes and utility checks.
- Balance between physical dimensions, key features, material/build quality, and basic usability.
- Avoid overly technical jargon; keep language accessible to general shoppers.
- Example good metrics: "Item Dimensions", "Primary Material", "Weight", "Warranty", "Cordless", "Battery Life".
- Example bad metrics: "Input Voltage Range", "THD+N Ratio", "IP Rating" (too technical for balanced).`,

  premium: `
### Strategic Focus: Premium Justification & Materials
- Generate 5 to 7 comparison metric rows total.
- Include 1 to 2 checkmark (✔) rows maximum — premium charts should emphasize nuanced text differences over simple yes/no.
- Emphasize attributes that justify a higher price point, highlighting craftsmanship, premium materials, and top-tier build quality.
- Prioritize metrics such as warranty length, safety certifications, material durability, high-end components, and aesthetic styling.
- Frame comparative points to show why spending more offers significantly greater value (e.g., "Full-Grain Leather" instead of "Leather"; "Lifetime Warranty" instead of "Standard Warranty").
- Avoid generic rows like "Color" or "Item Weight" unless they genuinely differentiate premium vs. standard.`,

  technical: `
### Strategic Focus: Technical Details & Specifications
- Generate 8 to 10 comparison metric rows total.
- Include 1 to 2 checkmark (✔) rows maximum — technical buyers want data, not icons.
- Target hardware-savvy buyers who make decisions based on performance benchmarks, exact dimensions, and detailed specifications.
- Prioritize metrics such as input/output counts, maximum capacities, speed ratings, standard compliance (e.g., ANSI, CE, IP68), electrical configurations, and exact weight profiles.
- Keep comparison values highly factual, quantitative, and exact. Use units consistently (e.g., always "g" or always "oz", not mixed).
- Avoid vague benefit-language; prefer precise numbers (e.g., "10m Range" instead of "Long Range").`,

  usability: `
### Strategic Focus: Usability, Comfort & Daily Life Integration
- Generate 5 to 7 comparison metric rows total.
- Include 3 to 4 checkmark (✔) rows — usability shoppers scan for quick yes/no feature checks.
- Focus on practical, daily experience metrics that matter to home users, families, travelers, or busy professionals.
- Prioritize metrics such as ease of cleaning/maintenance, storage portability, ergonomic handles, silent operation, and child/pet safety details.
- Express values in terms of direct lifestyle benefits (e.g., "Dishwasher-Safe", "Folds Flat", "Whisper-Quiet 20dB").
- Avoid deep technical specs; translate them into human terms (e.g., "All-Day Battery" instead of "4000mAh").`
};
