/**
 * scripts/ai-provider.js
 * Unified factory for AI requests across OpenAI, Gemini, and Claude.
 */

import { PROMPTS, STRATEGY_BLOCKS } from './prompts.js';

export const AIProvider = {
    async fetchAI(settings, prompt, options = {}) {
        const platform = settings.aiPlatform;
        if (!platform) throw new Error("AI Platform not configured.");

        switch (platform) {
            case 'openai':
                return this.fetchOpenAI(settings.openai, prompt, options);
            case 'gemini':
                return this.fetchGemini(settings.gemini, prompt, options);
            case 'claude':
                return this.fetchClaude(settings.claude, prompt, options);
            default:
                throw new Error(`Unsupported AI platform: ${platform}`);
        }
    },

    async fetchOpenAI(config, prompt, options) {
        const { key, model = 'gpt-4o' } = config;
        if (!key) throw new Error("OpenAI API key missing.");

        const content = [];
        if (options.imageUrl) {
            content.push({ type: "text", text: prompt });
            content.push({ type: "image_url", image_url: { url: options.imageUrl } });
        } else {
            content.push({ type: "text", text: prompt });
        }

        const body = {
            model: model,
            messages: [{ role: "user", content: content }],
            temperature: 0.1
        };

        if (options.response_format) {
            body.response_format = options.response_format;
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${key}`
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw await AIProvider.handleResponseError(response, "OpenAI");
        }
        const data = await response.json();
        return data.choices[0].message.content;
    },

    async fetchGemini(config, prompt, options) {
        const { key, model = 'gemini-2.0-flash' } = config;
        if (!key) throw new Error("Gemini API key missing.");

        const parts = [{ text: prompt }];
        if (options.imageUrl) {
            const [mime, base64] = options.imageUrl.split(',');
            const mimeType = mime.split(':')[1].split(';')[0];
            parts.push({ inlineData: { mimeType: mimeType, data: base64 } });
        }

        const body = {
            contents: [{ parts: parts }],
            generationConfig: {
                temperature: 0.1
            }
        };

        if (options.responseSchema) {
            body.generationConfig.responseMimeType = "application/json";
            body.generationConfig.responseSchema = options.responseSchema;
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw await AIProvider.handleResponseError(response, "Gemini");
        }
        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    },

    async fetchClaude(config, prompt, options) {
        const { key, model = 'claude-3-5-sonnet-20241022' } = config;
        if (!key) throw new Error("Claude API key missing.");

        const body = {
            model: model,
            max_tokens: options.max_tokens || 4096,
            system: "You are a structured data generator. You MUST respond with ONLY a valid JSON object. No introductory text, no explanations, no markdown formatting — just the raw JSON object.",
            messages: [{ role: "user", content: prompt }]
        };

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': key,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw await AIProvider.handleResponseError(response, "Claude");
        }
        const data = await response.json();
        return data.content[0].text;
    },

    async generateChart(productData, settings, strategy = 'balanced') {
        const strategyInstructions = STRATEGY_BLOCKS[strategy] || STRATEGY_BLOCKS.balanced;
        const prompt = `${PROMPTS.GENERATE_CHART}\n\n${strategyInstructions}\n\nProduct Data:\n"""\n${JSON.stringify(productData, null, 2)}\n"""`;

        let options = {};
        const asinProperties = {};
        const shortTitleProperties = {};
        const requiredAsins = [];
        if (Array.isArray(productData)) {
            productData.forEach(p => {
                if (p.ASIN) {
                    const asinStr = String(p.ASIN).trim();
                    asinProperties[asinStr] = {
                        type: "string",
                        description: `Value of the comparison metric for ASIN ${asinStr}. Max 250 chars.`
                    };
                    shortTitleProperties[asinStr] = {
                        type: "string",
                        description: `Concise product title for ASIN ${asinStr}. Max 80 chars.`
                    };
                    requiredAsins.push(asinStr);
                }
            });
        }

        if (settings.aiPlatform === 'openai') {
            const schema = {
                type: "object",
                properties: {
                    metrics: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                metricName: { type: "string", description: "The name of the comparison metric. Max 30 chars, title-case." },
                                values: {
                                    type: "object",
                                    properties: asinProperties,
                                    required: requiredAsins,
                                    additionalProperties: false,
                                    description: "A mapping from ASIN to the value for this metric. Use '✔' for checkmarks, or short text (max 250 chars)."
                                }
                            },
                            required: ["metricName", "values"],
                            additionalProperties: false
                        }
                    },
                    shortTitles: {
                        type: "object",
                        properties: shortTitleProperties,
                        required: requiredAsins,
                        additionalProperties: false,
                        description: "A mapping from ASIN to a concise product title (max 80 chars). Strip SEO filler and brand repetition."
                    }
                },
                required: ["metrics", "shortTitles"],
                additionalProperties: false
            };
            options.response_format = { type: "json_schema", json_schema: { name: "chart_generation", strict: true, schema: schema } };
        } else if (settings.aiPlatform === 'gemini') {
            const schema = {
                type: "object",
                properties: {
                    metrics: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                metricName: { type: "string", description: "The name of the comparison metric. Max 30 chars, title-case." },
                                values: {
                                    type: "object",
                                    properties: asinProperties,
                                    required: requiredAsins,
                                    description: "A mapping from ASIN to the value for this metric. Use '✔' for checkmarks, or short text (max 250 chars)."
                                }
                            },
                            required: ["metricName", "values"]
                        }
                    },
                    shortTitles: {
                        type: "object",
                        properties: shortTitleProperties,
                        required: requiredAsins,
                        description: "A mapping from ASIN to a concise product title (max 80 chars). Strip SEO filler and brand repetition."
                    }
                },
                required: ["metrics", "shortTitles"]
            };
            options.responseSchema = schema;
        }

        const result = await this.fetchAI(settings, prompt, options);
        const parsed = this.parseJSON(result);

        // Return both metrics and shortTitles
        return {
            metrics: parsed.metrics || parsed,
            shortTitles: parsed.shortTitles || {}
        };
    },

    async identifyOpportunities(products, settings) {
        const prompt = `${PROMPTS.IDENTIFY_OPPORTUNITIES}\n\nHere are the products to analyze:\n${JSON.stringify(products, null, 2)}`;

        const options = {};

        if (settings.aiPlatform === 'openai') {
            const schema = {
                type: "object",
                properties: {
                    opportunities: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                groupName: { type: "string", description: "Clear, commercial name/title for the group. Max 250 chars, straight and precise description of main product." },
                                asins: {
                                    type: "array",
                                    items: { type: "string" },
                                    description: "List of ASINs belonging to this group"
                                }
                            },
                            required: ["groupName", "asins"],
                            additionalProperties: false
                        }
                    }
                },
                required: ["opportunities"],
                additionalProperties: false
            };
            options.response_format = { type: "json_schema", json_schema: { name: "identify_opportunities", strict: true, schema: schema } };
        } else if (settings.aiPlatform === 'gemini') {
            const schema = {
                type: "object",
                properties: {
                    opportunities: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                groupName: { type: "string", description: "Clear, commercial name/title for the group. Max 250 chars, straight and precise description of main product." },
                                asins: {
                                    type: "array",
                                    items: { type: "string" }
                                }
                            },
                            required: ["groupName", "asins"]
                        }
                    }
                },
                required: ["opportunities"]
            };
            options.responseSchema = schema;
        }

        const result = await this.fetchAI(settings, prompt, options);
        const parsed = this.parseJSON(result, "opportunities");

        // Validation Engine: Ensure we return an array of opportunities
        if (Array.isArray(parsed)) {
            return parsed;
        } else if (parsed && typeof parsed === 'object') {
            if (Array.isArray(parsed.opportunities)) return parsed.opportunities;
            if (Array.isArray(parsed.groups)) return parsed.groups;
            // If it's a single opportunity object, wrap it in an array
            if (parsed.groupName && Array.isArray(parsed.asins)) return [parsed];
        }

        throw new Error("AI response did not contain a valid list of opportunities.");
    },

    parseJSON(str, key = null) {
        try {
            let cleanStr = str.trim();
            // Find the first occurrence of '{' or '['
            const startIndex = cleanStr.search(/[\{\[]/);
            // Find the last occurrence of '}' or ']'
            const endIndex = Math.max(cleanStr.lastIndexOf('}'), cleanStr.lastIndexOf(']'));

            if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
                cleanStr = cleanStr.substring(startIndex, endIndex + 1);
            }

            const parsed = JSON.parse(cleanStr);
            if (key && parsed[key]) return parsed[key];
            return parsed;
        } catch (e) {
            console.error("AIProvider: Failed to parse AI response as JSON", str);
            throw new Error("AI returned invalid JSON.");
        }
    },

    async handleResponseError(response, platformName) {
        let errorMsg = response.statusText || `${response.status}`;
        try {
            // BUG-4: Clone before reading — a Response body can only be consumed once.
            // Without clone(), if response.json() partially reads then throws, the body
            // stream is spent and response.text() will always return an empty string.
            const cloned = response.clone();
            try {
                const data = await response.json();
                if (data?.error?.message) {
                    errorMsg = data.error.message;
                } else if (data?.error) {
                    errorMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
                } else if (data?.message) {
                    errorMsg = data.message;
                }
            } catch (e) {
                // JSON parse failed — fall back to raw text from the clone
                const text = await cloned.text();
                if (text) errorMsg = text.slice(0, 200);
            }
        } catch (inner) { }
        return new Error(`${platformName} API error: ${errorMsg}`);
    }
};
