"use client";

import { useRef, useEffect, MutableRefObject, useCallback } from "react";
import * as THREE from "three";
import TWEEN, { Tween } from "@tweenjs/tween.js";
import { throttle } from "../lib/utils";

const WINDOW_RESIZE_THROTTLE_DELAY = 200; // ms

const renderCircle = (circleRef: MutableRefObject<THREE.Mesh | null>, sceneRef: MutableRefObject<THREE.Scene>) => {
    const geometry = new THREE.CircleGeometry(10, 128);
    const material = new THREE.MeshBasicMaterial({ color: 0xf8f5df });
    const circle = new THREE.Mesh(geometry, material);

    circleRef.current = circle;

    circle.scale.set(1, 1, 1);
    sceneRef.current.add(circle);
    circle.position.set(0, 0, 0);
};

const removeCircle = (circleRef: MutableRefObject<THREE.Mesh | null>, sceneRef: MutableRefObject<THREE.Scene>) => {
    if (circleRef.current) {
        sceneRef.current.remove(circleRef.current);
        circleRef.current.geometry.dispose();
        (circleRef.current.material as THREE.Material).dispose();
        circleRef.current = null;
    }
};

export default function useAudioVisualizer() {
    const mountRef = useRef<HTMLDivElement>(null);
    const sceneRef = useRef(new THREE.Scene());
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const capsulesRef = useRef<Array<THREE.Mesh>>([]);
    const circleRef = useRef<THREE.Mesh | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationIdRef = useRef<number | null>(null);

    useEffect(() => {
        const camera = new THREE.PerspectiveCamera(
            45,
            (mountRef.current?.clientWidth || window.innerWidth) /
                (mountRef.current?.clientHeight || window.innerHeight),
            0.1,
            1000
        );
        cameraRef.current = camera;
        camera.position.z = 30;

        // Create the renderer only once
        if (!rendererRef.current) {
            rendererRef.current = new THREE.WebGLRenderer();
        }

        const renderer = rendererRef.current;
        renderer.setSize(
            mountRef.current?.clientWidth || window.innerWidth,
            mountRef.current?.clientHeight || window.innerHeight
        );
        renderer.setClearColor(0x83aff0);
        mountRef.current?.appendChild(renderer.domElement);

        const resizeListener = throttle(() => {
            const aspectRatio = window.innerWidth / window.innerHeight;
            camera.aspect = aspectRatio;
            camera.updateProjectionMatrix();
            renderer.setSize(
                mountRef.current?.clientWidth || window.innerWidth,
                mountRef.current?.clientHeight || window.innerHeight
            );

            mountRef.current?.appendChild(renderer.domElement);
            renderCircle(circleRef, sceneRef);
            renderer.render(sceneRef.current, camera);
        }, WINDOW_RESIZE_THROTTLE_DELAY);

        window.addEventListener("resize", resizeListener);
        renderCircle(circleRef, sceneRef);
        renderer.render(sceneRef.current, cameraRef.current);

        return () => {
            if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
            if (rendererRef.current) rendererRef.current.dispose();
            if (audioContextRef.current) {
                audioContextRef.current.close();
                audioContextRef.current = null;
            }
            window.removeEventListener("resize", resizeListener);
        };
    }, []);

    const startVisualizer = useCallback((audioSrc: string) => {
        // clear previous visualizers
        const scene = sceneRef.current;
        while (scene.children.length > 0) {
            scene.remove(scene.children[0]);
        }

        // Create capsules for the visualizer
        const noOfCapsules = window.innerWidth > 480 ? 4 : 3;
        const capsules: Array<THREE.Mesh> = [];
        const capsuleRadius = 4;
        const capsuleLength = 3;
        const capsuleSegments = 10;

        for (let i = 0; i < noOfCapsules; i++) {
            const geometry = new THREE.CapsuleGeometry(capsuleRadius, capsuleLength, capsuleSegments);
            const material = new THREE.MeshBasicMaterial({ color: 0xf8f5df });
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
        analyser.fftSize = 32;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current = analyser;

        // Load and play the audio
        const audioElement = new Audio(audioSrc);
        audioElement.crossOrigin = "anonymous";

        audioElement.addEventListener("ended", () => {
            // Remove the capsules from the scene with animation
            const tweens: Tween<THREE.Vector3>[] = [];

            const centerX = 0; // Center X position for the capsules to converge
            capsulesRef.current.forEach((capsule, index) => {
                // const startPosition = capsule.position.clone();

                // First tween: Move the capsule towards the center
                const moveTween = new TWEEN.Tween(capsule.position)
                    .to({ x: centerX, y: capsule.position.y, z: capsule.position.z }, 1000)
                    .easing(TWEEN.Easing.Cubic.Out);

                // Second tween: Scale the capsule down to 0 after it reaches the center
                const scaleTween = new TWEEN.Tween(capsule.scale)
                    .to({ x: 0, y: 0, z: 0 }, 500)
                    .easing(TWEEN.Easing.Elastic.Out)
                    .delay(1000) // Delay the scale tween by 1 second
                    .onComplete(() => {
                        sceneRef.current.remove(capsule);
                    });

                // Chain the move and scale tweens together
                moveTween.chain(scaleTween).start();

                tweens.push(moveTween);
            });

            tweens
                .reduce((prev, cur) => prev.chain(cur), tweens[0].start())
                .onComplete(() => renderCircle(circleRef, sceneRef));
        });

        removeCircle(circleRef, sceneRef);

        audioElement.play();
        const audioSource = audioContext.createMediaElementSource(audioElement);
        audioSource.connect(analyser);
        analyser.connect(audioContext.destination);

        // Animate the visualizer
        const animate = () => {
            animationIdRef.current = requestAnimationFrame(animate);
            analyser.getByteFrequencyData(dataArray);

            TWEEN.update(); // Update the Tween engine

            for (let i = 0; i < noOfCapsules; i++) {
                const bar = capsules[i];
                bar.scale.y = dataArray[i] / 128.0;
                bar.position.y = bar.scale.y / 2 - 0.5;
            }

            if (cameraRef.current) rendererRef.current?.render(scene, cameraRef.current);
        };

        animate();
    }, []);

    return { startVisualizer, mountRef };
}
