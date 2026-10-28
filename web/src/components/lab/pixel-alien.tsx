// A small pixel alien in a tiny saucer that floats around the bottom-right corner on every page.
// Clicks pass straight through it, and it sits beneath dialogs and tour cards, so it never blocks
// the work. Its saucer lights blink in turn; with reduced motion it stays put and its lights stay on.

// One string per row of pixels; each letter is a colour, "." is empty.
const BODY = [
  "...t........t...",
  "....a......a....",
  ".....kkkkkk.....",
  "....kkkkkkkk....",
  "...kkwwkkwwkk...",
  "...kkwekkwekk...",
  "...kpkkkkkkpk...",
  "....kkkmmkkk....",
  "...gkkkkkkkkg...",
  ".hhhhhhhhhhhhhh.",
  "hhhhhhhhhhhhhhhh",
  "..HHHHHHHHHHHH..",
]
// Saucer lights, in two sets that take turns.
const LIGHTS_A = [1, 10]
const LIGHTS_B = [5, 14]

// A fixed pixel-art palette: it reads on both the light and the dark theme.
const COLOURS: Record<string, string> = {
  t: "#ffd54a", // antenna tips
  a: "#7ee0a8", // antenna stalks
  k: "#7ee0a8", // skin
  w: "#ffffff", // eyes
  e: "#1d1a2e", // pupils
  p: "#f4a3c4", // cheeks
  m: "#2f6b4a", // smile
  g: "#9fd8f5", // dome edge
  h: "#a9b3c9", // saucer top
  H: "#6c7590", // saucer underside
  l: "#ffd54a", // lights
}

const px = (x: number, y: number, c: string, key: string) => <rect key={key} x={x} y={y} width={1} height={1} fill={COLOURS[c]} />

export function PixelAlien({ size = 48 }: { size?: number }) {
  return (
    <div className="pixel-alien-float pointer-events-none fixed bottom-5 right-5 z-20 print:hidden" data-testid="pixel-alien">
      <svg viewBox="0 0 16 12" width={size} height={(size * 12) / 16} shapeRendering="crispEdges" role="img" aria-label="A small pixel alien floating in its saucer">
        <title>A small pixel alien floating in its saucer</title>
        {BODY.flatMap((row, y) => [...row].map((ch, x) => (ch === "." ? null : px(x, y, ch, `b${x}-${y}`))))}
        <g className="pixel-alien-lights-a">{LIGHTS_A.map((x) => px(x, 10, "l", `la${x}`))}</g>
        <g className="pixel-alien-lights-b">{LIGHTS_B.map((x) => px(x, 10, "l", `lb${x}`))}</g>
      </svg>
    </div>
  )
}
