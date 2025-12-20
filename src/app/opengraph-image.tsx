import { ImageResponse } from "next/og";

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
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Background pattern */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.03'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            opacity: 0.5,
          }}
        />

        {/* Air Force star accent */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 40,
            left: 60,
            fontSize: 24,
            color: "#60a5fa",
            fontWeight: "bold",
            letterSpacing: "0.1em",
          }}
        >
        </div>

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "0 60px",
          }}
        >
          {/* Logo/Title */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: 16,
                background: "linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 24,
                boxShadow: "0 8px 32px rgba(59, 130, 246, 0.4)",
              }}
            >
              <span style={{ fontSize: 40, color: "white", fontWeight: "bold" }}>
                EP
              </span>
            </div>
            <span
              style={{
                fontSize: 72,
                fontWeight: "bold",
                color: "white",
                letterSpacing: "-0.02em",
              }}
            >
              My EPBuddy
            </span>
          </div>

          {/* Tagline */}
          <div
            style={{
              fontSize: 32,
              color: "#94a3b8",
              marginBottom: 40,
              maxWidth: 900,
              lineHeight: 1.4,
            }}
          >
            Generate myEval-Ready Enlisted Performance Brief Statements
          </div>

          {/* Features */}
          <div
            style={{
              display: "flex",
              gap: 40,
            }}
          >
            {[
              "AI-Powered",
              "AFI 36-2406 Compliant",
              "Track Accomplishments",
            ].map((feature) => (
              <div
                key={feature}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 24px",
                  background: "rgba(255, 255, 255, 0.1)",
                  borderRadius: 30,
                  border: "1px solid rgba(255, 255, 255, 0.2)",
                }}
              >
                <span style={{ color: "#22c55e", fontSize: 20 }}>✓</span>
                <span style={{ color: "#e2e8f0", fontSize: 20 }}>{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* URL at bottom */}
        <div
          style={{
            position: "absolute",
            bottom: 40,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span
            style={{
              fontSize: 24,
              color: "#64748b",
              letterSpacing: "0.05em",
            }}
          >
            MyEPBuddy.com
          </span>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}

