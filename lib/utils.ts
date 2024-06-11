import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/* takes seconds and converts to 00:00 representation */
export const formatTime = (timeInSeconds: number) => {
    const minutes = String(Math.floor(timeInSeconds / 60)).padStart(2, "0");
    const seconds = String(timeInSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
};

export function throttle(mainFunction: (...args: Array<any>) => void, delay: number) {
    let timerFlag: NodeJS.Timeout | null = null;

    return (...args: Array<any>) => {
        if (timerFlag === null) {
            mainFunction(...args);
            timerFlag = setTimeout(() => {
                timerFlag = null;
            }, delay);
        }
    };
}
