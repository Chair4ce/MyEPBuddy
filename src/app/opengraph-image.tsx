import { ImageResponse } from "next/og";
import { OgSocialCard } from "@/lib/og-social-card";

export const runtime = "edge";

export const alt = "My EPBuddy - Air Force EPB Statement Generator";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <OgSocialCard
        width={size.width}
        height={size.height}
        tagline="AI-powered EPB writing for Air Force enlisted"
        chips={["AFI 36-2406", "Track accomplishments", "myEval ready"]}
      />
    ),
    { ...size }
  );
}
