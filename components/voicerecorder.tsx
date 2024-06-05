"use client";

import { Dispatch, MutableRefObject, SetStateAction, useEffect, useRef, useState } from "react";
import RecordingIcon from "./icons/recordingicon";
import StopIcon from "./icons/stopicon";
import MicIcon from "./icons/micicon";
import { useStopWatch } from "./hooks/usestopwatch";
import { formatTime } from "../lib/utils";
import useAudioVisualizer from "@/components/audiovisualizer";

type recorderState = "recording" | "stopped";

async function startRecorder(
    recorderRef: MutableRefObject<MediaRecorder | null>,
    audioChunkRef: MutableRefObject<BlobPart[]>,
    audioStreamRef: MutableRefObject<MediaStream | undefined>,
    playResponse: (objUrl: string) => void,
    setLoadGptResponse: Dispatch<SetStateAction<"idle" | "success" | "loading" | "error">>
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
                // const sound = new Audio(URL.createObjectURL(audioBlob));
                // sound.play();

                /* upload audio to backend */
                // start spinner
                setLoadGptResponse("loading");
                getGptResponseToQuery("/api/gpt", audioBlob, "audio/webm", (data: Blob) => {
                    setLoadGptResponse("success");
                    playResponse(URL.createObjectURL(data));
                });

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

async function getGptResponseToQuery(url: string, audioBlob: Blob, fileType: string, cb: (data: Blob) => void) {
    const formData = new FormData();
    formData.append("audio_blob", audioBlob, "file");
    formData.append("type", fileType || "mp3");

    const response = await fetch(url, {
        method: "POST",
        cache: "no-cache",
        body: formData,
    });

    const audioResponseBlob = await response.blob();
    cb(audioResponseBlob);
}

export function VoiceRecorder() {
    const [recorderState, setRecorderState] = useState<recorderState>("stopped");
    const recorderRef = useRef<MediaRecorder | null>(null);
    const audioStreamRef = useRef<MediaStream | undefined>();
    const audioChunkRef = useRef<Array<BlobPart>>([]);
    const { startVisualizer, mountRef } = useAudioVisualizer();
    const [loadGptResponse, setLoadGptResponse] = useState<"idle" | "success" | "loading" | "error">("idle");

    useEffect(() => {
        recorderRef.current = null;
        audioChunkRef.current = [];
        audioStreamRef.current = undefined;
    }, []);

    useEffect(() => {
        let timeoutRef: NodeJS.Timeout;
        const mouseMoveListener = () => {
            timeoutRef = setTimeout(() => {
                startVisualizer("introduction.mp3");
            }, 500);

            window.removeEventListener("mousemove", mouseMoveListener);
        };

        if (window) window.addEventListener("mousemove", mouseMoveListener, { once: true });

        return () => {
            if (window) window.removeEventListener("mousemove", mouseMoveListener);
            if (timeoutRef) clearTimeout(timeoutRef);
        };
    }, [startVisualizer]);

    const { timeInSeconds, startTimer, clearTimer } = useStopWatch();

    return (
        <div className="flex flex-col items-center justify-center h-screen w-[80%] mx-auto">
            <div className="py-8">
                <h1 className="font-bold text-4xl text-center">Hello, Ẹ káàbọ̀, Ndewo, barka da zuwa!</h1>
            </div>

            <div className="overflow-hidden h-[600px] w-[80%] relative">
                <div className="h-full w-full" ref={mountRef} />
            </div>

            <div className="flex flex-col flex-grow items-center justify-center w-full my-4">
                {loadGptResponse === "loading" ? (
                    <Spinner />
                ) : recorderState === "stopped" ? (
                    <div className="h-full w-full py-4 flex flex-col items-center justify-center">
                        <button
                            onClick={async () => {
                                try {
                                    await startRecorder(
                                        recorderRef,
                                        audioChunkRef,
                                        audioStreamRef,
                                        startVisualizer,
                                        setLoadGptResponse
                                    );
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

function Spinner() {
    return (
        <div className="flex items-center justify-center h-full">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900 dark:border-gray-600 dark:border-t-gray-50" />
        </div>
    );
}
