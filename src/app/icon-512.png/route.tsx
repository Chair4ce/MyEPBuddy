import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
          borderRadius: 64,
        }}
      >
        <span
          style={{
            fontSize: 256,
            fontWeight: "bold",
            color: "white",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          EP
        </span>
      </div>
    ),
    {
      width: 512,
      height: 512,
    }
  );
}



