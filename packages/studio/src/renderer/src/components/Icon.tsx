/** Small line icons (24×24, stroke = currentColor). Decorative: buttons carry their own labels. */
const PATHS: Record<string, string> = {
  plus: "M12 5v14M5 12h14",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M8 7h7",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  play: "M7 4v16l13-8z",
  restart: "M4 12a8 8 0 1 0 3-6.2M4 4v5h5",
  skip: "M5 5v14l9-7zM15 5v14M19 5v14",
  reload: "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  explorer: "M4 4h6l2 2h8v14H4zM4 10h16",
  characters: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a6 6 0 0 0-4-5.6",
  assets: "M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6M15 9h.01",
  variables: "M7 4c-2 0-3 1-3 3v3l-2 2 2 2v3c0 2 1 3 3 3M17 4c2 0 3 1 3 3v3l2 2-2 2v3c0 2-1 3-3 3M9 9l6 6M15 9l-6 6",
  translate: "M3 5h10M8 3v2M5 5c1 4 4 7 8 8M11 5c-1 4-4 7-7 9M13 21l4-9 4 9M14.5 18h5",
  graph: "M6 3v6M6 15v6M6 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 6a3 3 0 1 0 0 .01M18 18a3 3 0 1 0 0 .01M9 12h3a3 3 0 0 0 3-3V8M12 12a3 3 0 0 1 3 3v1",
  build: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 15H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z",
  assistant: "M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z",
  warning: "M12 3l10 18H2zM12 10v5M12 18h.01",
  error: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15 9l-6 6M9 9l6 6",
  info: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7h.01",
  check: "M5 12l5 5 9-10",
  close: "M6 6l12 12M18 6L6 18",
  undo: "M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  chevron: "M9 6l6 6-6 6",
  file: "M6 3h8l5 5v13H6zM14 3v5h5",
  scene: "M4 5h16v14H4zM4 9h16M9 5v4",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  history: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 3",
  proposal: "M4 4h16v12H8l-4 4zM8 8h8M8 12h5",
  output: "M4 5h16v14H4zM7 9l3 3-3 3M12 15h5",
  send: "M4 12l16-8-6 16-2-7z",
  stop: "M6 6h12v12H6z",
  next: "M8 5l8 7-8 7",
  music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  image: "M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  drag: "M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01",
};

export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? PATHS["file"]} />
    </svg>
  );
}
