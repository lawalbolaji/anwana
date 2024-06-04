import { useState, useRef } from "react";

export function useStopWatch() {
    const [timeInSeconds, setTimeInSeconds] = useState(0);
    const timerRef = useRef<NodeJS.Timeout>();

    const startTimer = () => {
        timerRef.current = setInterval(() => {
            setTimeInSeconds((timeInSeconds) => timeInSeconds + 1);
        }, 1_000);
    };

    const clearTimer = () => {
        clearInterval(timerRef.current);
        setTimeInSeconds(0);
    };

    return { timeInSeconds, startTimer, clearTimer };
}
