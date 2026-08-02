import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Mesh } from "three";
import type { Emotion } from "../../logic/doo/types";

type Props = {
  emotion: Emotion;
};

const EMOTION_COLOR: Record<Emotion, string> = {
  neutral: "#8b8f98",
  playful: "#7dd3fc",
  teasing: "#fb923c",
  curious: "#c084fc",
};

const TARGET_SCALE: Record<Emotion, number> = {
  neutral: 1,
  playful: 1.1,
  teasing: 0.95,
  curious: 1.2,
};

// NOTE: this is a placeholder box, not a rigged 3D model yet -- the CV/README
// describe it honestly as such. What this component DOES demonstrate is a
// real animation loop (idle bob + emotion-driven scale/rotation lerp) rather
// than a static mesh, which is the actual foundation a rigged model would
// plug into later.
function Robot({ emotion }: Props) {
  const meshRef = useRef<Mesh>(null);
  const scaleRef = useRef(1);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // idle "breathing" bob
    mesh.position.y = Math.sin(state.clock.elapsedTime * 1.5) * 0.08;

    // gentle idle rotation, faster when curious/playful
    const spinSpeed = emotion === "curious" ? 0.6 : emotion === "playful" ? 0.4 : 0.15;
    mesh.rotation.y += spinSpeed * 0.01;

    // smoothly lerp scale toward the target for the current emotion
    const target = TARGET_SCALE[emotion];
    scaleRef.current += (target - scaleRef.current) * 0.08;
    mesh.scale.setScalar(scaleRef.current);
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={EMOTION_COLOR[emotion]} />
    </mesh>
  );
}

export default function Character3D({ emotion }: Props) {
  return (
    <div style={{ width: "200px", height: "200px" }}>
      <Canvas camera={{ position: [0, 0, 3] }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 2, 2]} intensity={1} />
        <Robot emotion={emotion} />
      </Canvas>
    </div>
  );
}
