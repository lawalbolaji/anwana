import OpenAI from "openai";
import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import type { ReadableStream } from "node:stream/web";
import fs from "node:fs";

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const audio = formData.get("audio_blob");
        if (audio instanceof Blob) {
            const stream = audio.stream();

            const ws = fs.createWriteStream("uploads/audio.webm");
            Readable.fromWeb(stream as ReadableStream<any>).pipe(ws);

            await new Promise((res, rej) => {
                ws.on("finish", () => {
                    res("done");
                });

                ws.on("error", (err) => {
                    rej(err);
                });
            });

            const transcription = await openai.audio.transcriptions.create({
                // file: fs.createReadStream("uploads/audio.webm"),
                file: fs.createReadStream("uploads/audio.webm"),
                model: "whisper-1",
                response_format: "text",
            });

            console.log(transcription);
        }

        return NextResponse.json({ message: "audio saved!" });
    } catch (error) {
        console.log(error);
        return NextResponse.json({ message: "error" }, { status: 500 });
    }
}
