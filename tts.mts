import { ElevenLabsClient, play } from "elevenlabs";
import "dotenv/config";

const client = new ElevenLabsClient({
    apiKey: process.env.ELEVEN_LABS_API_KEY,
});
const audio = await client.textToSpeech.convert("JBFqnCBsd6RMkjVDRZzb", {
  text: "Đây là một ví dụ về cách sử dụng Eleven Labs API để chuyển đổi văn bản thành giọng nói.",
  model_id: "eleven_flash_v2_5",
  output_format: "mp3_44100_128",
});

await play(audio);
