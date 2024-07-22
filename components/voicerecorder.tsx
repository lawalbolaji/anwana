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

async function getGptResponseToQuery(
    url: string,
    audioBlob: Blob,
    fileType: string,
    cb: (data: ArrayBuffer) => void,
    signal?: AbortSignal
) {
    const formData = new FormData();
    formData.append("audio_blob", audioBlob, "file");
    formData.append("type", fileType);

    const response = await fetch(url, {
        method: "POST",
        cache: "no-cache",
        body: formData,
        signal,
    });

    if (!response.ok) throw new Error(response.statusText);

    const audioResponseBlob = await response.arrayBuffer();
    cb(audioResponseBlob);
}

function useAudioConfig(onVolumeChange: (volume: number) => void /* this path will be extremely hot so be careful */) {
    const audioCtxRef = useRef<AudioContext | null>(null);
    const gainNodeRef = useRef<GainNode | null>(null);
    const volUpdateIntervalRef = useRef<NodeJS.Timeout | undefined>(undefined);

    const playAudio = useCallback(
        async (audio: string | ArrayBuffer, onPlayerStop?: (args?: any) => any, args?: any) => {
            try {
                if (audioCtxRef.current === null) {
                    audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)({
                        latencyHint: "playback",
                        sampleRate: 24000 /* ALL OPENAI SYNTHESIZED AUDIOS ARE SAMPLED AT 24KHZ */,
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

                volUpdateIntervalRef.current = setInterval(() => {
                    analyzer.getFloatTimeDomainData(dataArray);
                    const volume = calculateVolumeLevel(dataArray);
                    onVolumeChange && onVolumeChange(volume);
                }, 100); //ms - animation takes a 100ms to complete

                bufferedSource.addEventListener("ended", () => {
                    clearInterval(volUpdateIntervalRef.current);
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
                console.log("deleting existing audio context for speaker");
                const FADE_DURATION_SEC = 1;
                const now = audioCtxRef.current.currentTime;
                gainNodeRef.current.gain.exponentialRampToValueAtTime(0.01, now + FADE_DURATION_SEC);
                clearInterval(volUpdateIntervalRef.current);

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

    - add modal to confirm device settings before launching app
    - reduce latency... 
        use webRTC to eliminate TCP connection overhead and reduce network latency? stream stt response?
        local tts/stt solution? 
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
    const dataArrayRef = useRef<Float32Array | null>(null);
    const analyzerRef = useRef<AnalyserNode | null>(null);
    const microphoneRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const abortControllerRef = useRef<AbortController | undefined>(undefined);
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
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    autoGainControl: true,
                    noiseSuppression: true,
                },
            });

            vadRef.current = await MicVAD.new({
                stream,
                positiveSpeechThreshold: VAD_SPEECH_THRESHOLD,
                onFrameProcessed(probabilities) {
                    /* we can get a rough estimate of volume by computing the RMS of the PCM data */
                    if (analyzerRef.current && dataArrayRef.current) {
                        analyzerRef.current.getFloatTimeDomainData(dataArrayRef.current);
                        setVolume(calculateVolumeLevel(dataArrayRef.current));
                    }
                },
                onSpeechStart() {
                    /* tell anwana to shut up and cancel any inflight requests */
                    stopAudio();
                    abortControllerRef.current?.abort("new user query detected");

                    /* create new audioCtx fr mic */
                    if (audioCtxRef.current === null)
                        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
                    microphoneRef.current = audioCtxRef.current.createMediaStreamSource(stream);

                    analyzerRef.current = audioCtxRef.current.createAnalyser();
                    analyzerRef.current.fftSize = 2048;

                    dataArrayRef.current = new Float32Array(analyzerRef.current.frequencyBinCount);
                    microphoneRef.current.connect(analyzerRef.current);
                },
                onSpeechEnd(audio) {
                    /* cleanup */
                    analyzerRef.current?.disconnect();
                    microphoneRef.current?.disconnect();
                    audioCtxRef.current?.close();
                    dataArrayRef.current = null;
                    audioCtxRef.current = null;
                    microphoneRef.current = null;
                    analyzerRef.current = null;

                    /* audio is a Float32Array sampled at 16000 HZ */
                    const wavBuffer = utils.encodeWAV(audio);
                    const blob = new Blob([wavBuffer]);

                    setLoadGptResponse("loading");
                    const onGptResponseReceived = (audio: ArrayBuffer) => {
                        setLoadGptResponse("success");
                        playAudio(audio);
                    };
                    abortControllerRef.current = new AbortController();
                    getGptResponseToQuery(
                        "/api/gpt",
                        blob,
                        "audio/wav",
                        onGptResponseReceived,
                        abortControllerRef.current.signal
                    ).catch((err) => {
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
            audioCtxRef.current?.close();
            audioCtxRef.current = null;
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
