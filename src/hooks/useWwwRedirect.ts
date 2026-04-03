import { useEffect } from "react";

/**
 * Redirects bare-domain traffic (ischunkybites.com) to the www version
 * (www.ischunkybites.com), preserving the current path and query string.
 */
export function useWwwRedirect(): void {
  useEffect(() => {
    if (window.location.hostname === "ischunkybites.com") {
      const { pathname, search, hash } = window.location;
      window.location.href = `https://www.ischunkybites.com${pathname}${search}${hash}`;
    }
  }, []);
}
