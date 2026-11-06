"use client";

import { ContactShadows, useTexture } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Component, Suspense, useMemo, useRef } from "react";
import * as THREE from "three";

export type DeviceMood = "idle" | "listening" | "thinking" | "asleep" | "hatching";

export interface DeviceProps {
  /** Image shown on the round screen (the Familiar's latest portrait). */
  image: string;
  mood?: DeviceMood;
  /** Live microphone level 0..1 while listening. */
  level?: React.RefObject<number>;
  reducedMotion?: boolean;
  onPet?: () => void;
  /** Called once the WebGL scene has been created. */
  onReady?: () => void;
}

const IVORY = new THREE.Color("#FBF6EF");
const TERRACOTTA = new THREE.Color("#953E32");
const SOFT = new THREE.Color("#D37D6F");

/** Egg profile, revolved around Y: slightly wider at the bottom, like a real egg. */
function eggGeometry() {
  const pts: THREE.Vector2[] = [];
  const N = 64;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI;
    const y = -Math.cos(t) * 1.22;
    const r = Math.sin(t) * 0.98 * (1 + 0.11 * Math.cos(t));
    pts.push(new THREE.Vector2(Math.max(r, 0.0001), y));
  }
  const g = new THREE.LatheGeometry(pts, 96);
  g.computeVertexNormals();
  return g;
}

function Screen({ image, dim }: { image: string; dim: boolean }) {
  const tex = useTexture(image, (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
  });
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((_, dt) => {
    if (!mat.current) return;
    const target = dim ? 0.42 : 1;
    const c = mat.current.color;
    const v = THREE.MathUtils.damp(c.r, target, 4, dt);
    c.setRGB(v, v, v);
  });
  return (
    <mesh position={[0, 0.2, 1.016]}>
      <circleGeometry args={[0.45, 96]} />
      <meshBasicMaterial ref={mat} map={tex} toneMapped={false} />
    </mesh>
  );
}

/** If a portrait can't load (CORS, 404), show a blank linen screen instead of breaking the scene. */
class ScreenBoundary extends Component<{ children: React.ReactNode; resetKey: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }
  render() {
    if (this.state.failed) {
      return (
        <mesh position={[0, 0.2, 1.016]}>
          <circleGeometry args={[0.45, 96]} />
          <meshBasicMaterial color="#FAF8F3" toneMapped={false} />
        </mesh>
      );
    }
    return this.props.children;
  }
}

function Body({ image, mood = "idle", level, reducedMotion, onPet }: DeviceProps) {
  const group = useRef<THREE.Group>(null);
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  const pet = useRef(0);
  const geo = useMemo(() => eggGeometry(), []);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    const lvl = level?.current ?? 0;
    const calm = reducedMotion ? 0 : 1;
    const asleep = mood === "asleep";

    // Float + breathe (slower when asleep), plus a voice-driven swell while listening.
    const bob = Math.sin(t * (asleep ? 0.55 : 0.9)) * (asleep ? 0.025 : 0.055) * calm;
    const swell = mood === "listening" ? lvl * 0.06 : 0;
    g.position.y = THREE.MathUtils.damp(g.position.y, bob, 6, dt);
    const s = 1 + swell + Math.sin(t * 1.6) * 0.006 * calm;
    g.scale.setScalar(THREE.MathUtils.damp(g.scale.x, s, 10, dt));

    // Follow the pointer gently; wobble while thinking; shake while hatching; wiggle when petted.
    const px = state.pointer.x * 0.35 * calm;
    const py = state.pointer.y * 0.18 * calm;
    const think = mood === "thinking" ? Math.sin(t * 2.2) * 0.12 * calm : 0;
    const hatch = mood === "hatching" ? Math.sin(t * 38) * 0.06 * calm : 0;
    pet.current = THREE.MathUtils.damp(pet.current, 0, 3.5, dt);
    const wiggle = Math.sin(t * 22) * pet.current * 0.18 * calm;
    g.rotation.y = THREE.MathUtils.damp(g.rotation.y, px + think, 4, dt);
    g.rotation.x = THREE.MathUtils.damp(g.rotation.x, -py * 0.6, 4, dt);
    g.rotation.z = hatch + wiggle;

    if (glow.current) {
      const target = mood === "listening" ? 0.35 + lvl * 1.6 : mood === "thinking" ? 0.35 + (Math.sin(t * 3) + 1) * 0.25 : asleep ? 0.0 : 0.12;
      glow.current.emissiveIntensity = THREE.MathUtils.damp(glow.current.emissiveIntensity, target, 8, dt);
    }
  });

  return (
    <group
      ref={group}
      onPointerDown={(e) => {
        e.stopPropagation();
        pet.current = 1;
        onPet?.();
      }}
    >
      {/* Shell */}
      <mesh geometry={geo} castShadow>
        <meshPhysicalMaterial color={IVORY} roughness={0.42} clearcoat={0.85} clearcoatRoughness={0.25} sheen={0.4} sheenColor={SOFT} sheenRoughness={0.8} />
      </mesh>
      {/* Raised screen window: a soft puck set into the shell, like a real handheld */}
      <mesh position={[0, 0.2, 0.86]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.58, 0.62, 0.3, 96]} />
        <meshPhysicalMaterial color={IVORY} roughness={0.35} clearcoat={1} clearcoatRoughness={0.2} />
      </mesh>
      {/* Bezel ring around the screen (doubles as the listening glow) */}
      <mesh position={[0, 0.2, 1.013]}>
        <ringGeometry args={[0.45, 0.54, 96]} />
        <meshStandardMaterial ref={glow} color={TERRACOTTA} emissive={SOFT} emissiveIntensity={0.12} roughness={0.5} />
      </mesh>
      <ScreenBoundary resetKey={image}>
        <Suspense fallback={null}>
          <Screen image={image} dim={mood === "asleep"} />
        </Suspense>
      </ScreenBoundary>
      {/* Three soft buttons */}
      {[-0.24, 0, 0.24].map((x, i) => (
        <mesh key={x} position={[x, -0.62 - (i === 1 ? 0.06 : 0), 0.9 - Math.abs(x) * 0.22]} scale={[1, 1, 0.55]}>
          <sphereGeometry args={[0.075, 32, 32]} />
          <meshPhysicalMaterial color={i === 1 ? TERRACOTTA : SOFT} roughness={0.35} clearcoat={1} />
        </mesh>
      ))}
      {/* Keyring loop */}
      <mesh position={[0, 1.31, 0]}>
        <torusGeometry args={[0.12, 0.032, 16, 48]} />
        <meshPhysicalMaterial color={TERRACOTTA} roughness={0.4} clearcoat={0.6} />
      </mesh>
    </group>
  );
}

export default function Device3D(props: DeviceProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0.02, 4.75], fov: 34 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power", toneMapping: THREE.NeutralToneMapping }}
      onCreated={() => props.onReady?.()}
      style={{ touchAction: "pan-y" }}
      aria-hidden
    >
      <hemisphereLight args={["#fffaf3", "#e6d3c4", 1.9]} />
      <directionalLight position={[2.5, 3.5, 4]} intensity={2.2} color="#fff6ec" />
      <directionalLight position={[-3, 1, 2]} intensity={0.6} color="#f6c8b8" />
      <directionalLight position={[0, -2, -3]} intensity={0.5} color="#f1b9a6" />
      <Body {...props} />
      <ContactShadows position={[0, -1.42, 0]} opacity={0.32} scale={4} blur={2.6} far={2} color="#5a3a2e" />
    </Canvas>
  );
}
