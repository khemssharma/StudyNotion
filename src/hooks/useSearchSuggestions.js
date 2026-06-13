import { useEffect, useRef, useState } from "react";
import { axiosInstance } from "../services/apiconnector";
import { searchEndpoints } from "../services/apis";

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 1;

export default function useSearchSuggestions(query) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await axiosInstance({
          method: "GET",
          url: `${searchEndpoints.SEARCH_SUGGESTIONS_API}?query=${encodeURIComponent(trimmed)}&limit=8`,
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setSuggestions(Array.isArray(res.data.data) ? res.data.data : []);
        }
      } catch (error) {
        if (error.name !== "CanceledError" && !controller.signal.aborted) {
          setSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, [query]);

  return { suggestions, loading };
}
