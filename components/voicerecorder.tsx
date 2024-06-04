"use client";

import dynamic from "next/dynamic";
import { MutableRefObject, useEffect, useRef, useState } from "react";
import RecordingIcon from "./icons/recordingicon";
import StopIcon from "./icons/stopicon";
import MicIcon from "./icons/micicon";
import { useStopWatch } from "./hooks/usestopwatch";
import { formatTime } from "../lib/utils";

/* 
    nextjs was throwing a document not found reference error and returning a 500 for the root page 
    but dynamically importing three.js (instead of static) fixed it... Will figure out why later 
*/
const AudioVisualizer = dynamic(() => import("@/components/audiovisualizer"), { ssr: false });

type recorderState = "recording" | "stopped";

async function startRecorder(
    recorderRef: MutableRefObject<MediaRecorder | null>,
    audioChunkRef: MutableRefObject<BlobPart[]>,
    audioStreamRef: MutableRefObject<MediaStream | undefined>
) {
    if (navigator.mediaDevices) {
        try {
            audioChunkRef.current = [];
            audioStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(audioStreamRef.current, {
                mimeType: "audio/webm", // unfortunately, this is the only format chrome supports
            });
            recorderRef.current = recorder;

            recorder.ondataavailable = (event: BlobEvent) => {
                audioChunkRef.current.push(event.data);
            };

            recorder.onstop = () => {
                const audioBlob = new Blob(audioChunkRef.current, { type: "audio/webm" });

                /* DEBUG: play back audio to confirm it was captured successfully */
                const sound = new Audio(URL.createObjectURL(audioBlob));
                sound.play();

                if (recorderRef.current && recorderRef.current.state !== "inactive") {
                    recorderRef.current = null;
                }
            };

            recorder.start();
        } catch (error: unknown) {
            console.error(error);
        }
    }
}

function stopRecorder(recorderRef: MutableRefObject<MediaRecorder | null>, stream?: MediaStream) {
    recorderRef.current?.stop();
    stream?.getTracks().forEach((track) => track.stop());
}

async function uploadAudio(url: string, audioBlob: Blob, fileType: string) {
    const formData = new FormData();
    formData.append("media", audioBlob, "user_file");
    formData.append("type", fileType || "mp3");

    const response = await fetch(url, {
        method: "POST",
        cache: "no-cache",
        body: formData,
    });

    return response.json();
}

export function VoiceRecorder() {
    const [recorderState, setRecorderState] = useState<recorderState>("stopped");
    const recorderRef = useRef<MediaRecorder | null>(null);
    const audioStreamRef = useRef<MediaStream | undefined>();
    const audioChunkRef = useRef<Array<BlobPart>>([]);

    useEffect(() => {
        recorderRef.current = null;
        audioChunkRef.current = [];
        audioStreamRef.current = undefined;
    }, []);

    const { timeInSeconds, startTimer, clearTimer } = useStopWatch();

    return (
        <div className="flex flex-col items-center justify-center h-screen w-[80%] mx-auto">
            <div className="py-8">
                <h1 className="font-bold text-2xl">Hello, welcome to assistant!</h1>
            </div>

            <div className="overflow-hidden h-[600px] w-[80%] relative">
                <AudioVisualizer audioSrc="introduction.mp3" />
            </div>

            <div className="flex flex-col flex-grow items-center justify-center w-full my-4">
                {recorderState === "stopped" ? (
                    <div className="h-full w-full py-4 flex flex-col items-center justify-center">
                        <button
                            onClick={async () => {
                                try {
                                    await startRecorder(recorderRef, audioChunkRef, audioStreamRef);
                                    setRecorderState("recording");
                                    startTimer();
                                } catch (error: unknown) {
                                    console.error(error);
                                }
                            }}
                            className="relative flex items-center justify-center w-16 h-16 rounded-full bg-[#FF5722] text-white font-bold text-4xl shadow-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[#FF5722] focus:ring-opacity-50"
                        >
                            <MicIcon className="h-6 w-6" />
                        </button>

                        <div className="mt-8">
                            <div className="h-8 w-[170px] flex items-center justify-center font-bold text-sm">
                                Click to record
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="h-full w-full py-4 flex flex-col items-center justify-center">
                        <button
                            onClick={async () => {
                                try {
                                    stopRecorder(recorderRef, audioStreamRef.current);
                                    setRecorderState("stopped");
                                    clearTimer();
                                } catch (error: unknown) {
                                    console.error(error);
                                }
                            }}
                            className="relative flex items-center justify-center w-16 h-16 rounded-full bg-[#e7dbd8] text-[#e7dbd8] font-bold text-4xl shadow-lg transition-all duration-300 ease-in-out transform hover:scale-105"
                        >
                            <div className="absolute w-20 h-20 rounded-full bg-[#e5dddb] opacity-50 animate-ping" />
                            <StopIcon className="h-6 w-6" />
                        </button>

                        <div className="mt-8">
                            <div className="h-8 w-[170px] flex items-center justify-center font-bold text-sm opacity-50 bg-[#444343] rounded-md">
                                <RecordingIcon className="h-4 w-4" /> &nbsp; Recording {formatTime(timeInSeconds)}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
