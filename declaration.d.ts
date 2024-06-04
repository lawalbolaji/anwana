// ref: https://github.com/microsoft/TypeScript/issues/31686#issuecomment-554478078
interface Window {
    webkitAudioContext: typeof AudioContext;
}
