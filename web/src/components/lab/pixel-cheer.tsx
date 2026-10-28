// A small pixel-art character who cheers when you pass a checkpoint. Two frames (arms up, arms out
// with a sparkle) drawn as crisp SVG squares in the theme's own colours. With reduced motion it
// holds the first frame still.

// Each string is one row of pixels; each letter is a colour, "." is empty.
const UP = [
  "..a..........a..",
  "..a..........a..",
  "..aa.kkkkkk.aa..",
  "...akkkkkkkka...",
  "...kkwwkkwwkk...",
  "...kkwekkwekk...",
  "...kkkkkkkkkk...",
  "...kkkmmmmkkk...",
  "....kkkmmkkk....",
  ".....bbbbbb.....",
  "....bbbbbbbb....",
  "....bbbbbbbb....",
  ".....bbbbbb.....",
  ".....ll..ll.....",
  "....lll..lll....",
]
const OUT = [
  "s..............s",
  ".......s........",
  ".....kkkkkk.....",
  "....kkkkkkkk....",
  "...kkwwkkwwkk...",
  "...kkwekkwekk...",
  "...kkkkkkkkkk...",
  "...kkkmmmmkkk...",
  "....kkkmmkkk....",
  ".aa..bbbbbb..aa.",
  "..aabbbbbbbbaa..",
  "....bbbbbbbb....",
  ".....bbbbbb.....",
  ".....ll..ll.....",
  "....lll..lll....",
]

const COLOURS: Record<string, string> = {
  k: "var(--data)", // head
  w: "var(--card)", // eyes
  e: "var(--foreground)", // pupils
  m: "var(--card)", // smile
  b: "var(--positive)", // body
  a: "var(--data)", // arms
  l: "var(--foreground)", // legs
  s: "var(--context-ink)", // sparkle
}

function Frame({ rows, className }: { rows: string[]; className: string }) {
  return (
    <g className={className}>
      {rows.flatMap((row, y) => [...row].map((ch, x) => (ch === "." ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={COLOURS[ch]} />)))}
    </g>
  )
}

export function PixelCheer({ size = 64 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 16 15"
      width={size}
      height={(size * 15) / 16}
      shapeRendering="crispEdges"
      role="img"
      aria-label="A small pixel-art character cheering"
      className="flex-none"
      data-testid="pixel-cheer"
    >
      <Frame rows={UP} className="pixel-cheer-a" />
      <Frame rows={OUT} className="pixel-cheer-b" />
    </svg>
  )
}
