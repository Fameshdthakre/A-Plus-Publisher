/**
 * scripts/ai-provider.js
 * Unified factory for AI requests across OpenAI, Gemini, and Claude.
 */

import { PROMPTS, STRATEGY_BLOCKS } from './prompts.js';
import { getModuleById } from './modules.js';

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
            temperature: options.temperature !== undefined ? options.temperature : 0.1
        };

        if (options.max_tokens) body.max_tokens = options.max_tokens;
        if (options.top_p !== undefined) body.top_p = options.top_p;

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
        return {
            text: data.choices[0].message.content,
            usage: {
                input: data.usage?.prompt_tokens || 0,
                output: data.usage?.completion_tokens || 0
            }
        };
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
                temperature: options.temperature !== undefined ? options.temperature : 0.1
            }
        };

        if (options.max_tokens) body.generationConfig.maxOutputTokens = options.max_tokens;
        if (options.top_p !== undefined) body.generationConfig.topP = options.top_p;
        if (options.top_k !== undefined) body.generationConfig.topK = options.top_k;

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
        return {
            text: data.candidates[0].content.parts[0].text,
            usage: {
                input: data.usageMetadata?.promptTokenCount || 0,
                output: data.usageMetadata?.candidatesTokenCount || 0
            }
        };
    },

    /**
     * Builds a human-readable field specification string for injection into AI prompts.
     * This ensures all providers understand field semantics, not just output structure.
     */
    buildFieldSpec(mod) {
        const lines = [`Module: ${mod.name}`, `Fields to generate content for:`];
        for (const f of mod.fields) {
            if (f.type === 'image') continue;
            const maxNote = f.maxLength ? `, max ${f.maxLength} chars` : '';
            const typeLabel = f.type === 'textarea' ? 'long text' : f.type === 'boolean' ? 'boolean' : 'short text';
            const repeatNote = (f.repeat && f.repeat > 1) ? ` (generate exactly ${f.repeat} unique items as an array)` : '';
            lines.push(`- "${f.key}" (${typeLabel}${maxNote}): ${f.label}${repeatNote}`);
        }
        return lines.join('\n');
    },

    async fetchClaude(config, prompt, options) {
        const { key, model = 'claude-3-5-sonnet-20241022' } = config;
        if (!key) throw new Error("Claude API key missing.");

        // Build system prompt with optional schema enforcement for Claude
        let systemPrompt = "You are a structured data generator. You MUST respond with ONLY a valid JSON object. No introductory text, no explanations, no markdown formatting — just the raw JSON object.";
        if (options.schemaDescription) {
            systemPrompt += `\n\nYou MUST output JSON matching this exact schema:\n${options.schemaDescription}`;
        }

        const body = {
            model: model,
            max_tokens: options.max_tokens || 4096,
            system: systemPrompt,
            messages: [{ role: "user", content: prompt }]
        };

        if (options.temperature !== undefined) body.temperature = options.temperature;
        if (options.top_p !== undefined) body.top_p = options.top_p;
        if (options.top_k !== undefined) body.top_k = options.top_k;

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
        return {
            text: data.content[0].text,
            usage: {
                input: data.usage?.input_tokens || 0,
                output: data.usage?.output_tokens || 0
            }
        };
    },

    async generateChart(productData, settings, strategy = 'balanced', moduleId = 'module-5') {
        const mod = getModuleById(moduleId);
        if (!mod) throw new Error(`Module ${moduleId} not found`);

        if (moduleId !== 'module-5') {
            return this.generateGenericModule(productData, settings, mod);
        }

        const strategyInstructions = STRATEGY_BLOCKS[strategy] || STRATEGY_BLOCKS.balanced;
        const prompt = `${PROMPTS.GENERATE_CHART}\n\n${strategyInstructions}\n\nProduct Data:\n"""\n${JSON.stringify(productData, null, 2)}\n"""`;

        // Build a Claude-compatible schema description for comparison charts
        const claudeSchemaDesc = `{ "metrics": [ { "metricName": "string (max 30 chars, title-case)", "values": { "<ASIN>": "string (max 250 chars, use \"✔\" for checkmarks)" } } ], "shortTitles": { "<ASIN>": "string (max 80 chars)" } }\nASINs to include: ${(Array.isArray(productData) ? productData.map(p => p.ASIN).filter(Boolean).join(', ') : 'N/A')}\nEach metric.values object MUST have a key for every ASIN above.`;

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
        } else if (settings.aiPlatform === 'claude') {
            options.schemaDescription = claudeSchemaDesc;
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
        const parsed = this.parseJSON(result.text);

        // Return both metrics and shortTitles
        return {
            data: {
                metrics: parsed.metrics || parsed,
                shortTitles: parsed.shortTitles || {}
            },
            usage: result.usage
        };
    },

    async generateGenericModule(productData, settings, mod) {
        // Build field spec so the AI understands field semantics, not just structure
        const fieldSpec = this.buildFieldSpec(mod);

        // M3: Generic modules are for a single product — use only the hero (first) product
        const heroProduct = Array.isArray(productData) ? productData[0] : productData;

        const prompt = `${PROMPTS.GENERATE_MODULE_CONTENT}\n\n${fieldSpec}\n\nGenerate content focused specifically on this single product:\n"""\n${JSON.stringify(heroProduct, null, 2)}\n"""`;
        
        let options = {};
        const schemaProperties = {};
        const requiredFields = [];
        
        mod.fields.forEach(f => {
            if (f.type === 'image') return; // AI doesn't generate images
            
            let propSchema;
            if (f.type === 'boolean') {
                propSchema = { type: 'boolean', description: `${f.label}` };
            } else {
                const maxText = f.maxLength ? ` Max ${f.maxLength} chars.` : '';
                propSchema = { type: 'string', description: `${f.label}.${maxText}` };
            }

            if (f.repeat && f.repeat > 1) {
                schemaProperties[f.key] = {
                    type: 'array',
                    items: propSchema,
                    description: `Array of exactly ${f.repeat} items for ${f.label}`
                };
            } else {
                schemaProperties[f.key] = propSchema;
            }
            requiredFields.push(f.key);
        });

        if (settings.aiPlatform === 'openai') {
            const schema = {
                type: "object",
                properties: schemaProperties,
                required: requiredFields,
                additionalProperties: false
            };
            options.response_format = { type: "json_schema", json_schema: { name: "module_generation", strict: true, schema: schema } };
        } else if (settings.aiPlatform === 'gemini') {
            const schema = {
                type: "object",
                properties: schemaProperties,
                required: requiredFields
            };
            options.responseSchema = schema;
        } else if (settings.aiPlatform === 'claude') {
            // Claude doesn't support structured outputs natively — inject schema into system prompt
            options.schemaDescription = fieldSpec + '\n\nReturn a JSON object with these exact keys. For array fields, return an array with exactly the specified number of items.';
        }

        const result = await this.fetchAI(settings, prompt, options);
        return { data: this.parseJSON(result.text), usage: result.usage };
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
        const parsed = this.parseJSON(result.text, "opportunities");

        let data = null;
        // Validation Engine: Ensure we return an array of opportunities
        if (Array.isArray(parsed)) {
            data = parsed;
        } else if (parsed && typeof parsed === 'object') {
            if (Array.isArray(parsed.opportunities)) data = parsed.opportunities;
            else if (Array.isArray(parsed.groups)) data = parsed.groups;
            // If it's a single opportunity object, wrap it in an array
            else if (parsed.groupName && Array.isArray(parsed.asins)) data = [parsed];
        }

        if (data) {
            return { data, usage: result.usage };
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
