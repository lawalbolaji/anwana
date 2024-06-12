import { MutableRefObject } from "react";
import * as THREE from "three";
import { CAPSULE_COLOR_HEX } from "../lib/constants";

export const renderCircle = (
    circleRef: MutableRefObject<THREE.Mesh | null>,
    sceneRef: MutableRefObject<THREE.Scene>
) => {
    const geometry = new THREE.CircleGeometry(10, 128);
    const material = new THREE.MeshBasicMaterial({ color: CAPSULE_COLOR_HEX });
    const circle = new THREE.Mesh(geometry, material);

    circleRef.current = circle;

    circle.scale.set(1, 1, 1);
    sceneRef.current.add(circle);
    circle.position.set(0, 0, 0);
};

export const removeCircle = (
    circleRef: MutableRefObject<THREE.Mesh | null>,
    sceneRef: MutableRefObject<THREE.Scene>
) => {
    if (circleRef.current) {
        sceneRef.current.remove(circleRef.current);
        circleRef.current.geometry.dispose();
        (circleRef.current.material as THREE.Material).dispose();
        circleRef.current = null;
    }
};
