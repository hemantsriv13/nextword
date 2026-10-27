// Icons from Iconoir (https://iconify.design/?prefix=iconoir), installed with the Better Design
// install-icons tool. Do NOT mix in icons from other libraries; see .library.json for the locked choice.
import type { ReactNode, SVGProps } from "react"

type IconProps = SVGProps<SVGSVGElement>

function icon(body: ReactNode) {
  return function Icon(props: IconProps) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...props}>
        {body}
      </svg>
    )
  }
}

const S = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: "1.5" } as const

export const HomeIcon = icon(<path {...S} d="m2 8l9.732-4.866a.6.6 0 0 1 .536 0L22 8m-2 3v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8" />)
export const EditPencilIcon = icon(<path {...S} d="m14.363 5.652l1.48-1.48a2 2 0 0 1 2.829 0l1.414 1.414a2 2 0 0 1 0 2.828l-1.48 1.48m-4.243-4.242l-9.616 9.615a2 2 0 0 0-.578 1.238l-.242 2.74a1 1 0 0 0 1.084 1.085l2.74-.242a2 2 0 0 0 1.24-.578l9.615-9.616m-4.243-4.242l4.243 4.242" />)
export const DatabaseIcon = icon(<g fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 12v6s0 3 7 3s7-3 7-3v-6" /><path d="M5 6v6s0 3 7 3s7-3 7-3V6" /><path d="M12 3c7 0 7 3 7 3s0 3-7 3s-7-3-7-3s0-3 7-3Z" /></g>)
export const TableIcon = icon(<path {...S} d="M21 3v18H3V3zM3 16.5h18M3 12h18M3 7.5h18M16.5 3v18M12 3v18M7.5 3v18" />)
export const NetworkIcon = icon(<g fill="none" stroke="currentColor" strokeWidth="1.5"><rect width="7" height="5" x="3" y="2" rx=".6" /><rect width="7" height="5" x="8.5" y="17" rx=".6" /><rect width="7" height="5" x="14" y="2" rx=".6" /><path d="M6.5 7v3.5a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V7M12 12.5V17" /></g>)
export const EyeIcon = icon(<g {...S}><path d="M3 13c3.6-8 14.4-8 18 0" /><path d="M12 17a3 3 0 1 1 0-6a3 3 0 0 1 0 6" /></g>)
export const DiceThreeIcon = icon(<g fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 20.4V3.6a.6.6 0 0 1 .6-.6h16.8a.6.6 0 0 1 .6.6v16.8a.6.6 0 0 1-.6.6H3.6a.6.6 0 0 1-.6-.6Z" /><path fill="currentColor" strokeLinecap="round" strokeLinejoin="round" d="M7.5 8a.5.5 0 1 1 0-1a.5.5 0 0 1 0 1m4.5 4.5a.5.5 0 1 1 0-1a.5.5 0 0 1 0 1m4.5 4.5a.5.5 0 1 1 0-1a.5.5 0 0 1 0 1" /></g>)
export const CandlestickChartIcon = icon(<path {...S} d="M5 16v-2m7 7v-2m7-6v-2M5 8V6m7 7v-2m7-6V3M7 8.6v4.8a.6.6 0 0 1-.6.6H3.6a.6.6 0 0 1-.6-.6V8.6a.6.6 0 0 1 .6-.6h2.8a.6.6 0 0 1 .6.6m7 5v4.8a.6.6 0 0 1-.6.6h-2.8a.6.6 0 0 1-.6-.6v-4.8a.6.6 0 0 1 .6-.6h2.8a.6.6 0 0 1 .6.6m7-8v4.8a.6.6 0 0 1-.6.6h-2.8a.6.6 0 0 1-.6-.6V5.6a.6.6 0 0 1 .6-.6h2.8a.6.6 0 0 1 .6.6" />)
export const ServerIcon = icon(<g fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="m6 18.01l.01-.011M6 6.01l.01-.011" /><path d="M2 9.4V2.6a.6.6 0 0 1 .6-.6h18.8a.6.6 0 0 1 .6.6v6.8a.6.6 0 0 1-.6.6H2.6a.6.6 0 0 1-.6-.6Zm0 12v-6.8a.6.6 0 0 1 .6-.6h18.8a.6.6 0 0 1 .6.6v6.8a.6.6 0 0 1-.6.6H2.6a.6.6 0 0 1-.6-.6Z" /></g>)
export const BookIcon = icon(<g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"><path d="M4 19V5a2 2 0 0 1 2-2h13.4a.6.6 0 0 1 .6.6v13.114M6 17h14M6 21h14" /><path strokeLinejoin="round" d="M6 21a2 2 0 1 1 0-4" /><path d="M9 7h6" /></g>)
export const BookmarkIcon = icon(<path {...S} d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-5.918-3.805a2 2 0 0 0-2.164 0z" />)
export const BookmarkSolidIcon = icon(<path {...S} fill="currentColor" d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-5.918-3.805a2 2 0 0 0-2.164 0z" />)
export const SearchIcon = icon(<path {...S} d="m17 17l4 4M3 11a8 8 0 1 0 16 0a8 8 0 0 0-16 0" />)
export const SunLightIcon = icon(<path {...S} d="M12 18a6 6 0 1 0 0-12a6 6 0 0 0 0 12m10-6h1M12 2V1m0 22v-1m8-2l-1-1m1-15l-1 1M4 20l1-1M4 4l1 1m-4 7h1" />)
export const HalfMoonIcon = icon(<path {...S} d="M3 11.507a9.493 9.493 0 0 0 18 4.219c-8.507 0-12.726-4.22-12.726-12.726A9.49 9.49 0 0 0 3 11.507" />)
export const MenuIcon = icon(<path {...S} d="M3 5h18M3 12h18M3 19h18" />)
export const PlayIcon = icon(<path {...S} d="M6.906 4.537A.6.6 0 0 0 6 5.053v13.894a.6.6 0 0 0 .906.516l11.723-6.947a.6.6 0 0 0 0-1.032z" />)
export const PauseIcon = icon(<path fill="none" stroke="currentColor" strokeWidth="1.5" d="M6 18.4V5.6a.6.6 0 0 1 .6-.6h2.8a.6.6 0 0 1 .6.6v12.8a.6.6 0 0 1-.6.6H6.6a.6.6 0 0 1-.6-.6Zm8 0V5.6a.6.6 0 0 1 .6-.6h2.8a.6.6 0 0 1 .6.6v12.8a.6.6 0 0 1-.6.6h-2.8a.6.6 0 0 1-.6-.6Z" />)
export const RefreshDoubleIcon = icon(<g {...S}><path d="M21.168 8A10 10 0 0 0 12 2c-5.185 0-9.45 3.947-9.95 9" /><path d="M17 8h4.4a.6.6 0 0 0 .6-.6V3M2.881 16c1.544 3.532 5.068 6 9.168 6c5.186 0 9.45-3.947 9.951-9" /><path d="M7.05 16h-4.4a.6.6 0 0 0-.6.6V21" /></g>)
export const SkipNextIcon = icon(<path {...S} d="M18 7v10M6.972 5.267A.6.6 0 0 0 6 5.738v12.524a.6.6 0 0 0 .972.47l7.931-6.261a.6.6 0 0 0 0-.942z" />)
export const CheckIcon = icon(<path {...S} d="m5 13l4 4L19 7" />)
export const XmarkIcon = icon(<path {...S} d="M6.758 17.243L12.001 12m5.243-5.243L12 12m0 0L6.758 6.757M12.001 12l5.243 5.243" />)
export const NavArrowDownIcon = icon(<path {...S} d="m6 9l6 6l6-6" />)
export const NavArrowRightIcon = icon(<path {...S} d="m9 6l6 6l-6 6" />)
export const NavArrowLeftIcon = icon(<path {...S} d="m15 6l-6 6l6 6" />)
export const ArrowRightIcon = icon(<path {...S} d="M3 12h18m0 0l-8.5-8.5M21 12l-8.5 8.5" />)
export const PathArrowIcon = icon(<path {...S} d="M18 16.5V3m0 0l3.5 3.5M18 3l-3.5 3.5m3.5 10a3.5 3.5 0 1 1-7 0v-9m0 0a3.5 3.5 0 1 0-7 0v12" />)
export const InfoCircleIcon = icon(<path {...S} d="M12 11.5v5m0-8.99l.01-.011M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2S2 6.477 2 12s4.477 10 10 10" />)
export const CodeIcon = icon(<path {...S} d="M13.5 6L10 18.5m-3.5-10L3 12l3.5 3.5m11-7L21 12l-3.5 3.5" />)
export const DownloadIcon = icon(<path {...S} d="M6 20h12M12 4v12m0 0l3.5-3.5M12 16l-3.5-3.5" />)
export const UploadIcon = icon(<path {...S} d="M6 20h12m-6-4V4m0 0l3.5 3.5M12 4L8.5 7.5" />)
export const TrashIcon = icon(<path {...S} d="m20 9l-1.995 11.346A2 2 0 0 1 16.035 22h-8.07a2 2 0 0 1-1.97-1.654L4 9m17-3h-5.625M3 6h5.625m0 0V4a2 2 0 0 1 2-2h2.75a2 2 0 0 1 2 2v2m-6.75 0h6.75" />)
export const CopyIcon = icon(<g {...S}><path d="M19.4 20H9.6a.6.6 0 0 1-.6-.6V9.6a.6.6 0 0 1 .6-.6h9.8a.6.6 0 0 1 .6.6v9.8a.6.6 0 0 1-.6.6" /><path d="M15 9V4.6a.6.6 0 0 0-.6-.6H4.6a.6.6 0 0 0-.6.6v9.8a.6.6 0 0 0 .6.6H9" /></g>)
export const SidebarCollapseIcon = icon(<g {...S}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2" /><path d="M7.25 10L5.5 12l1.75 2m2.25 7V3" /></g>)
export const SidebarExpandIcon = icon(<g {...S}><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2m-9.5 0V3" /><path d="m5.5 10l1.75 2l-1.75 2" /></g>)
export const ExpandIcon = icon(<path {...S} d="M9 9L4 4m0 0v4m0-4h4m7 5l5-5m0 0v4m0-4h-4M9 15l-5 5m0 0v-4m0 4h4m7-5l5 5m0 0v-4m0 4h-4" />)
export const CollapseIcon = icon(<path {...S} d="m20 20l-5-5m0 0v4m0-4h4M4 20l5-5m0 0v4m0-4H5M20 4l-5 5m0 0V5m0 4h4M4 4l5 5m0 0V5m0 4H5" />)
export const GraphUpIcon = icon(<g {...S}><path d="M20 20H4V4" /><path d="M4 16.5L12 9l3 3l4.5-4.5" /></g>)
export const JournalIcon = icon(<g {...S}><path d="M6 6h12M6 10h12m-5 4h5m-5 4h5M2 21.4V2.6a.6.6 0 0 1 .6-.6h18.8a.6.6 0 0 1 .6.6v18.8a.6.6 0 0 1-.6.6H2.6a.6.6 0 0 1-.6-.6" /><path d="M6 18v-4h3v4z" /></g>)
export const LightBulbIcon = icon(<path {...S} d="M9 18h6m-5 3h4m-5-6c.001-2-.499-2.5-1.5-3.5S6.025 9.487 6 8c-.047-3.05 2-5 6-5c4.001 0 6.049 1.95 6 5c-.023 1.487-.5 2.5-1.5 3.5c-.999 1-1.499 1.5-1.5 3.5" />)
export const TimerIcon = icon(<path {...S} d="M9 2h6m-3 8v4m0 8a8 8 0 1 0 0-16a8 8 0 0 0 0 16" />)
export const PageSearchIcon = icon(<g {...S}><path d="M20 12V5.749a.6.6 0 0 0-.176-.425l-3.148-3.148A.6.6 0 0 0 16.252 2H4.6a.6.6 0 0 0-.6.6v18.8a.6.6 0 0 0 .6.6H11M8 10h8M8 6h4m-4 8h3m9.5 6.5L22 22" /><path d="M15 18a3 3 0 1 0 6 0a3 3 0 0 0-6 0m1-16v3.4a.6.6 0 0 0 .6.6H20" /></g>)
export const GitForkIcon = icon(<path {...S} d="M17 7a2 2 0 1 0 0-4a2 2 0 0 0 0 4M7 7a2 2 0 1 0 0-4a2 2 0 0 0 0 4m0 14a2 2 0 1 0 0-4a2 2 0 0 0 0 4M7 7v10M17 7v1c0 2.5-2 3-2 3l-6 2s-2 .5-2 3v1" />)
export const CpuIcon = icon(<g {...S}><path d="M8 15.4V8.6a.6.6 0 0 1 .6-.6h6.8a.6.6 0 0 1 .6.6v6.8a.6.6 0 0 1-.6.6H8.6a.6.6 0 0 1-.6-.6" /><path d="M20 4.6v14.8a.6.6 0 0 1-.6.6H4.6a.6.6 0 0 1-.6-.6V4.6a.6.6 0 0 1 .6-.6h14.8a.6.6 0 0 1 .6.6M17 4V2m-5 2V2M7 4V2m0 18v2m5-2v2m5-2v2m3-5h2m-2-5h2m-2-5h2M4 17H2m2-5H2m2-5H2" /></g>)
export const WarningTriangleIcon = icon(<g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"><path d="M20.043 21H3.957c-1.538 0-2.5-1.664-1.734-2.997l8.043-13.988c.77-1.337 2.699-1.337 3.468 0l8.043 13.988C22.543 19.336 21.58 21 20.043 21ZM12 9v4" /><path strokeLinejoin="round" d="m12 17.01l.01-.011" /></g>)
export const UndoIcon = icon(<g {...S}><path d="M4.5 8H15s5 0 5 4.706C20 18 15 18 15 18H6.286" /><path d="M7.5 11.5L4 8l3.5-3.5" /></g>)
export const PlusIcon = icon(<path {...S} d="M6 12h6m6 0h-6m0 0V6m0 6v6" />)
export const OpenBookIcon = icon(<g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.5"><path d="M12 21V7a2 2 0 0 1 2-2h7.4a.6.6 0 0 1 .6.6v13.114M12 21V7a2 2 0 0 0-2-2H2.6a.6.6 0 0 0-.6.6v13.114M14 19h8m-12 0H2" /><path strokeLinejoin="round" d="M12 21a2 2 0 0 1 2-2m-2 2a2 2 0 0 0-2-2" /></g>)
export const MapIcon = icon(<path {...S} d="m9 19l-5.21 1.737a.6.6 0 0 1-.79-.57V5.433a.6.6 0 0 1 .41-.569L9 3m0 16l6 2m-6-2V3m6 18l5.59-1.863a.6.6 0 0 0 .41-.57V3.832a.6.6 0 0 0-.79-.569L15 5m0 16V5m0 0L9 3" />)
export const TextIcon = icon(<path {...S} d="M19 7V5H5v2m7-2v14m0 0h-2m2 0h2" />)
