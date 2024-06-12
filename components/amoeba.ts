import * as THREE from "three";
import Perlin from "@/lib/noise";
import { MutableRefObject } from "react";

const noise = new Perlin();

// Function to generate amoeba-like shape
const generateAmoebaGeometry = (radius: number, segments: number) => {
    const geometry = new THREE.CircleGeometry(radius, segments);
    const positionAttribute = geometry.attributes.position;

    for (let i = 0; i < positionAttribute.count; i++) {
        const angle = (i / (positionAttribute.count - 1)) * Math.PI * 2;
        const perlinValue = noise.perlin2(Math.cos(angle) * 0.9, Math.sin(angle) * 0.2);

        const offset = perlinValue * 3; // Adjust the amplitude of deformation

        positionAttribute.setXYZ(i, (radius + offset) * Math.cos(angle), (radius + offset) * Math.sin(angle), 0);
    }

    positionAttribute.needsUpdate = true;
    return geometry;
};

// Using the custom amoeba-like geometry
export const renderAmoeba = (
    amoebaRef: MutableRefObject<THREE.Mesh | null>,
    sceneRef: MutableRefObject<THREE.Scene>
) => {
    const radius = 10;
    const segments = 64;
    const geometry = generateAmoebaGeometry(radius, segments);
    const material = new THREE.MeshBasicMaterial({ color: 0xecd9ba });
    const amoeba = new THREE.Mesh(geometry, material);
    amoebaRef.current = amoeba;
    sceneRef.current.add(amoeba);
    amoeba.position.set(0, 0, 0);
};

export const removeAmoeba = (
    amoebaRef: MutableRefObject<THREE.Mesh | null>,
    sceneRef: MutableRefObject<THREE.Scene>
) => {
    if (amoebaRef.current) {
        sceneRef.current.remove(amoebaRef.current);
        amoebaRef.current.geometry.dispose();
        (amoebaRef.current.material as THREE.Material).dispose();
        amoebaRef.current = null;
    }
};
