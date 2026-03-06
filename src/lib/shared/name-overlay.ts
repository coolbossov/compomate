import type { NameStyleId } from "@/lib/shared/composition";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildNameOverlaySvg(
  canvasWidth: number,
  canvasHeight: number,
  firstName?: string,
  lastName?: string,
  style: NameStyleId = "classic",
): string | null {
  const first = (firstName ?? "").trim();
  const last = (lastName ?? "").trim();
  if (!first && !last) {
    return null;
  }

  const content = [first, last].filter(Boolean).join(" ").toUpperCase();
  const safeText = escapeXml(content);
  const baselineY = canvasHeight - Math.max(34, Math.round(canvasHeight * 0.05));
  const fontSize = Math.max(40, Math.round(canvasWidth * 0.038));

  if (style === "outline") {
    return `
      <svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
        <text x="50%" y="${baselineY}" text-anchor="middle"
          font-size="${fontSize}" font-family="Arial, Helvetica, sans-serif"
          font-weight="700" fill="rgba(255,255,255,0.08)" stroke="#ffffff" stroke-width="2.4"
          letter-spacing="0.07em">${safeText}</text>
      </svg>
    `;
  }

  if (style === "modern") {
    const modernSize = Math.max(34, Math.round(fontSize * 0.84));
    return `
      <svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="name-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#f8fbff" />
            <stop offset="100%" stop-color="#dce6ff" />
          </linearGradient>
        </defs>
        <text x="50%" y="${baselineY}" text-anchor="middle"
          font-size="${modernSize}" font-family="Avenir Next, Helvetica Neue, Arial, sans-serif"
          font-weight="600" fill="url(#name-grad)" letter-spacing="0.16em">${safeText}</text>
      </svg>
    `;
  }

  return `
    <svg width="${canvasWidth}" height="${canvasHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="name-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.75"/>
        </filter>
      </defs>
      <text x="50%" y="${baselineY}" text-anchor="middle"
        font-size="${fontSize}" font-family="Arial, Helvetica, sans-serif"
        font-weight="700" fill="#ffffff" letter-spacing="0.06em" filter="url(#name-shadow)">
        ${safeText}
      </text>
    </svg>
  `;
}
