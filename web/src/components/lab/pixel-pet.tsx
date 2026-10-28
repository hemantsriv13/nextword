// A small pixel cat that keeps you company on every page, whatever your progress. It sits in the
// app's frame (sidebar, top bar or the focus-mode corner), never over the work. It blinks now and then
// and swishes its tail; with reduced motion it sits still.

// One string per row of pixels; each letter is a colour, "." is empty.
const BODY = [
  "..o.........o...",
  ".ofo.......ofo..",
  ".offo.....offo..",
  ".fffffffffffff..",
  ".fffffffffffff..",
  ".fffffffffffff..",
  ".fpffffnffffpf..",
  "..fffffmfffff...",
  "...fffffffff....",
  "..fffffffffff...",
  "..fffbbbbbfff...",
  "..fffbbbbbfff...",
  "..ff.ff.ff.ff...",
]
// Open eyes (with a shine) and closed eyes, drawn over the face.
const EYES_OPEN = [
  { x: 4, y: 4, c: "e" }, { x: 4, y: 5, c: "e" }, { x: 5, y: 4, c: "w" }, { x: 5, y: 5, c: "e" },
  { x: 9, y: 4, c: "e" }, { x: 9, y: 5, c: "e" }, { x: 10, y: 4, c: "w" }, { x: 10, y: 5, c: "e" },
]
const EYES_SHUT = [
  { x: 4, y: 5, c: "e" }, { x: 5, y: 5, c: "e" },
  { x: 9, y: 5, c: "e" }, { x: 10, y: 5, c: "e" },
]
// Two tail positions, swapped to make it swish.
const TAIL_UP = [{ x: 14, y: 8 }, { x: 15, y: 7 }, { x: 15, y: 6 }, { x: 14, y: 9 }, { x: 14, y: 10 }]
const TAIL_DOWN = [{ x: 14, y: 10 }, { x: 15, y: 10 }, { x: 15, y: 9 }, { x: 14, y: 11 }, { x: 13, y: 11 }]

// A fixed pixel-art palette: it reads on both the light and the dark theme.
const COLOURS: Record<string, string> = {
  f: "#f0a34a", // fur
  o: "#c9772a", // ear edge
  p: "#f4a3b4", // cheeks
  n: "#e2687f", // nose
  m: "#7a4a24", // mouth
  b: "#fbe3c2", // belly
  e: "#2b1d12", // eyes
  w: "#ffffff", // eye shine
}

const px = (x: number, y: number, c: string, key: string) => <rect key={key} x={x} y={y} width={1} height={1} fill={COLOURS[c]} />

export function PixelPet({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 13"
      width={size}
      height={(size * 13) / 16}
      shapeRendering="crispEdges"
      role="img"
      aria-label="A small pixel cat keeping you company"
      className={className}
      data-testid="pixel-pet"
    >
      <title>A small pixel cat keeping you company</title>
      {BODY.flatMap((row, y) => [...row].map((ch, x) => (ch === "." ? null : px(x, y, ch, `b${x}-${y}`))))}
      <g className="pixel-pet-eyes-open">{EYES_OPEN.map((p, i) => px(p.x, p.y, p.c, `o${i}`))}</g>
      <g className="pixel-pet-eyes-shut">{EYES_SHUT.map((p, i) => px(p.x, p.y, p.c, `s${i}`))}</g>
      <g className="pixel-pet-tail-a">{TAIL_UP.map((p, i) => px(p.x, p.y, "f", `ta${i}`))}</g>
      <g className="pixel-pet-tail-b">{TAIL_DOWN.map((p, i) => px(p.x, p.y, "f", `tb${i}`))}</g>
    </svg>
  )
}
