import 'dotenv/config';

export interface Env {
	AI: Ai;
}

interface Scene {
	id: number;
	title: string;
	description: string;
	image: string;
	narration: string;
}

interface Character {
	id: number;
	name: string;
	description: string;
}

interface Story {
	prompt: string;
	scenesCount: number;
	scenes: Scene[];
	characters: Character[];
	theme: string;
}

interface StoryRequest {
	prompt: string; // Detailed novel description with scenes
	sceneCount: number;
}

interface StoryReponse {
	story: Story;
	images: string[]; // Array of base64 encoded images for each scene
}

interface AIModel {
	API_KEY: string;
	URL: string;
	requestBody: string;
}

interface LLMResponse {
	candidates: {
		content: {
			parts: {
				text: string;
			}[];
		};
	}[];
}


interface GenerateContentRequest {
    topic: string;
	type:string;
	personalStyle:string;
    sceneCount: number;
	AI_type:string;
}
interface Character{
	id: number;
	name: string;
	description: string;
}
async function generateImage(ai: Ai, prompt: string, characters:Character[], imageType: string): Promise<string> {
	`
    Generate an image based on the prompt using the Cloudflare AI Worker

    Input: prompt (string): The prompt to generate the image from
			characters (Character[]): The characters in the scene
    Output: image (string): The generated image in base64 format
    `;

	// Logging
	console.log(`[PROCESS] Generating image for prompt: ${prompt}`);
	console.log(`[PROCESS] Characters: ${JSON.stringify(characters)}`);

	const outlinedPrompt = `
        Generate an image with Pixar 3D animation style based on the following prompt: ${prompt}. 
		Make sure to follow ${imageType} theme.
		Make sure to follow the characters' description in the scene.
		The characters are: ${characters.map(character => `${character.name} (${character.description})`).join(', ')}.`;

	try {
		const result = await ai.run('@cf/black-forest-labs/flux-1-schnell', {
			prompt: outlinedPrompt,
		});

		return `data:image/png;base64,${await result.image}`;
	} catch (error) {
		console.error(`[ERROR] Failed to generate image: ${error}`);
		throw new Error(`Failed to generate image: ${error}`);
	}
}

async function generateGeminiLLMResponse(model: AIModel, prompt: string): Promise<string> {
	if (!model.API_KEY || !model.URL) {
		throw new Error('API_KEY or URL is not defined');
	}

	const requestBody = JSON.stringify({
		contents: [
		  {
			parts: [
			  {
				text: prompt, // đúng format như API yêu cầu
			  },
			],
		  },
		],
	  });
	  
	  const response = await fetch(model.URL.replace('${apiKey}', model.API_KEY), {
		method: 'POST',
		headers: {
		  'Content-Type': 'application/json',
		},
		body: requestBody,
	  });
	  
	if (!response.ok) {
		throw new Error(`Failed to generate LLM response: ${response.statusText}`);
	}

	return response.text();
}

async function generateMetaResponse(model: AIModel, prompt: string): Promise<string> {
    if (!model.API_KEY || !model.URL) {
        throw new Error('API_KEY or URL is not defined');
    }

    const requestBody = JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
            {
                role: "user",
                content: prompt,
            },
        ],
    });

    try {
        const response = await fetch(model.URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${model.API_KEY}`,
            },
            body: requestBody,
        });

        if (!response.ok) {
            throw new Error(`Failed to generate LLM response: ${response.statusText}`);
        }

        const data = await response.text();

        // Làm sạch phản hồi nếu cần
        let cleanedResponse = data.trim();
        if (cleanedResponse.startsWith('```json')) {
            cleanedResponse = cleanedResponse
                .replace(/^```json/, '') // Loại bỏ mở đầu ```json
                .replace(/```$/, '') // Loại bỏ kết thúc ```
                .trim();
        }

        return cleanedResponse;
    } catch (error) {
        console.error("Error in generateMetaResponse:", error);
        throw new Error("Failed to get LLM response.");
    }
}
async function generateStoryOutline(model: AIModel, prompt: string, scenesCount: number, AI_type: string): Promise<Story> {
    const outlinedPrompt = `
        Generate a story outline with ${scenesCount} scenes based on the following prompt: ${prompt}.
        The story should be consistent and coherent, with a clear beginning, middle, and end.

        The response should be in JSON format with the following structure:
        {
            "prompt": "<prompt>",
            "scenesCount": <number>,
            "scenes": [
                {
                    "id": <number>,
                    "title": "<title>",
                    "description": "<description>",
                    "image": "<image>",
                    "narration": "<narration>"
                }
            ],
            "characters": [
                {
                    "id": <number>,
                    "name": "<name>",
                    "description": "<description>"
                }
            ],
            "theme": "<theme>"
        }

        The scene's image should be less than 200 words, containing a description of the scene and the characters in it.
        The narration for each scene should be in Vietnamese, with a natural and emotionally resonant flow. It should be around 80 words, vividly describing the scene. Use a reverent tone appropriate for storytelling.
        The characters should be described clearly, with their gender and appearance (e.g., hair color, eye color, clothing). 
    `;

    let modelResponse;
    if (AI_type === 'GEMINI') {
        modelResponse = await generateGeminiLLMResponse(model, outlinedPrompt);
    } else {
        modelResponse = await generateMetaResponse(model, outlinedPrompt);
    }

    console.log("Model response: ", modelResponse);

    if (AI_type === 'GEMINI') {
        let parsedResponse: LLMResponse;
        try {
            parsedResponse = JSON.parse(modelResponse) as LLMResponse;
        } catch (error) {
            console.error(`[ERROR] Failed to parse GEMINI response: ${error}`);
            throw new Error(`Failed to parse GEMINI response: ${error}`);
        }

        const responseContent = parsedResponse.candidates[0]?.content?.parts?.[0]?.text;
        if (!responseContent) throw new Error("No message content found in GEMINI response.");

        let storyOutline = responseContent.trim();
        if (storyOutline.startsWith('```json')) {
            storyOutline = storyOutline.replace(/^```json/, '').replace(/```$/, '').trim();
        }

        return JSON.parse(storyOutline) as Story;

	} else {
		// Handle META response
		let storyOutlineRaw = modelResponse;
	
		// Nếu response là object stringified, parse rồi lấy content
		if (typeof storyOutlineRaw === "string" && storyOutlineRaw.trim().startsWith('{')) {
			try {
				const parsed = JSON.parse(storyOutlineRaw);
				storyOutlineRaw = parsed.choices?.[0]?.message?.content ?? '';
			} catch (error) {
				console.warn("[WARN] Failed to parse META wrapper JSON, treating response as raw text.");
				// Nếu không parse được thì cứ xử lý luôn response như text
			}
		}
	
		// Clean markdown-like wrappers ```json ... ```
		let cleanJSON = storyOutlineRaw.trim();
		if (cleanJSON.startsWith('```json')) {
			cleanJSON = cleanJSON.replace(/^```json/, '').replace(/```$/, '').trim();
		} else if (cleanJSON.startsWith('```')) {
			cleanJSON = cleanJSON.replace(/^```/, '').replace(/```$/, '').trim();
		}
	
		try {
			return JSON.parse(cleanJSON) as Story;
		} catch (error) {
			console.error("[ERROR] Failed to parse story outline JSON (Meta):", error);
			console.error("Raw response was:\n", cleanJSON);
			throw new Error("Failed to parse story outline JSON (Meta).");
		}
	}
}
export interface ModerationResult {
	isSafe: boolean;
	reason?: string;
}

export async function checkToxicityWithGemini(
	model: AIModel,
	topic: string
): Promise<ModerationResult> {
	const prompt = `
		Đánh giá nội dung sau đây có chứa yếu tố độc hại, thù ghét, khiêu dâm, bạo lực hoặc vi phạm chính sách không?
		Chỉ trả về kết quả dưới dạng JSON: { "isSafe": true/false, "reason": "..." }

		Nội dung: "${topic}"
	`;

	const modelResponse = await generateGeminiLLMResponse(model, prompt);

	// Parse response như cách bạn làm trong generateStoryOutline
	let outputText = '';
	try {
		const parsedResponse = JSON.parse(modelResponse) as LLMResponse;
		outputText = parsedResponse.candidates[0].content.parts[0].text.trim();

		if (outputText.startsWith('```json')) {
			outputText = outputText
				.replace(/^```json/, '')
				.replace(/```$/, '')
				.trim();
		}

		const result = JSON.parse(outputText) as ModerationResult;

		if (typeof result.isSafe !== 'boolean') {
			throw new Error('Kết quả không hợp lệ: thiếu isSafe');
		}

		return result;
	} catch (err) {
		console.warn('[Gemini] Lỗi phân tích JSON kiểm duyệt:', outputText);
		return {
			isSafe: false,
			reason: 'Không thể xác định độ an toàn nội dung.'
		};
	}
}


export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const GEMINI_API_KEY = 'AIzaSyDFTpaQcUUsw_0Tv-IzZWTD-5UVT5bxV0A';
		const GROQ_API_KEY='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';

		// Gemini
		const geminiModel: AIModel = {
			API_KEY: GEMINI_API_KEY,
			URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}',
			requestBody: '', // Không dùng field này nữa
		};

		// Grok
		const grokModel: AIModel = {
			API_KEY: GROQ_API_KEY, // Định nghĩa API Key
			URL: 'https://api.groq.com/openai/v1/chat/completions', // URL của API Groq
			requestBody: '', // Không sử dụng trường này
		};		
		const url = new URL(request.url);
		const pathname = url.pathname;

		// handle CORS preflight requests
		if (request.method === 'OPTIONS') {
			return new Response(null, {
				status: 204,
				headers: {
					'Access-Control-Allow-Credentials': 'true',
					'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
					'Access-Control-Allow-Origin': 'http://localhost:3000',
					'Access-Control-Allow-Headers': 'Content-Type',
				},
			});
		}
		// === Endpoint 1: Generate content ===
		if (request.method === 'POST' && pathname === '/api/generate/content') {
			const { topic, type, personalStyle, sceneCount, AI_type } = await request.json() as GenerateContentRequest; // add AI type
		
			console.log(`[CHECK] Request body: ${JSON.stringify({ topic, type, sceneCount })}`);
		
			// Kiểm tra nội dung
			const moderation = await checkToxicityWithGemini(geminiModel, topic);
		
			if (!moderation.isSafe) {
				console.warn(`[CHECK] Nội dung không an toàn: ${topic}`);
				return new Response(JSON.stringify({
					error: 'Nội dung không được chấp nhận.',
					reason: moderation.reason || 'Không rõ lý do.'
				}), {
					status: 400,
					headers: {
						'Content-Type': 'application/json',
						'Access-Control-Allow-Origin': '*',
					}
				});
			}
		
			// Nếu nội dung an toàn, tạo prompt và sinh nội dung
			const fullPrompt = `
				Topic: ${topic}
		
				Generate a story outline with ${sceneCount} scenes using ${type} mode.
				Make sure to follow the personal style: ${personalStyle}.
				The story should be consistent and coherent, with a clear beginning, middle, and end.
		
				Response format:
				{
					"prompt": "...",
					"scenesCount": ...,
					"scenes": [...],
					"characters": [...],
					"theme": "..."
				}
		
				Each scene should include:
				- Image description: < 200 words.
				- Narration (in Vietnamese): ~80 words, emotional and story-like.
			`;
		
			let story;
			if (AI_type === 'GEMINI') {
				story = await generateStoryOutline(geminiModel, fullPrompt, sceneCount, AI_type);
			} else{
				story = await generateStoryOutline(grokModel, fullPrompt, sceneCount, AI_type);

			}

		
			return new Response(JSON.stringify({ story }), {
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
				},
			});
		}
		
		// === Endpoint 2: Generate images ===
		else if (request.method === 'POST' && pathname === '/api/generate/images') {
			const { scenes, characters, imageType } = await request.json() as { scenes: Scene[], characters: Character[], imageType: string };

			const images: string[] = [];
			for (const scene of scenes) {
				const img = await generateImage(env.AI, scene.image, characters, imageType);
				images.push(img);
			}

			return new Response(JSON.stringify({ images }), {
				headers: { 'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',

				 },
			});
		}

			// === Endpoint 3: Generate image ===
		else if (request.method === 'POST' && pathname === '/api/generate/image') {
				const { prompt, characters, imageType } = (await request.json()) as { prompt: string, characters: Character[], imageType: string };
	
				const image = await generateImage(env.AI, prompt, characters, imageType);
	
				return new Response(JSON.stringify({ image }), {
					headers: { 
						'Content-Type': 'application/json', 
						'Access-Control-Allow-Origin': '*',
						'Content-Disposition': 'attachment; filename="image-output.json"',
						
					},
				});
		}
		
		// === Existing endpoint fallback ===
		return new Response('OK', {
			status: 200,
			headers: { 'Content-Type': 'application/json' },
		});
	}
};
