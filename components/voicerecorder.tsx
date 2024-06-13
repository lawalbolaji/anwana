"use client";

/* prettier-ignore */
import { Dispatch, HTMLAttributes, MouseEventHandler, MutableRefObject, SVGProps, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from "react";
import MicIcon from "./icons/micicon";
import { useStopWatch } from "./hooks/usestopwatch";
import { formatTime } from "../lib/utils";
import { RECORDING_SLICE_DURATION } from "../lib/constants";

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

async function startRecorder(
    recorderRef: MutableRefObject<MediaRecorder | null>,
    audioChunkRef: MutableRefObject<BlobPart[]>,
    audioStreamRef: MutableRefObject<MediaStream | undefined>,
    playResponse: (objUrl: string) => void,
    setLoadGptResponse: Dispatch<SetStateAction<"idle" | "success" | "loading" | "error">>,
    supportedMimeType: MutableRefObject<supportedMimeTypes>
) {
    if (navigator.mediaDevices) {
        try {
            audioChunkRef.current = [];
            audioStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });

            // check supported audio mimeTypes
            if (MediaRecorder.isTypeSupported("audio/webm")) {
                supportedMimeType.current = "audio/webm";
            } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
                supportedMimeType.current = "audio/ogg";
            } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
                supportedMimeType.current = "audio/mp4";
            } else {
                throw new Error("unsupported audio format");
            }

            const recorder = new MediaRecorder(audioStreamRef.current, {
                mimeType: supportedMimeType.current,
            });

            recorderRef.current = recorder;
            recorder.ondataavailable = (event: BlobEvent) => {
                audioChunkRef.current.push(event.data);
            };

            recorder.onstop = () => {
                const audioBlob = new Blob(audioChunkRef.current, { type: supportedMimeType.current });

                /* upload audio to backend */
                setLoadGptResponse("loading");
                const onGptResponseReceived = (audio: Blob) => {
                    setLoadGptResponse("success");
                    playResponse(URL.createObjectURL(audio));
                };
                getGptResponseToQuery("/api/gpt", audioBlob, supportedMimeType.current, onGptResponseReceived).catch(
                    (err) => {
                        console.error(err);
                        logRemoteError(err);
                    }
                );

                if (recorderRef.current && recorderRef.current.state !== "inactive") {
                    recorderRef.current = null;
                }
            };

            /* For some reason, the mp4 file generated by apple's web engine e.g. safari, chrome on iphone etc. cannot be interpreted 
                unless you add a time slice of 1second to the mediaRecorder as is the case here
                
                Other references to same issue: https://community.openai.com/t/whisper-api-completely-wrong-for-mp4/289256/11
                */
            recorder.start(RECORDING_SLICE_DURATION);
        } catch (error: unknown) {
            console.error(error);
            logRemoteError(error);
        }
    }
}

function stopRecorder(recorderRef: MutableRefObject<MediaRecorder | null>, stream?: MediaStream) {
    recorderRef.current?.stop();
    stream?.getTracks().forEach((track) => track.stop());
}

async function getGptResponseToQuery(url: string, audioBlob: Blob, fileType: string, cb: (data: Blob) => void) {
    try {
        const formData = new FormData();
        formData.append("audio_blob", audioBlob, "file");
        formData.append("type", fileType);

        const response = await fetch(url, {
            method: "POST",
            cache: "no-cache",
            body: formData,
        });

        if (!response.ok) throw new Error(response.statusText);

        const audioResponseBlob = await response.blob();
        cb(audioResponseBlob);
    } catch (error) {
        logRemoteError(error);
        console.error(error);
    }
}

type audioPlayerState = "stopped" | "playing";

function useAudioConfig(audioElementRef: MutableRefObject<HTMLAudioElement | null>) {
    const [playerState, setPlayerState] = useState<audioPlayerState>("stopped");
    const playAudio = useCallback(
        (audio: string, onPlayerStop?: (args?: any) => any, args?: any) => {
            try {
                if (audioElementRef.current === null) audioElementRef.current = new Audio();

                audioElementRef.current.src = audio;
                audioElementRef.current.play();

                /* safari does not play audio longer than a few seconds and immediately sets it in a paused state */
                if (audioElementRef.current.paused) {
                    logRemoteError({ message: "audio is not playing" });
                    return;
                }

                setPlayerState("playing");
                audioElementRef.current.onended = () => {
                    setPlayerState("stopped");
                    onPlayerStop && onPlayerStop(args);
                };
            } catch (error) {
                console.error(error);
                logRemoteError(error);
            }

            return () => {
                setPlayerState("stopped");
            };
        },
        [audioElementRef]
    );

    return { playAudio, playerState };
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
    const { playAudio, playerState } = useAudioConfig(audioElementRef);

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

    async function handleStartRecording() {
        try {
            await startRecorder(
                recorderRef,
                audioChunkRef,
                audioStreamRef,
                playAudio,
                setLoadGptResponse,
                supportedMimeType
            );
            setRecorderState("recording");
            startTimer();
        } catch (error: unknown) {
            console.error(error);
            logRemoteError(error);
        }
    }

    async function handleStopRecording() {
        try {
            stopRecorder(recorderRef, audioStreamRef.current);
            setRecorderState("stopped");
            clearTimer();
        } catch (error: unknown) {
            console.error(error);
            logRemoteError(error);
        }
    }

    const { timeInSeconds, startTimer, clearTimer } = useStopWatch();

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

                <div className="w-[70%] flex flex-grow items-center justify-center relative">
                    <div id="wrapper" className="border p-8 flex items-center justify-center rounded-full shadow-III">
                        <div
                            id="inner-circle"
                            className="border p-8 flex items-center justify-center rounded-full shadow-II bg-gradient-to-br from-[#d099d7] via-[#575dea] to-[#66bcfe]"
                        >
                            <div
                                id="bubble"
                                className="p-4 flex items-center justify-center font-bold text-sm rounded-full shadow-I text-white bg-gradient-to-tr from-[#d099d7] via-[#575dea] to-[#66bcfe]"
                            >
                                {playerState === "playing" ? (
                                    <div className="absolute w-32 h-32 rounded-full bg-[#e5dddb] opacity-50 animate-ping" />
                                ) : (
                                    <></>
                                )}
                                <MicIcon className="h-18 w-18" />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col items-center justify-center w-full">
                    {loadGptResponse === "loading" ? (
                        <Spinner />
                    ) : recorderState === "stopped" ? (
                        <div className="h-full w-full py-4 flex flex-col items-center justify-center">
                            <RecordingActionButton
                                onClick={handleStartRecording}
                                label={"Start recording"}
                                icon={<RecorderIcon className="h-8 w-8" />}
                                className="start-recording"
                                ready={appReady}
                            />
                        </div>
                    ) : (
                        <div className="h-full w-full py-4 flex flex-col items-center justify-center">
                            <RecordingActionButton
                                onClick={handleStopRecording}
                                label={"Stop recording"}
                                icon={<>{formatTime(timeInSeconds)}</>}
                                className="stop-recording"
                                ready={appReady}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

type recAxnButtonProps = {
    onClick: MouseEventHandler<HTMLButtonElement>;
    icon: JSX.Element;
    label: string;
    className?: HTMLAttributes<HTMLDivElement>["className"];
    ready: boolean;
};

function RecordingActionButton(props: recAxnButtonProps) {
    return (
        <button
            onClick={props.onClick}
            className={`py-4 px-12 rounded-[3rem] shadow-xl bg-gradient-to-br from-[#d099d7] via-[#575dea] to-[#66bcfe] fill-white transition ease-in-out hover:-translate-y-1 hover:scale-110 tap:-translate-y-1 tap:scale-110 ${props.className}`}
            aria-disabled={!props.ready}
            disabled={!props.ready}
        >
            <span className="flex flex-row items-center justify-center w-full h-full font-bold">
                <span className="flex leading-8">{props.icon}</span>
                <span className="px-2">{props.label}</span>
            </span>
        </button>
    );
}

function Spinner() {
    return (
        <div className="h-full w-full py-4 flex flex-col items-center justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-gray-300 border-t-[#d099d750]" />
        </div>
    );
}

function RecorderIcon(props: JSX.IntrinsicAttributes & SVGProps<SVGSVGElement>) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            version="1.1"
            x="0px"
            y="0px"
            viewBox="0 0 32 32"
            enableBackground="new 0 0 32 32"
        >
            <path d="M24,10c-3.3085938,0-6,2.6914063-6,6c0,1.5375366,0.5861816,2.9371948,1.5404663,4h-7.0809326  C13.4138184,18.9371948,14,17.5375366,14,16c0-3.3085938-2.6914063-6-6-6s-6,2.6914063-6,6s2.6914063,6,6,6h16  c3.3085938,0,6-2.6914063,6-6S27.3085938,10,24,10z M4,16c0-2.2055664,1.7939453-4,4-4s4,1.7944336,4,4s-1.7939453,4-4,4  S4,18.2055664,4,16z M24,20c-2.2060547,0-4-1.7944336-4-4s1.7939453-4,4-4s4,1.7944336,4,4S26.2060547,20,24,20z" />
        </svg>
    );
}
