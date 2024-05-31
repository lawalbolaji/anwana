"use client";

import { JSX, SVGProps, useState } from "react";

type recorderState = "recording" | "stopped";

export function VoiceRecorder() {
    const [recorderState, setRecorderState] = useState<recorderState>("stopped");

    return (
        <div className="flex flex-col items-center justify-center h-screen">
            {recorderState === "stopped" ? (
                <button
                    onClick={() => {
                        
                        setRecorderState("recording");
                    }}
                    className="relative flex items-center justify-center w-32 h-32 rounded-full bg-[#FF5722] text-white font-bold text-4xl shadow-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-[#FF5722] focus:ring-opacity-50"
                >
                    <MicIcon className="h-12 w-12" />
                </button>
            ) : (
                <button
                    onClick={() => {
                        setRecorderState("stopped");
                    }}
                    className="relative flex items-center justify-center w-32 h-32 rounded-full bg-[#e7dbd8] text-[#e7dbd8] font-bold text-4xl shadow-lg transition-all duration-300 ease-in-out transform hover:scale-105"
                >
                    <div className="absolute w-24 h-24 rounded-full bg-[#e5dddb] opacity-50 animate-ping" />
                    <StopIcon className="h-12 w-12" />
                </button>
            )}
        </div>
    );
}

function MicIcon(props: JSX.IntrinsicAttributes & SVGProps<SVGSVGElement>) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
        </svg>
    );
}

function StopIcon(props: JSX.IntrinsicAttributes & SVGProps<SVGSVGElement>) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="#FF5722"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect x="3" y="3" width="18" height="18" />
        </svg>
    );
}
