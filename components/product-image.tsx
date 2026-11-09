"use client";
import Image from "next/image";
import { useState } from "react";
export function ProductImage({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  // Remote catalog images can disappear. Fall back locally without changing the card layout.
  return (
    <Image
      src={failed ? "/shoes.webp" : src}
      alt={name}
      fill
      sizes="(max-width: 560px) 90vw, (max-width: 900px) 45vw, 23vw"
      className="object-contain"
      onError={() => setFailed(true)}
    />
  );
}
