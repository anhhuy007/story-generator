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
    sceneCount: number;
}
interface Character{
	id: number;
	name: string;
	description: string;
}
async function generateImage(ai: Ai, prompt: string, characters:Character[]): Promise<string> {
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
        Generate an image with Pixar 3D animation style based on the following prompt: ${prompt}. Make sure to follow the characters' description in the scene.
		The characters are: ${characters.map(character => `${character.name} (${character.description})`).join(', ')}.
    `;

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

async function generateLLMResponse(model: AIModel, prompt: string): Promise<string> {
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

async function generateStoryOutline(model: AIModel, prompt: string, scenesCount: number): Promise<Story> {
	`
        Generate a story outline based on the prompt using the LLM.
        
        Input: 
            API_KEY (string): The API key for the LLM
            URL (string): The URL for the LLM endpoint
            body (string): The body of the request to the LLM
            prompt (string): The prompt to generate the response from
        
        Output: 
            response (string): The generated response from the LLM
        `;

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
	const modelResponse = await generateLLMResponse(model, outlinedPrompt);

	// Parse the response to JSON
	let parsedResponse: LLMResponse;
	try {
		parsedResponse = JSON.parse(modelResponse) as LLMResponse;
	} catch (error) {
		console.error(`[ERROR] Failed to parse LLM response: ${error}`);
		throw new Error(`Failed to parse LLM response: ${error}`);
	}

	// Clean up the Markdown code block wrapper
	let storyOutline = parsedResponse.candidates[0].content.parts[0].text.trim();
	if (storyOutline.startsWith('```json')) {
		storyOutline = storyOutline
			.replace(/^```json/, '')
			.replace(/```$/, '')
			.trim();
	}

	console.log(`[CHECK] Cleaned Story outline: ${storyOutline}`);

	return JSON.parse(storyOutline) as Story;
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const GEMINI_API_KEY = 'AIzaSyDFTpaQcUUsw_0Tv-IzZWTD-5UVT5bxV0A';

		const geminiModel: AIModel = {
			API_KEY: GEMINI_API_KEY,
			URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}',
			requestBody: '', // Không dùng field này nữa
		};

		const url = new URL(request.url);
		const pathname = url.pathname;

		// === Endpoint 1: Generate content ===
		if (request.method === 'POST' && pathname === '/api/generate/content') {
			const { topic, type, sceneCount } = await request.json() as GenerateContentRequest;

			console.log(`[CHECK] Request body: ${JSON.stringify({ topic, type, sceneCount })}`);
			const fullPrompt = `
				Topic: ${topic}
				

				Generate a story outline with ${sceneCount} with ${type} mode.
				The story should be consistent and coherent, with a clear beginning, middle, and end.

				Response format:
				{
					"prompt": "...",
					"scenesCount": ...,
					"scenes": [...],
					"characters": [...],
					"theme": "..."
				}

				Scene image description: < 200 words.
				Narration (in Vietnamese): ~80 words, emotional, story-like.
			`;

			const story = await generateStoryOutline(geminiModel, fullPrompt, sceneCount);

			return new Response(JSON.stringify({ story }), {
				headers: { 'Content-Type': 'application/json' },
			});
		}

		// === Endpoint 2: Generate images ===
		else if (request.method === 'POST' && pathname === '/api/generate/images') {
			const { scenes, characters } = await request.json() as { scenes: Scene[], characters: Character[] };

			const images: string[] = [];
			for (const scene of scenes) {
				const img = await generateImage(env.AI, scene.image, characters);
				images.push(img);
			}

			return new Response(JSON.stringify({ images }), {
				headers: { 'Content-Type': 'application/json' },
			});
		}

			// === Endpoint 3: Generate image ===
		else if (request.method === 'POST' && pathname === '/api/generate/image') {
				const { prompt, characters } = (await request.json()) as { prompt: string, characters: Character[]  };
	
				const image = await generateImage(env.AI, prompt, characters);
	
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
