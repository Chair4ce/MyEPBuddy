import type { ReactElement } from "react";

/** Dark-mode tokens from `src/app/globals.css` (Satori cannot read CSS vars). */
const THEME = {
  background: "#181717",
  card: "#1f1e1e",
  primary: "#818cf8",
  primarySoft: "rgba(129, 140, 248, 0.16)",
  foreground: "#f7f5f4",
  muted: "#afacab",
  hairline: "rgba(255, 255, 255, 0.08)",
  unclassified: "#15803d",
} as const;

const LOGO_PATH_A =
  "M9.50422 4.79102L21.8489 4.79074C21.8555 4.79102 22.604 4.75032 23.0328 5.01185C23.3211 5.18768 23.6069 5.41869 23.7957 5.80477C23.8893 5.99609 23.9075 6.11852 23.9582 6.32539C24.0229 6.58986 24.0415 6.74283 24.0696 7.01367C24.1014 7.32043 24.1 7.44232 24.1 7.80281C24.1 7.80281 25.5938 7.81212 26.071 7.91171C26.7331 8.04991 27.0619 8.24822 27.5774 8.73562C28.0773 9.20837 28.3126 9.67163 28.5627 10.3778C28.8831 11.2824 28.8243 11.9163 28.7168 12.8921C28.631 13.6709 28.4942 14.0985 28.2302 14.816C28.0095 15.416 27.8636 15.7496 27.5384 16.2752C27.3068 16.6496 26.88 17.1662 26.8725 17.1753C26.8723 17.1662 26.8606 16.5932 26.8157 16.2695C26.7638 15.8956 26.6697 15.5497 26.4198 15.1383C26.2058 14.786 26.0122 14.518 25.6692 14.3819C24.9691 14.1043 23.6362 14.1636 22.3399 14.2879C21.1042 14.4064 19.2208 14.9627 19.1905 14.9716C18.7542 15.15 18.4008 15.2772 18.0535 15.4108C17.8617 15.4846 17.6717 15.5606 17.4705 15.6483L24.8098 25.6578L13.9526 25.6125L2.99361 10.624V7.47097L14.9069 23.7636H21.1347L5.99361 3.1634V0L7.6659 2.29448L9.50422 4.79102ZM21.1871 6.5296H10.6897L16.4159 14.2299C16.5741 14.1627 16.7608 14.0844 16.9875 13.9909C17.0901 13.9486 17.2012 13.9034 17.3212 13.8541C18.0873 13.5392 19.3055 13.1442 19.3178 13.1402C19.3253 13.1382 20.5933 12.8018 21.4179 12.6743C22.9659 12.4349 23.4726 12.3729 24.9789 12.441C25.5745 12.4679 25.9404 12.5628 26.4377 12.8921C26.708 13.0711 27.1803 13.6406 27.1803 13.6406C27.1803 13.6406 27.3549 12.679 27.3844 12.1473C27.4149 11.5947 27.4152 11.2252 27.1803 10.75C26.95 10.2841 26.7405 10.1119 26.3366 9.87672C25.8309 9.58238 25.3916 9.48545 24.7879 9.48545H20.4007L19.3086 7.80281H22.5365C22.5365 7.66326 22.5344 7.47191 22.5005 7.30144C22.4521 7.05851 22.3687 6.79515 22.1349 6.65338C21.8909 6.5054 21.1871 6.5296 21.1871 6.5296Z";

const LOGO_PATH_B =
  "M6.4116 23.7636H10.0106L11.1847 25.6125H5.4372L0 18.2087L0.00196727 14.9716L6.4116 23.7636Z";

export type OgSocialCardProps = {
  width: number;
  height: number;
  tagline: string;
  chips: string[];
};

/**
 * Shared Open Graph / Twitter card layout. Satori requires `display: flex`
 * on every box — keep this file free of Tailwind and CSS variables.
 */
export function OgSocialCard({
  width,
  height,
  tagline,
  chips,
}: OgSocialCardProps): ReactElement {
  const compact = height < 620;
  const logoWidth = compact ? 72 : 88;
  const logoHeight = Math.round(logoWidth * (26 / 29));

  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: THEME.background,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: height * 0.62,
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(129, 140, 248, 0.22) 0%, rgba(129, 140, 248, 0) 62%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 36,
          display: "flex",
          alignItems: "center",
          padding: "6px 14px",
          borderRadius: 6,
          backgroundColor: THEME.unclassified,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.12em",
            color: "#ffffff",
          }}
        >
          UNCLASSIFIED
        </span>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: width - 160,
          padding: compact ? "36px 48px 32px" : "44px 56px 36px",
          backgroundColor: THEME.card,
          borderRadius: 16,
          boxShadow:
            "0 1px 2px rgba(0,0,0,0.35), 0 12px 40px rgba(0,0,0,0.28), 0 0 0 0.5px rgba(255,255,255,0.08)",
        }}
      >
        <svg
          width={logoWidth}
          height={logoHeight}
          viewBox="0 0 29 26"
          fill="none"
          style={{ marginBottom: 16 }}
        >
          <path fillRule="evenodd" clipRule="evenodd" d={LOGO_PATH_A} fill={THEME.primary} />
          <path d={LOGO_PATH_B} fill={THEME.primary} />
        </svg>

        <div
          style={{
            display: "flex",
            fontSize: compact ? 56 : 64,
            fontWeight: 700,
            color: THEME.foreground,
            letterSpacing: "-0.03em",
            lineHeight: 1.05,
          }}
        >
          myEPBuddy
        </div>

        <div
          style={{
            display: "flex",
            marginTop: 16,
            fontSize: compact ? 24 : 26,
            color: THEME.muted,
            textAlign: "center",
            lineHeight: 1.35,
            maxWidth: 820,
          }}
        >
          {tagline}
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            marginTop: compact ? 28 : 32,
          }}
        >
          {chips.map((chip) => (
            <div
              key={chip}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "10px 18px",
                backgroundColor: THEME.primarySoft,
                borderRadius: 10,
                boxShadow: `0 0 0 0.5px ${THEME.hairline}`,
              }}
            >
              <span
                style={{
                  fontSize: compact ? 16 : 18,
                  color: THEME.foreground,
                  fontWeight: 500,
                }}
              >
                {chip}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 28,
          display: "flex",
          fontSize: 18,
          color: THEME.muted,
          letterSpacing: "0.04em",
        }}
      >
        myepbuddy.com
      </div>
    </div>
  );
}
