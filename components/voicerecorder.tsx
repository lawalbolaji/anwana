"use client";

/* prettier-ignore */
import { useCallback, useEffect, useRef, useState } from "react";
import MicIcon from "./icons/micicon";
import { VAD_SPEECH_THRESHOLD } from "../lib/constants";
import { MicVAD, utils } from "@ricky0123/vad-web";
import React from "react";

type recorderState = "recording" | "stopped";
type supportedMimeTypes = "audio/webm" | "audio/ogg" | "audio/mp4";

if (typeof window !== "undefined") {
    window.onerror = function (message, url, lineNumber) {
        logRemoteError({ message, url, lineNumber });
        return true;
    };
}

function logRemoteError(payload: unknown) {
    fetch("/api/errors", {
        body: JSON.stringify(payload),
        method: "POST",
        cache: "no-cache",
    });
}

async function getGptResponseToQuery(url: string, audioBlob: Blob, fileType: string, cb: (data: ArrayBuffer) => void) {
    const formData = new FormData();
    formData.append("audio_blob", audioBlob, "file");
    formData.append("type", fileType);

    const response = await fetch(url, {
        method: "POST",
        cache: "no-cache",
        body: formData,
    });

    if (!response.ok) throw new Error(response.statusText);

    const audioResponseBlob = await response.arrayBuffer();
    cb(audioResponseBlob);
}

function useAudioConfig(onVolumeChange: (volume: number) => void /* this path will be extremely hot so be careful */) {
    const audioCtxRef = useRef<AudioContext | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);

    const playAudio = useCallback(
        async (audio: string | ArrayBuffer, onPlayerStop?: (args?: any) => any, args?: any) => {
            try {
                if (audioCtxRef.current === null) {
                    audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)({
                        latencyHint: "playback",
                        sampleRate: 24000,  /* ALL OPENAI SYNTHESIZED AUDIOS ARE SAMPLED AT 24KHZ */
                    });
                }
                const analyzer = audioCtxRef.current.createAnalyser();
                const dataArray = new Float32Array(analyzer.frequencyBinCount);
                const bufferedSource = audioCtxRef.current.createBufferSource();
                gainNodeRef.current = audioCtxRef.current.createGain();

                if (audio instanceof ArrayBuffer) {
                    const audioBuffer = await audioCtxRef.current.decodeAudioData(audio);
                    bufferedSource.buffer = audioBuffer;
                } else {
                    const response = await fetch(audio);
                    const arrayBuffer = await response.arrayBuffer();
                    const audioBuffer = await audioCtxRef.current.decodeAudioData(arrayBuffer);
                    bufferedSource.buffer = audioBuffer;
                }

                bufferedSource.connect(gainNodeRef.current);
                gainNodeRef.current.connect(analyzer);
                bufferedSource.connect(audioCtxRef.current.destination);
                bufferedSource.start();

                const updateVolInterval = setInterval(() => {
                    analyzer.getFloatTimeDomainData(dataArray);
                    const volume = calculateVolumeLevel(dataArray);
                    onVolumeChange && onVolumeChange(volume);
                }, 5); //ms

                bufferedSource.addEventListener("ended", () => {
                    clearInterval(updateVolInterval);
                    onPlayerStop && onPlayerStop(args);
                    audioCtxRef.current?.close();
                    audioCtxRef.current = null;
                });
            } catch (error) {
                console.error(error);
                logRemoteError(error);
            }

            return () => {};
        },
        [audioCtxRef, onVolumeChange]
    );

    const stopAudio = useCallback(() => {
        try {
            if (audioCtxRef.current && audioCtxRef.current.state === "running" && gainNodeRef.current) {
                const FADE_DURATION_SEC = 1;
                const now = audioCtxRef.current.currentTime;
                gainNodeRef.current.gain.exponentialRampToValueAtTime(0.01, now + FADE_DURATION_SEC);

                setTimeout(() => {
                    audioCtxRef.current?.close();
                    audioCtxRef.current = null;
                }, FADE_DURATION_SEC * 1000); /*  */
            }
        } catch (error) {
            console.error(error);
            logRemoteError(error);
        }
    }, [audioCtxRef]);

    return { playAudio, stopAudio };
}

/* TODO: 
    - remove record button, speak to prompt/interrupt, listen for pauses ✔️
    - Animate bubble to match frequency of speech ✔️

    - reduce latency... use web sockets to eliminate connection overhead? local tts/stt solution? stream stt response?
    - add conversational context...

    - what to do with different speakers?
 */

/**
 * Returns the estimated volume level given the time sampled data weighted on a 0-1 scale
 * @param dataArray The time sampled data to be analyzed - Float32Array
 */
function calculateVolumeLevel(dataArray: Float32Array) {
    /* RMS of the time sampled data (which is PCM in this case) gives a very good estimate of the effective loudness of the signal */
    let sumOfSquares = 0;
    for (const amplitude of Array.from(dataArray)) {
        sumOfSquares += amplitude * amplitude;
    }

    return Math.sqrt(sumOfSquares / dataArray.length);
}

function AudioVolumeIndicator({ volume }: { volume: number }) {
    const volRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (volRef.current) {
            volRef.current.style.transform = `scale(${Math.max(0.1, 0.1 + volume) * 7.5})`;
        }
    }, [volume]);

    return (
        <div
            className="absolute overflow-hidden inset-0 z-0 rounded-full scale-0 transition-all ease-in duration-100 bg-[#e5dddb] opacity-30"
            ref={volRef}
        />
    );
}

export function VoiceRecorder() {
    const [recorderState, setRecorderState] = useState<recorderState>("stopped");
    const recorderRef = useRef<MediaRecorder | null>(null);
    const audioStreamRef = useRef<MediaStream | undefined>();
    const audioChunkRef = useRef<Array<BlobPart>>([]);
    const [loadGptResponse, setLoadGptResponse] = useState<"idle" | "success" | "loading" | "error">("idle");
    const supportedMimeType = useRef<supportedMimeTypes>("audio/webm");
    const [appReady, setAppReady] = useState(false);
    const audioElementRef = useRef<HTMLAudioElement | null>(null);
    const [volume, setVolume] = useState(0);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const { playAudio, stopAudio } = useAudioConfig(setVolume);

    useEffect(() => {
        recorderRef.current = null;
        audioChunkRef.current = [];
        audioStreamRef.current = undefined;
    }, []);

    useEffect(() => {
        let timeoutRef: NodeJS.Timeout;
        const clickListener = () => {
            timeoutRef = setTimeout(() => {
                playAudio("introduction.mp3", setAppReady, true);
            }, 500);

            window.removeEventListener("click", clickListener);
        };

        if (window) window.addEventListener("click", clickListener, { once: true });

        return () => {
            if (window) window.removeEventListener("click", clickListener);
            if (timeoutRef) clearTimeout(timeoutRef);
        };
    }, [playAudio]);

    /* initialize VAD */
    const vadRef = useRef<MicVAD | null>(null);
    useEffect(() => {
        async function initVAD() {
            if (audioCtxRef.current === null)
                audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
            const analyzer = audioCtxRef.current.createAnalyser();
            analyzer.fftSize = 2048;
            const dataArray = new Float32Array(analyzer.frequencyBinCount);
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    autoGainControl: true,
                    noiseSuppression: true,
                },
            });
            const source = audioCtxRef.current.createMediaStreamSource(stream);

            vadRef.current = await MicVAD.new({
                stream,
                positiveSpeechThreshold: VAD_SPEECH_THRESHOLD,
                onFrameProcessed(probabilities) {
                    /* we can get a rough estimate of volume by computing the RMS of the PCM data */
                    analyzer.getFloatTimeDomainData(dataArray);
                    setVolume(calculateVolumeLevel(dataArray));
                },
                onSpeechStart() {
                    // turn off currently playing audio
                    stopAudio(); // TODO: cancel inflight queries
                    source.connect(analyzer);
                },
                onSpeechEnd(audio) {
                    analyzer.disconnect(); // cleanup
                    source.disconnect();

                    /* audio is a Float32Array sampled at 16000 HZ */
                    const wavBuffer = utils.encodeWAV(audio);
                    const blob = new Blob([wavBuffer]);

                    setLoadGptResponse("loading");
                    const onGptResponseReceived = (audio: ArrayBuffer) => {
                        setLoadGptResponse("success");
                        playAudio(audio);
                    };
                    getGptResponseToQuery("/api/gpt", blob, "audio/wav", onGptResponseReceived).catch((err) => {
                        setLoadGptResponse("error");
                        console.error(err);
                        logRemoteError(err);
                    });
                },
            });
            vadRef.current.start();
        }

        const clickListener = () => initVAD();
        if (window) window.addEventListener("click", clickListener, { once: true });

        return () => {
            vadRef.current?.destroy();
            window.removeEventListener("click", clickListener);
            // audioCtx.close();
        };
    }, [playAudio, stopAudio]);

    return (
        <div className="flex h-[calc(100dvh)] justify-center items-center w-full bg-gradient-to-br from-15% via-[#DBE7FC] via-40% to-[#1D2951] to-90%">
            <div className="flex flex-col items-center justify-center w-[80%] h-[500px] mx-auto my-auto">
                <div className="pt-4 md:pt-8">
                    <h1 className="font-bold md:text-5xl text:3xl text-center select-none tracking-widest line-1 anim-typewriter">
                        Hello!
                    </h1>
                    <p className="md:text-md tex:sm text-center select-none">
                        I&quot;m <span className="font-bold md:text-xl text-lg">Anwana</span>, click anywhere to start!
                    </p>
                </div>

                <div className="w-[70%] relative flex flex-grow items-center justify-center">
                    <div
                        id="wrapper"
                        className="border relative p-8 flex items-center justify-center rounded-full shadow-III"
                    >
                        <div
                            id="inner-circle"
                            className="border relative z-20 p-8 flex items-center justify-center rounded-full shadow-II bg-gradient-to-br from-[#d099d7] via-[#575dea] to-[#66bcfe]"
                        >
                            <div
                                id="bubble"
                                className="p-4 relative z-10 flex items-center justify-center font-bold text-sm rounded-full shadow-I text-white bg-gradient-to-tr from-[#d099d7] via-[#575dea] to-[#66bcfe]"
                            >
                                <MicIcon className="h-18 w-18" />
                            </div>
                        </div>
                        <AudioVolumeIndicator volume={volume} />
                    </div>
                </div>

                <div className="flex flex-col items-center justify-center w-full">
                    {loadGptResponse === "loading" ? (
                        <Spinner />
                    ) : (
                        <div className="h-full w-full py-4 flex flex-col items-center justify-center">
                            <div className="h-12 w-12" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function Spinner() {
    return (
        <div className="h-full w-full py-4 flex flex-col items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-300 border-t-[#d099d750]" />
        </div>
    );
}
