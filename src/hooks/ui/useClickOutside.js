import { useEffect } from "react";

export function useClickOutside(refs, handler) {
  useEffect(() => {
    const refList = Array.isArray(refs) ? refs : [refs];

    const handleMouseDown = (event) => {
      const activeElements = refList
        .map((ref) => ref?.current)
        .filter((element) => Boolean(element));

      if (activeElements.length === 0) {
        return;
      }

      const clickedInside = activeElements.some((element) => element.contains(event.target));

      if (!clickedInside) {
        handler(event);
      }
    };

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [refs, handler]);
}