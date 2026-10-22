/** Vite bundles CSS imports (fonts, React Flow, Studio styles). */
declare module "*.css";
/** Images bundled with Studio (the brand art in brand/): Vite gives their URL. */
declare module "*.png" {
  const url: string;
  export default url;
}
