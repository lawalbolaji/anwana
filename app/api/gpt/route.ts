import OpenAI from "openai";
import { createClient } from "@deepgram/sdk";
import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import { toFile } from "openai/uploads";
import Groq from "groq-sdk";

export const maxDuration = 20;

const deepgramClient = (function () {
    const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
    return Object.freeze({
        async stt(stream: globalThis.ReadableStream<Uint8Array>) {
            const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
                Readable.fromWeb(stream as ReadableStream<any>),
                { model: "nova-2" }
            );

            if (error) throw error;
            return result?.results.channels?.[0].alternatives?.[0].transcript;
        },
        async tts(speech: string) {},
    });
})();

const groqClient = (function () {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const filename = `request.wav`;
    return Object.freeze({
        async stt(stream: globalThis.ReadableStream<Uint8Array>) {
            const transcription = await groq.audio.transcriptions.create({
                file: await toFile(Readable.fromWeb(stream as ReadableStream<any>), filename),
                model: "whisper-large-v3",
                prompt: "Specify context or spelling", // Optional
                response_format: "json", // Optional
                language: "en", // Optional
                temperature: 0.0, // Optional
            });

            return transcription.text;
        },
        async tts(speech: string) {},
        async getCompletion(userPrompt: string) {
            const completions = await groq.chat.completions.create({
                model: "llama3-groq-70b-8192-tool-use-preview",
                messages: [
                    {
                        role: "system",
                        content:
                            "You are a helpful assistant that helps with general knowledge questions about Nigeria. You want to prioritize the shortest answers but in any case, you answer must not exceed 30 words. Generate all your responses in Nigerian pidjin english!",
                    },
                    { role: "user", content: userPrompt + "" },
                ],
            });

            return completions.choices[0].message.content;
        },
    });
})();

const openaiClient = (function () {
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    const filename = `request.wav`;
    return Object.freeze({
        async stt(stream: globalThis.ReadableStream<Uint8Array>) {
            /* This utility from openAI allows us to convert the stream to a compatible file format without having to save the audio to disk and creating a readstream with fs.createReadStream() */
            const byteStreamAsFileLike = await toFile(Readable.fromWeb(stream as ReadableStream<any>), filename);
            const transcriptionAsText = await openai.audio.transcriptions.create({
                file: byteStreamAsFileLike,
                model: "whisper-1",
                response_format: "text",
                language: "en",
            });

            return transcriptionAsText as unknown as string;
        },
        async tts(speech: string) {
            const response = await openai.audio.speech.create({
                model: "tts-1",
                voice: "shimmer",
                input: speech,
                speed: 0.8,
            });

            return response;
        },
        async getCompletion(userPrompt: string) {
            const completions = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content:
                            "You are a helpful assistant that helps with general knowledge questions about Nigeria. You want to prioritize the shortest answers but in any case, you answer must not exceed 30 words. Generate all your responses in Nigerian pidjin english!",
                    },
                    { role: "user", content: userPrompt + "" },
                ],
            });

            return completions.choices[0].message.content;
        },
    });
})();

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const audio = formData.get("audio_blob");
        if (audio instanceof Blob) {
            const stream = audio.stream();

            /* you might notice high latency for this stt when testing locally */
            /* this is actually mostly network latency because deepgram's servers are not well distributed globally */
            /* their inference time is rapid, and since our instance actually runs in a region close to deepgram's servers, that is more important */
            // console.time("deepgram-stt");
            console.time("groq-stt");
            // const transcriptionAsText = await deepgramClient.stt(stream);
            const transcriptionAsText = await groqClient.stt(stream);
            console.timeEnd("groq-stt");
            // console.timeEnd("deepgram-stt");

            console.time("openai-completion");
            const speech = await groqClient.getCompletion(transcriptionAsText);
            console.timeEnd("openai-completion");

            console.time("openai-completion");
            const response = await openaiClient.tts(speech ?? "I didn't catch that, please come again");
            console.timeEnd("openai-completion");

            return new NextResponse(response.body);
        }
    } catch (error) {
        console.log(error);
        return NextResponse.json({ message: "error" }, { status: 500 });
    }
}
