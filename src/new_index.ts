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

async function generateImage(ai: Ai, prompt: string): Promise<string> {
	`
    Generate an image based on the prompt using the Cloudflare AI Worker

    Input: prompt (string): The prompt to generate the image from
    Output: image (string): The generated image in base64 format
    `;

	// Logging
	console.log(`[PROCESS] Generating image for prompt: ${prompt}`);

	const outlinedPrompt = `
        Generate an image with Pixar 3D animation style based on the following prompt: ${prompt}
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
	`
        Generate a response from the LLM based on the prompt using the Cloudflare AI Worker
        
        Input: 
            API_KEY (string): The API key for the LLM
            URL (string): The URL for the LLM endpoint
            body (string): The body of the request to the LLM
            prompt (string): The prompt to generate the response from
        
        Output: 
            response (string): The generated response from the LLM
        `;

	if (!model.API_KEY) {
		throw new Error('API_KEY is not defined');
	}

	if (!model.URL) {
		throw new Error('URL is not defined');
	}

	// Replace the placeholder in the URL with the actual API key
	model.URL = model.URL.replace('${apiKey}', model.API_KEY);
	model.requestBody = model.requestBody.replace('"mytext"', JSON.stringify(prompt));

	// console.log(`[CHECK] Sending request to LLM: ${model.URL}`);
	// console.log(`[CHECK] Request body: ${model.requestBody}`);

	const response = await fetch(model.URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: model.requestBody,
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
			requestBody: JSON.stringify({
				contents: [
					{
						parts: [
							{
								text: `mytext`,
							},
						],
					},
				],
			}),
		};

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

		if (request.method == 'POST' && new URL(request.url).pathname == '/api/generate-story') {
			const { prompt, sceneCount } = (await request.json()) as StoryRequest;

			// Step 1: Generate the story outline using the LLM
			const storyOutline = await generateStoryOutline(geminiModel, prompt, sceneCount);
			console.log(`[PROCESS] Story outline generated: ${storyOutline.prompt}`);

			console.log(`[CHECK] Story scenes count: ${storyOutline.scenesCount}`);

			// Step 2: Generate images for each scene
			const based64Images: string[] = [];
			for (let i = 0; i < storyOutline.scenesCount; i++) {
				const scene = storyOutline.scenes[i];
				const image = await generateImage(env.AI, scene.image);
				based64Images.push(image);
			}
			console.log(`[PROCESS] All images generated successfully.`);

			// Step 3: Create the response object
			const storyResponse: StoryReponse = {
				story: storyOutline,
				images: based64Images,
			};

			return new Response(JSON.stringify(storyResponse), {
				headers: {
					'Content-Type': 'application/json',
					'Content-Disposition': 'attachment; filename="story-output.json"',
				},
			});
		} else if (request.method == 'POST' && new URL(request.url).pathname == '/api/generate-story-outline') {
			const { prompt, sceneCount } = (await request.json()) as StoryRequest;

			// Step 1: Generate the story outline using the LLM
			const storyOutline = await generateStoryOutline(geminiModel, prompt, sceneCount);
			console.log(`[PROCESS] Story outline generated: ${storyOutline.prompt}`);

			// Step 2: Create the response object
			const storyResponse: StoryReponse = {
				story: storyOutline,
				images: [], // No images generated for the outline request
			};

			return new Response(JSON.stringify(storyResponse), {
				headers: {
					'Content-Type': 'application/json',
					'Access-Control-Allow-Origin': '*',
					'Content-Disposition': 'attachment; filename="story-outline-output.json"',
				},
			});
		} else if (request.method == 'POST' && new URL(request.url).pathname == '/api/generate-image') {
			const { prompt } = (await request.json()) as { prompt: string };

			// Step 1: Generate the image using the AI model
			const image = await generateImage(env.AI, prompt);

			// Step 2: Create the response object
			const imageResponse = {
				image: image,
			};

			return new Response(JSON.stringify(imageResponse), {
				headers: {
					'Content-Type': 'application/json',
					'Content-Disposition': 'attachment; filename="image-output.json"',
				},
			});
		}

		return new Response('OK', {
			status: 200,
			headers: {
				'Content-Type': 'application/json',
			},
		});
	},
};
