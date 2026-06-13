import React from "react";

const typeLabels = {
  course: "Course",
  instructor: "Instructor",
  tag: "Tag",
  category: "Category",
};

function SearchSuggestions({
  suggestions,
  loading,
  activeIndex,
  onSelect,
  query,
}) {
  const trimmed = query.trim();
  if (trimmed.length < 1) return null;

  const showEmpty = !loading && suggestions.length === 0;

  return (
    <ul
      className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto rounded-md border border-richblack-700 bg-richblack-800 py-1 shadow-lg"
      role="listbox"
    >
      {loading && suggestions.length === 0 && (
        <li className="px-3 py-2 text-sm text-richblack-300">Searching...</li>
      )}

      {suggestions.map((item, index) => (
        <li
          key={`${item.type}-${item.id}-${index}`}
          role="option"
          aria-selected={index === activeIndex}
          className={`cursor-pointer px-3 py-2 text-sm text-richblack-100 ${
            index === activeIndex ? "bg-richblack-700" : "hover:bg-richblack-700"
          }`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(item)}
        >
          <span className="font-medium">{item.label}</span>
          <span className="ml-2 text-xs text-richblack-400">
            {typeLabels[item.type] || item.type}
          </span>
        </li>
      ))}

      {showEmpty && (
        <li className="px-3 py-2 text-sm text-richblack-300">No suggestions</li>
      )}
    </ul>
  );
}

export default SearchSuggestions;
