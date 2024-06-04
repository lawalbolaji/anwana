import { useRef, useEffect } from "react";
import * as THREE from "three";

export default function AudioVisualizer({ audioSrc }: { audioSrc: string }) {
    const mountRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef(new THREE.Scene());
    const cameraRef = useRef(new THREE.PerspectiveCamera(75, 1, 0.1, 1000));
    const rendererRef = useRef(new THREE.WebGLRenderer());
    const capsulesRef = useRef<Array<THREE.Mesh>>([]);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const audioElementRef = useRef<HTMLAudioElement>(null);
    const animationIdRef = useRef<number | null>(null);

    useEffect(() => {
        const audioElRefObserver = audioElementRef.current;
        const rendererRefObserver = rendererRef.current;
        const renderer = rendererRef.current;
        renderer.setSize(
            mountRef.current?.clientWidth || window.innerWidth,
            mountRef.current?.clientHeight || window.innerHeight
        );
        mountRef.current?.appendChild(renderer.domElement);

        const camera = cameraRef.current;
        camera.position.z = 30;

        return () => {
            if (audioElRefObserver) {
                audioElRefObserver.pause();
                audioElRefObserver.src = "";
            }
            if (animationIdRef.current) {
                cancelAnimationFrame(animationIdRef.current);
            }
            if (rendererRefObserver) {
                rendererRefObserver.dispose();
                // rendererRefObserver.forceContextLoss();
            }
        };
    }, []);

    const startVisualizer = () => {
        // clear previous visualizers
        const scene = sceneRef.current;
        while (scene.children.length > 0) {
            scene.remove(scene.children[0]);
        }

        // Create bars for the visualizer
        const noOfCapsules = 5;
        const capsules: Array<THREE.Mesh> = [];
        const capsuleRadius = 3;
        const capsuleLength = 8;
        const capsuleSegments = 15;

        for (let i = 0; i < noOfCapsules; i++) {
            const geometry = new THREE.CapsuleGeometry(capsuleRadius, capsuleLength, capsuleSegments);
            const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const bar = new THREE.Mesh(geometry, material);

            bar.position.x = (i - (noOfCapsules - 1) / 2) * (capsuleRadius * 2.2);
            scene.add(bar);
            capsules.push(bar);
        }

        capsulesRef.current = capsules;

        // Create the audio context and analyser
        if (audioContextRef.current) audioContextRef.current.close();
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioContextRef.current = audioContext;

        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 64;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current = analyser;

        // Load and play the audio
        const audioElement = new Audio(audioSrc);
        audioElement.crossOrigin = "anonymous";
        audioElement.play();
        const audioSource = audioContext.createMediaElementSource(audioElement);
        audioSource.connect(analyser);
        analyser.connect(audioContext.destination);

        // Animate the visualizer
        const animate = () => {
            animationIdRef.current = requestAnimationFrame(animate);
            analyser.getByteFrequencyData(dataArray);

            for (let i = 0; i < noOfCapsules; i++) {
                const bar = capsules[i];
                bar.scale.y = dataArray[i] / 128.0;
                bar.position.y = bar.scale.y / 2 - 0.5;
            }

            rendererRef.current.render(scene, cameraRef.current);
        };

        animate();
    };

    return (
        <div className="h-full w-full" ref={mountRef}>
            <button onClick={startVisualizer}>Play</button>
        </div>
    );
}
