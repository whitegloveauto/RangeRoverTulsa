import { themeCss, fontHref, type BrandTheme } from "@/lib/theme";

// Injects a theme's CSS variables (and its Google Fonts) into the page.
// Server-safe; place it after globals so its :root wins.
export default function ThemeStyle({ theme }: { theme: BrandTheme }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={fontHref(theme)} />
      <style dangerouslySetInnerHTML={{ __html: themeCss(theme) }} />
    </>
  );
}
