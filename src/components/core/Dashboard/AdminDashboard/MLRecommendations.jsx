import React, { useState, useCallback } from "react";
import { useSelector } from "react-redux";
import { apiConnector } from "../../../../services/apiconnector";
import { mlEndpoints } from "../../../../services/apis";

// ─── Small card for each recommended course ───────────────────────────────────
function CourseCard({ course, rank }) {
  const rating = course.avgRating?.toFixed(1) ?? "N/A";
  const score  = course.mlScore != null ? (course.mlScore * 100).toFixed(1) + "%" : "N/A";
  return (
    <div className="rounded-xl border border-richblack-700 bg-richblack-800 p-4 flex gap-3">
      <span className="text-xl font-bold text-richblack-400 w-7">#{rank}</span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold truncate text-richblack-5">{course.courseName}</p>
        <p className="text-xs text-richblack-400 mt-0.5">
          {course.instructor?.firstName} {course.instructor?.lastName}
          {course.category?.name && ` · ${course.category.name}`}
        </p>
        <div className="flex gap-3 mt-2 text-xs">
          <span className="text-yellow-400">★ {rating}</span>
          <span className="text-blue-400">{course.enrollmentCount ?? 0} enrolled</span>
          {course.mlScore != null && (
            <span className="text-green-400">ML score: {score}</span>
          )}
          {course.price != null && (
            <span className="text-richblack-300">₹{course.price}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tab ─────────────────────────────────────────────────────────────────────
function Tab({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
        active
          ? "bg-yellow-50 text-richblack-900"
          : "text-richblack-300 hover:bg-richblack-700"
      }`}
    >
      {label}
    </button>
  );
}

// ─── Similar-courses lookup ───────────────────────────────────────────────────
function SimilarCourseLookup({ token }) {
  const headers = { Authorization: `Bearer ${token}` };
  const [courseId, setCourseId] = useState("");
  const [limit, setLimit]       = useState(5);
  const [results, setResults]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  const lookup = async () => {
    if (!courseId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const url = mlEndpoints.ML_SIMILAR_COURSES_API(courseId.trim()) + `?limit=${limit}`;
      const res = await apiConnector("GET", url, null, headers);
      if (res?.data?.success) setResults(res.data.data);
      else setError(res?.data?.message || "Failed");
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Enter MongoDB Course ID (24 hex chars)..."
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          className="flex-1 rounded-lg bg-richblack-700 border border-richblack-600 px-4 py-2 text-sm text-richblack-5 placeholder-richblack-400 focus:outline-none focus:border-yellow-400"
        />
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="w-28 rounded-lg bg-richblack-700 border border-richblack-600 px-3 py-2 text-sm text-richblack-5"
        >
          {[3,5,10,15].map((n) => <option key={n} value={n}>{n} results</option>)}
        </select>
        <button
          onClick={lookup}
          disabled={loading || !courseId.trim()}
          className="px-5 py-2 rounded-lg bg-yellow-50 text-richblack-900 text-sm font-semibold disabled:opacity-50 hover:bg-yellow-100 transition"
        >
          {loading ? "Searching..." : "Find Similar"}
        </button>
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {results && (
        <div className="space-y-3">
          <p className="text-richblack-400 text-xs">{results.length} similar courses found</p>
          {results.map((c, i) => <CourseCard key={c._id} course={c} rank={i + 1} />)}
          {results.length === 0 && (
            <p className="text-richblack-400 text-sm">No similar courses found. The model may need retraining.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function MLRecommendations() {
  const { token } = useSelector((s) => s.auth);
  const headers = { Authorization: `Bearer ${token}` };

  const [activeTab, setActiveTab] = useState("recommended");
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [fetched, setFetched]     = useState(false);

  const fetchRecs = useCallback(async (limit = 20) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiConnector(
        "GET",
        `${mlEndpoints.ML_RECOMMENDATIONS_API}?limit=${limit}`,
        null,
        headers
      );
      if (res?.data?.success) {
        setData(res.data.data);
        setFetched(true);
      } else {
        setError(res?.data?.message || "Failed to load recommendations");
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const tabs = [
    { key: "recommended", label: "🤖 Recommended" },
    { key: "trending",    label: "📈 Trending" },
    { key: "topRated",    label: "⭐ Top Rated" },
    { key: "similar",     label: "🔍 Similar Lookup" },
  ];

  const currentList =
    activeTab === "recommended" ? (data?.recommended || []) :
    activeTab === "trending"    ? (data?.trending    || []) :
    activeTab === "topRated"    ? (data?.topRated    || []) : null;

  const mlMeta = data?.meta || {};

  return (
    <div className="mx-auto max-w-maxContent px-4 py-8 text-richblack-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">⭐ Recommendations</h1>
          <p className="text-richblack-300 mt-1 text-sm">
            Explore what the ML engine recommends, what is trending, and find similar courses.
          </p>
        </div>
        <button
          onClick={() => fetchRecs()}
          disabled={loading}
          className="rounded-lg bg-richblack-700 px-4 py-2 text-sm hover:bg-richblack-600 transition disabled:opacity-50"
        >
          {loading ? "Loading..." : fetched ? "↻ Refresh" : "▶ Load Data"}
        </button>
      </div>

      {/* ML meta badge */}
      {data && (
        <div className="flex flex-wrap gap-3 mb-6">
          <span className={`text-xs px-3 py-1 rounded-full border font-mono ${
            mlMeta.mlAvailable
              ? "border-green-500/40 text-green-400 bg-green-900/10"
              : "border-yellow-500/40 text-yellow-400 bg-yellow-900/10"
          }`}>
            {mlMeta.mlAvailable ? "🟢 ML Online" : "🟡 Heuristic Fallback"}
          </span>
          <span className="text-xs px-3 py-1 rounded-full border border-blue-500/30 text-blue-400 bg-blue-900/10 font-mono">
            Method: {mlMeta.method || "—"}
          </span>
          <span className="text-xs px-3 py-1 rounded-full border border-richblack-600 text-richblack-300 font-mono">
            {data?.categories?.length ?? 0} categories
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map((t) => (
          <Tab key={t.key} label={t.label} active={activeTab === t.key} onClick={() => setActiveTab(t.key)} />
        ))}
      </div>

      {/* Content */}
      {!fetched && !loading && (
        <div className="rounded-xl border border-richblack-700 bg-richblack-800 p-10 text-center text-richblack-400">
          Click <strong>Load Data</strong> to fetch ML recommendations from the backend.
        </div>
      )}

      {loading && (
        <div className="flex justify-center items-center h-40">
          <div className="animate-spin w-8 h-8 border-2 border-yellow-400 border-t-transparent rounded-full"></div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-900/10 p-5 text-red-400">{error}</div>
      )}

      {/* Course lists */}
      {!loading && fetched && activeTab !== "similar" && (
        <div className="space-y-3">
          {currentList?.length > 0 ? (
            currentList.map((c, i) => <CourseCard key={c._id ?? i} course={c} rank={i + 1} />)
          ) : (
            <p className="text-richblack-400 text-sm">
              No data available for this tab. Try retraining the ML model.
            </p>
          )}
        </div>
      )}

      {/* Similar lookup */}
      {!loading && activeTab === "similar" && (
        <div className="rounded-xl border border-richblack-700 bg-richblack-800 p-5">
          <h2 className="font-semibold mb-4">🔍 Content-Based Similar Course Lookup</h2>
          <p className="text-richblack-400 text-xs mb-4">
            Paste a Course ObjectID to find semantically similar courses via TF-IDF cosine similarity.
          </p>
          <SimilarCourseLookup token={token} />
        </div>
      )}
    </div>
  );
}
