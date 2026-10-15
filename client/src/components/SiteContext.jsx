import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getSite } from "../api.js";

// Holds the site's look (tab icon, background image, colour-layer opacity),
// applies it to the page, and lets the Settings page preview changes.
const SiteContext = createContext(null);
export const useSite = () => useContext(SiteContext);

const START = {
  hasFavicon: false,
  faviconV: 0,
  hasBackground: false,
  backgroundV: 0,
  overlayOpacity: 0.85,
};

export function SiteProvider({ children }) {
  const [site, setSite] = useState(START);

  const reload = useCallback(
    () =>
      getSite()
        .then(setSite)
        .catch(() => {}),
    []
  );

  useEffect(() => {
    reload();
  }, [reload]);

  // Tab icon
  useEffect(() => {
    let link = document.querySelector("link[rel='icon']");
    if (site.hasFavicon) {
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = `/api/site/favicon?v=${site.faviconV}`;
    } else if (link) {
      link.remove();
    }
  }, [site.hasFavicon, site.faviconV]);

  // Lets the stylesheet make panels a little see-through when there's a background.
  useEffect(() => {
    document.documentElement.classList.toggle("has-bg", site.hasBackground);
  }, [site.hasBackground]);

  return (
    <SiteContext.Provider value={{ site, setSite, reload }}>
      {site.hasBackground && (
        <>
          {/* The image stays put while the page scrolls over it... */}
          <div
            className="site-bg"
            style={{ backgroundImage: `url(/api/site/background?v=${site.backgroundV})` }}
          />
          {/* ...with the usual dark colour on top; lower opacity lets more image through. */}
          <div className="site-tint" style={{ opacity: site.overlayOpacity }} />
        </>
      )}
      {children}
    </SiteContext.Provider>
  );
}
