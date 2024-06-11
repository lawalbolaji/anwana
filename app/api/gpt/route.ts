import OpenAI from "openai";
import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import { toFile } from "openai/uploads";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const audio = formData.get("audio_blob");
        const mimeType = formData.get("type");
        const fileExt = mimeType === "audio/webm" ? "webm" : mimeType === "audio/ogg" ? "ogg" : "mp4";
        const filename = `request.${fileExt}`;

        if (audio instanceof Blob) {
            const stream = audio.stream();

            /* This utility from openAI allows us to convert the stream to a compatible file format without having to save the audio to disk and creating a readstream with fs.createReadStream() */
            const byteStreamAsFileLike = await toFile(Readable.fromWeb(stream as ReadableStream<any>), filename);
            const transcriptionAsText = await openai.audio.transcriptions.create({
                file: byteStreamAsFileLike,
                model: "whisper-1",
                response_format: "text",
                language: "en",
            });

            // get completions
            const completions = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content:
                            "You are a helpful assistant that helps me general knowledge questions. You want to prioritize the shortest answers but in any case, you answer must not exceed 20 words",
                    },
                    { role: "user", content: transcriptionAsText + "" },
                ],
            });

            /* get text-to-speech model */
            const response = await openai.audio.speech.create({
                model: "tts-1",
                voice: "shimmer",
                input: completions.choices[0].message.content ?? "I didn't catch that, please come again",
            });

            const blob = await response.arrayBuffer();
            const buffer = Buffer.from(blob);
            const contentType = response.headers.get("content-type") || "application/octet-stream";
            const contentLength = response.headers.get("content-length") || blob.byteLength;

            return new NextResponse(buffer, {
                status: 200,
                headers: {
                    "content-type": contentType,
                    "content-length": contentLength + "",
                },
            });
        }
    } catch (error) {
        console.log(error);
        return NextResponse.json({ message: "error" }, { status: 500 });
    }
}
