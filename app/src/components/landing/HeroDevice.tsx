"use client";

import { useFestival } from "@/lib/festival";
import { Device } from "../device/Device";

export function HeroDevice() {
  const fest = useFestival();
  return (
    <Device
      image={fest ? "/art/diwali/diya.jpg" : "/art/fox.jpg"}
      mood="idle"
      label={fest ? "A Familiar device showing a fox holding a diya" : "A Familiar device showing a fox hatchling"}
      className="aspect-square w-full max-w-[520px]"
    />
  );
}
