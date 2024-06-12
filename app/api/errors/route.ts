import { NextResponse } from "next/server";
import { stdout } from "node:process";
import { Readable } from "node:stream";
import { ReadableStream } from "node:stream/web";

export async function POST(req: Request) {
    /* log error payload to console */
    Readable.fromWeb(req.body as ReadableStream<any>).pipe(stdout);
    return NextResponse.json("ok");
}
