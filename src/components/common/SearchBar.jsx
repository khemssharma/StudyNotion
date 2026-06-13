import { forwardRef, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import useSearchSuggestions from "../../hooks/useSearchSuggestions";
import SearchSuggestions from "./SearchSuggestions";

function getSuggestionPath(suggestion) {
  switch (suggestion.type) {
    case "course":
      return `/courses/${suggestion.courseId || suggestion.id}`;
    case "instructor":
      return `/instructor/${suggestion.instructorId || suggestion.id}`;
    default:
      return `/search/${encodeURIComponent(suggestion.label)}`;
  }
}

const SearchBar = forwardRef(function SearchBar(
  { value, onChange, onClose },
  inputRef
) {
  const navigate = useNavigate();
  const { suggestions, loading } = useSearchSuggestions(value);
  const [activeIndex, setActiveIndex] = useState(-1);

  const navigateToSearch = useCallback(
    (query) => {
      const trimmed = query.trim();
      if (!trimmed) return;
      navigate(`/search/${encodeURIComponent(trimmed)}`);
      onClose?.();
    },
    [navigate, onClose]
  );

  const handleSelect = useCallback(
    (suggestion) => {
      navigate(getSuggestionPath(suggestion));
      onClose?.();
    },
    [navigate, onClose]
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (activeIndex >= 0 && suggestions[activeIndex]) {
      handleSelect(suggestions[activeIndex]);
      return;
    }
    navigateToSearch(value);
  };

  const handleKeyDown = (e) => {
    if (!suggestions.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev > 0 ? prev - 1 : suggestions.length - 1
      );
    } else if (e.key === "Escape") {
      onClose?.();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="relative">
      <input
        type="text"
        className="w-full rounded-md border border-richblack-700 bg-richblack-800 px-3 py-2 text-richblack-100 focus:outline-none focus:ring-2 focus:ring-yellow-50"
        placeholder="Search courses..."
        ref={inputRef}
        value={value}
        onChange={(e) => {
          setActiveIndex(-1);
          onChange(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={value.trim().length > 0}
      />
      <SearchSuggestions
        suggestions={suggestions}
        loading={loading}
        activeIndex={activeIndex}
        onSelect={handleSelect}
        query={value}
      />
    </form>
  );
});

export default SearchBar;
