import { useEffect, useState } from "react";

/**
 * useWindowSize
 * Returns the current viewport width, listening on resize.
 * Cheap utility for responsive logic that can't be done in CSS alone
 * (e.g. switching grid template columns, conditional rendering).
 */
export function useWindowSize() {
  const [width, setWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 0
  );

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return width;
}

/**
 * useIsNarrow — true when viewport is narrower than the given breakpoint.
 */
export function useIsNarrow(breakpoint = 1100) {
  const width = useWindowSize();
  return width <= breakpoint;
}
