import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, Mesh } from "three";
import type { Emotion } from "../../logic/doo/types";

type Props = {
  emotion: Emotion;
  isTalking?: boolean;
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


// 1 normal, below 1 squinting, above 1 wide open
const EYE_OPENNESS: Record<Emotion, number> = {
  neutral: 1,
  playful: 1.15,
  teasing: 0.45,
  curious: 1.5,
};

function DooCharacter({ emotion, isTalking = false }: Props) {
  const groupRef = useRef<Group>(null);
  const leftEyeRef = useRef<Mesh>(null);
  const rightEyeRef = useRef<Mesh>(null);
  const antennaTipRef = useRef<Mesh>(null);
  
  const mouthRef = useRef<Mesh>(null);
  const talkTimerRef = useRef(0);
  
  const scaleRef = useRef(1);
  const blinkTimerRef = useRef(0);
  const nextBlinkAtRef = useRef(2 + Math.random() * 3);
  const blinkProgressRef = useRef(0);

  useFrame((state, delta) => {
    const group = groupRef.current;
    if (!group) return;

    // idle "breathing" bob
    group.position.y = Math.sin(state.clock.elapsedTime * 1.5) * 0.08;

    // gentle idle rotation, faster when curious/playful
    const spinSpeed = emotion === "curious" ? 0.6 : emotion === "playful" ? 0.4 : 0.15;
    group.rotation.y += spinSpeed * 0.01;

    // smoothly lerp overall scale toward the target for the current emotion
    const target = TARGET_SCALE[emotion];
    scaleRef.current += (target - scaleRef.current) * 0.08;
    group.scale.setScalar(scaleRef.current);

    // antenna tip gentle pulsing glow
    if (antennaTipRef.current) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.1;
      antennaTipRef.current.scale.setScalar(pulse);
    }

    //  Blinking 
    blinkTimerRef.current += delta;
    const BLINK_DURATION = 0.15;

    if (blinkTimerRef.current >= nextBlinkAtRef.current) {
      blinkProgressRef.current += delta / BLINK_DURATION;
      if (blinkProgressRef.current >= 1) {
        blinkProgressRef.current = 0;
        blinkTimerRef.current = 0;
        nextBlinkAtRef.current = 2 + Math.random() * 3;
      }
    }

  //  Mouth
if (mouthRef.current) {
  if (isTalking) {
    talkTimerRef.current += delta * 10;
    const talkOpen = 0.3 + Math.abs(Math.sin(talkTimerRef.current)) * 0.7;
    mouthRef.current.scale.y = talkOpen;
  } else {
    // idle: small closed-mouth resting shape
    mouthRef.current.scale.y += (0.25 - mouthRef.current.scale.y) * 0.1;
  }
}

    // triangle wave
    const blinkAmount =
      blinkProgressRef.current <= 0.5
        ? blinkProgressRef.current * 2
        : (1 - blinkProgressRef.current) * 2;

    const baseOpenness = EYE_OPENNESS[emotion];
    const currentOpenness = baseOpenness * (1 - blinkAmount * 0.9);

    if (leftEyeRef.current) leftEyeRef.current.scale.y = currentOpenness;
    if (rightEyeRef.current) rightEyeRef.current.scale.y = currentOpenness;
  });

  return (
    <group ref={groupRef}>
      {/* Body */}
      <mesh scale={[1, 1.15, 1]}>
        <sphereGeometry args={[0.6, 32, 32]} />
        <meshStandardMaterial color={EMOTION_COLOR[emotion]} roughness={0.5} />
      </mesh>

      {/* Eyes */}
      <mesh ref={leftEyeRef} position={[-0.2, 0.15, 0.52]}>
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh ref={rightEyeRef} position={[0.2, 0.15, 0.52]}>
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>

      {/* Antenna, glowing tip */}
      <mesh position={[0, 0.85, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.35, 8]} />
        <meshStandardMaterial color="#4b5563" />
      </mesh>
      <mesh ref={antennaTipRef} position={[0, 1.05, 0]}>
        <sphereGeometry args={[0.07, 16, 16]} />
        <meshStandardMaterial
          color={EMOTION_COLOR[emotion]}
          emissive={EMOTION_COLOR[emotion]}
          emissiveIntensity={0.8}
        />
      </mesh>

      {/* Mouth */}
<mesh ref={mouthRef} position={[0, -0.08, 0.56]} scale={[1, 0.25, 1]}>
  <sphereGeometry args={[0.12, 16, 16]} />
  <meshStandardMaterial color="#1f2937" />
</mesh>
    </group>
  );
}

export default function Character3D({ emotion, isTalking }: Props) {
  return (
    <div style={{ width: "200px", height: "200px" }}>
      <Canvas camera={{ position: [0, 0, 3] }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 2, 2]} intensity={1} />
        <DooCharacter emotion={emotion} isTalking={isTalking} />
      </Canvas>
    </div>
  );
}