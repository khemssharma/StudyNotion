import React, { useEffect, useState, useCallback } from "react";
import { useSelector } from "react-redux";
import { apiConnector } from "../../../../services/apiconnector";
import { adminEndpoints, mlEndpoints } from "../../../../services/apis";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const COLORS = ["#FFD60A", "#06B6D4", "#8B5CF6", "#F97316", "#10B981", "#EF4444"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function KpiCard({ label, value, sub, color = "yellow" }) {
  const palette = {
    yellow: "bg-yellow-800/20 border-yellow-500/30 text-yellow-400",
    blue:   "bg-blue-800/20   border-blue-500/30   text-blue-400",
    purple: "bg-purple-800/20 border-purple-500/30 text-purple-400",
    green:  "bg-green-800/20  border-green-500/30  text-green-400",
    pink:   "bg-pink-800/20   border-pink-500/30   text-pink-400",
  };
  return (
    <div className={`rounded-xl border p-5 ${palette[color]} bg-richblack-800`}>
      <p className="text-3xl font-bold text-richblack-5">{value ?? "—"}</p>
      <p className="text-sm font-semibold mt-1">{label}</p>
      {sub && <p className="text-xs text-richblack-300 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function MLInsights() {
  const { token } = useSelector((s) => s.auth);
  const headers = { Authorization: `Bearer ${token}` };

  const [overview, setOverview]           = useState(null);
  const [trend, setTrend]                 = useState([]);
  const [mlData, setMlData]               = useState(null);
  const [categoryDist, setCategoryDist]   = useState([]);
  const [ratingDist, setRatingDist]       = useState([]);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Platform overview
      const ovRes = await apiConnector("GET", adminEndpoints.OVERVIEW_API, null, headers);
      if (ovRes?.data?.success) setOverview(ovRes.data.data);

      // 2. Enrollment trend
      const trRes = await apiConnector("GET", adminEndpoints.ENROLLMENT_TREND_API, null, headers);
      if (trRes?.data?.success) {
        setTrend(
          (trRes.data.data || []).map((d) => ({
            month: `${MONTH_NAMES[(d._id?.month ?? 1) - 1]} ${d._id?.year ?? ""}`,
            enrollments: d.enrollments ?? 0,
          }))
        );
      }

      // 3. ML recommendations (gives us method + mlAvailable flag)
      const recRes = await apiConnector(
        "GET", mlEndpoints.ML_RECOMMENDATIONS_API + "?limit=50", null, headers
      );
      if (recRes?.data?.success) {
        const data = recRes.data.data;
        setMlData(data);

        // Category distribution from trending
        const catMap = {};
        [...(data.trending || []), ...(data.topRated || [])].forEach((c) => {
          if (c.category?.name) catMap[c.category.name] = (catMap[c.category.name] || 0) + c.enrollmentCount;
        });
        setCategoryDist(Object.entries(catMap).map(([name, value]) => ({ name, value })));

        // Rating distribution (1-5 stars)
        const buckets = [1,2,3,4,5].map((star) => ({
          star: `${star}★`,
          count: [...(data.trending||[]),...(data.topRated||[])]
            .filter((c) => Math.round(c.avgRating || 0) === star).length,
        }));
        setRatingDist(buckets);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load ML Insights. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadAll(); }, [loadAll]);

  if (loading) return (
    <div className="flex justify-center items-center h-64">
      <div className="spinner"></div>
    </div>
  );

  if (error) return (
    <div className="rounded-xl bg-red-900/20 border border-red-500/30 p-6 text-red-400">{error}</div>
  );

  const mlMeta = mlData?.meta || {};
  const trending = mlData?.trending || [];
  const topRated = mlData?.topRated || [];

  return (
    <div className="mx-auto max-w-maxContent px-4 py-8 text-richblack-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">ML Insights</h1>
          <p className="text-richblack-300 mt-1 text-sm">
            Live signals from the hybrid recommendation engine
          </p>
        </div>
        <button
          onClick={loadAll}
          className="rounded-lg bg-richblack-700 px-4 py-2 text-sm hover:bg-richblack-600 transition"
        >
          ↻ Refresh
        </button>
      </div>

      {/* ML Engine Status */}
      <div className="rounded-xl border border-richblack-700 bg-richblack-800 p-5 mb-8">
        <h2 className="font-semibold text-lg mb-3">🤖 ML Engine Status</h2>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${
              mlMeta.mlAvailable ? "bg-green-400" : "bg-yellow-400"
            }`}></span>
            <span className="text-sm">
              {mlMeta.mlAvailable ? "ML Service: Online" : "ML Service: Offline (heuristic fallback)"}
            </span>
          </div>
          <div className="text-sm text-richblack-300">
            Scoring method: <span className="font-mono text-yellow-400">{mlMeta.method || "—"}</span>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Total Courses"     value={overview?.totalCourses}      color="yellow" />
        <KpiCard label="Students"          value={overview?.totalUsers}         color="blue" />
        <KpiCard label="Instructors"       value={overview?.totalInstructors}   color="purple" />
        <KpiCard label="Total Enrollments" value={overview?.totalEnrollments}   color="green" />
        <KpiCard label="Trending Courses"  value={trending.length}              color="pink"
          sub="by enrollment count" />
        <KpiCard label="Top Rated"         value={topRated.length}              color="yellow"
          sub="by avg rating" />
        <KpiCard label="Categories"        value={mlData?.categories?.length}   color="blue" />
        <KpiCard label="ML Recommendations"
          value={mlData?.recommended?.length}
          color={mlMeta.mlAvailable ? "green" : "yellow"}
          sub={mlMeta.mlAvailable ? "Personalised by ML" : "Heuristic fallback"}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Enrollment Trend */}
        <div className="rounded-xl border border-richblack-700 bg-richblack-800 p-5">
          <h2 className="font-semibold mb-4">📈 Monthly Enrollment Trend</h2>
          {trend.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="month" tick={{ fill: "#9CA3AF", fontSize: 11 }} />
                <YAxis tick={{ fill: "#9CA3AF", fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "#1F2937", border: "none" }} />
                <Line type="monotone" dataKey="enrollments" stroke="#FFD60A" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-richblack-400 text-sm">No trend data yet.</p>
          )}
        </div>

        {/* Category Distribution */}
        <div className="rounded-xl border border-richblack-700 bg-richblack-800 p-5">
          <h2 className="font-semibold mb-4">🗂️ Enrollments by Category</h2>
          {categoryDist.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={categoryDist} dataKey="value" cx="50%" cy="50%" outerRadius={70} label={({name}) => name}>
                    {categoryDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#1F2937", border: "none" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 mt-2">
                {categoryDist.map((c, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-full border"
                    style={{ borderColor: COLORS[i % COLORS.length], color: COLORS[i % COLORS.length] }}>
                    {c.name}: {c.value}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-richblack-400 text-sm">No category data.</p>
          )}
        </div>

        {/* Rating Distribution */}
        <div className="rounded-xl border border-richblack-700 bg-richblack-800 p-5">
          <h2 className="font-semibold mb-4">⭐ Rating Distribution</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={ratingDist}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="star" tick={{ fill: "#9CA3AF" }} />
              <YAxis tick={{ fill: "#9CA3AF" }} />
              <Tooltip contentStyle={{ background: "#1F2937", border: "none" }} />
              <Bar dataKey="count" fill="#8B5CF6" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top Trending */}
        <div className="rounded-xl border border-richblack-700 bg-richblack-800 p-5">
          <h2 className="font-semibold mb-4">🏆 Top Trending Courses</h2>
          <div className="space-y-2 overflow-y-auto max-h-[200px]">
            {trending.slice(0, 8).map((c, i) => (
              <div key={c._id} className="flex items-center justify-between text-sm">
                <span className="text-richblack-300 mr-2">#{i + 1}</span>
                <span className="flex-1 truncate">{c.courseName}</span>
                <span className="ml-2 text-yellow-400">{c.enrollmentCount} enrolled</span>
              </div>
            ))}
            {trending.length === 0 && <p className="text-richblack-400 text-sm">No data.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
