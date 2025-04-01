export interface Env {
	AI: Ai;
}

interface Scene {
	imageDescription: string; // English
	narration: string; // Vietnamese
}

interface StoryRequest {
	prompt: string; // Detailed novel description with scenes
	sceneCount: number;
}

interface AiTextGenerationOutput {
	response?: string;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
	tool_calls?: { name: string; arguments: unknown }[];
}

interface StoryOutline {
	characters: Record<string, string>;
	scenes: { summary: string }[];
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		if (request.method === 'POST' && new URL(request.url).pathname === '/generate-story') {
			try {
				const { prompt, sceneCount } = (await request.json()) as StoryRequest;

				if (!prompt || !sceneCount || sceneCount < 1) {
					return new Response(JSON.stringify({ error: 'Missing prompt or invalid scene count' }), { status: 400 });
				}

				// Step 1: Generate the general story outline
				const storyOutline = await generateStoryOutline(env.AI, prompt, sceneCount);

				// Step 2: Generate detailed scenes based on the outline
				const scenes: Scene[] = await Promise.all(
					storyOutline.scenes.map((scene, index) => generateSceneDetails(env.AI, prompt, index + 1, scene.summary, storyOutline.characters))
				);

				// Generate images for each scene
				const imagePromises = scenes.map((scene) => env.AI.run('@cf/black-forest-labs/flux-1-schnell', { prompt: scene.imageDescription }));
				const images = await Promise.all(imagePromises);

				// Prepare JSON output without images
				const storyOutput = {
					prompt,
					scenes: scenes.map((scene) => ({
						narration: scene.narration, // Vietnamese
						imageDescription: scene.imageDescription, // English
					})),
					characterDescriptions: storyOutline.characters,
					generatedAt: new Date().toISOString(),
				};

				// Prepare response with metadata and images
				const responseData = {
					metadata: storyOutput,
					images: images.map((img) => `data:image/png;base64,${img.image}`),
				};

				return new Response(JSON.stringify(responseData, null, 2), {
					headers: {
						'Content-Type': 'application/json',
						'Content-Disposition': 'attachment; filename="story_output.json"',
					},
				});
			} catch (error: any) {
				return new Response(JSON.stringify({ error: error.message }), { status: 500 });
			}
		}

		return new Response('Welcome to Story Maker!', { status: 200 });
	},
};

// Step 1: Generate the general story outline
async function generateStoryOutline(ai: Ai, prompt: string, sceneCount: number): Promise<StoryOutline> {
	const outlinePrompt = `Based on the story description "${prompt}", create a cohesive story outline in English with ${sceneCount} scenes. Include:
	1. Key characters with detailed physical descriptions (e.g., hair color, clothing).
	2. A brief summary (1-2 sentences) for each scene, ensuring logical progression and consistency.
	Format the response as:
	Characters:
	- [Name]: [description]
	Scenes:
	- Scene 1: [summary]
	- Scene 2: [summary]
	...`;

	const response = (await ai.run('@cf/meta/llama-2-7b-chat-int8', { prompt: outlinePrompt })) as AiTextGenerationOutput;
	const text = response.response || 'Characters:\n- Hero: A generic warrior.\nScenes:\n- Scene 1: A battle begins.';

	const lines = text.split('\n').filter((line) => line.trim());
	const characters: Record<string, string> = {};
	const scenes: { summary: string }[] = [];
	let parsingScenes = false;

	lines.forEach((line) => {
		if (line.startsWith('Characters:')) {
			parsingScenes = false;
		} else if (line.startsWith('Scenes:')) {
			parsingScenes = true;
		} else if (!parsingScenes) {
			const match = line.match(/^-\s*([^:]+):\s*(.+)$/);
			if (match) {
				const [, name, desc] = match;
				characters[name.trim()] = desc.trim();
			}
		} else {
			const sceneMatch = line.match(/^-\s*Scene\s*(\d+):\s*(.+)$/);
			if (sceneMatch) {
				scenes.push({ summary: sceneMatch[2].trim() });
			}
		}
	});

	// Fallbacks
	if (Object.keys(characters).length === 0) {
		characters['Unknown Leader'] = 'A generic warrior from the story.';
	}
	if (scenes.length < sceneCount) {
		for (let i = scenes.length; i < sceneCount; i++) {
			scenes.push({ summary: `A generic continuation of the story in scene ${i + 1}.` });
		}
	}

	return { characters, scenes };
}

// Step 2: Generate detailed scene content
async function generateSceneDetails(
	ai: Ai,
	prompt: string,
	sceneNumber: number,
	summary: string,
	characters: Record<string, string>
): Promise<Scene> {
	const narrationPrompt = `Dựa trên mô tả câu chuyện "${prompt}" và tóm tắt cảnh "${summary}", tạo một đoạn kể chuyện ngắn (50-100 từ) bằng tiếng Việt cho cảnh ${sceneNumber}. Đảm bảo phù hợp với mạch truyện tổng thể.`;
	const imagePrompt = `Based on the story description "${prompt}" and scene summary "${summary}", create a detailed image description in English for scene ${sceneNumber}. Include consistent characters: ${Object.entries(
		characters
	)
		.map(([name, desc]) => `${name} (${desc})`)
		.join(', ')}. Ensure it fits the overall narrative.`;

	const [narrationResponse, imageResponse] = await Promise.all([
		ai.run('@cf/meta/llama-2-7b-chat-int8', { prompt: narrationPrompt }) as Promise<AiTextGenerationOutput>,
		ai.run('@cf/meta/llama-2-7b-chat-int8', { prompt: imagePrompt }) as Promise<AiTextGenerationOutput>,
	]);

	const narration = narrationResponse.response || `Cảnh ${sceneNumber} của câu chuyện.`;
	const imageDescription = imageResponse.response || `A generic scene with ${Object.values(characters).join(' and ')}.`;

	return { narration, imageDescription };
}
