import React, { useEffect, useState, useCallback } from "react";
import { useSelector } from "react-redux";
import { apiConnector } from "../../../../services/apiconnector";
import { adminEndpoints } from "../../../../services/apis";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const COLORS = ["#FFD60A","#06B6D4","#8B5CF6","#F97316","#10B981","#EF4444","#EC4899","#3B82F6"];

// ── Stat card (KPI tile) ───────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color = "yellow" }) {
  const colors = {
    yellow: "bg-yellow-800/20 border-yellow-500/30 text-yellow-400",
    blue:   "bg-blue-800/20   border-blue-500/30   text-blue-400",
    purple: "bg-purple-800/20 border-purple-500/30 text-purple-400",
    green:  "bg-green-800/20  border-green-500/30  text-green-400",
  };
  return (
    <div className={`rounded-xl border p-5 ${colors[color]} bg-richblack-800`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl">{icon}</span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${colors[color]}`}>
          {sub}
        </span>
      </div>
      <p className="text-3xl font-bold text-richblack-5">{value ?? "—"}</p>
      <p className="text-sm text-richblack-300 mt-1">{label}</p>
    </div>
  );
}

// ── Top-course row ─────────────────────────────────────────────────────────
function TopCourseRow({ rank, course }) {
  return (
    <div className="flex items-center gap-4 py-3 border-b border-richblack-700 last:border-0">
      <span className="w-7 text-center font-bold text-richblack-400 text-sm">#{rank}</span>
      <img
        src={course.thumbnail}
        alt={course.courseName}
        className="h-10 w-16 rounded object-cover shrink-0"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-richblack-5 truncate">{course.courseName}</p>
        <p className="text-xs text-richblack-400">
          {course.instructor?.firstName} {course.instructor?.lastName}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-yellow-50">
          ₹{(course.price * course.enrollmentCount).toLocaleString()}
        </p>
        <p className="text-xs text-richblack-400">{course.enrollmentCount} enrolled</p>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { token } = useSelector((s) => s.auth);
  const { user }  = useSelector((s) => s.profile);

  const [overview,       setOverview]       = useState(null);
  const [enrollTrend,    setEnrollTrend]    = useState([]);
  const [topCourses,     setTopCourses]     = useState([]);
  const [categoryDist,   setCategoryDist]   = useState([]);
  const [recentUsers,    setRecentUsers]    = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);

  const headers = { Authorization: `Bearer ${token}` };

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Platform overview (KPIs)
      const ovRes = await apiConnector("GET", adminEndpoints.OVERVIEW_API, null, headers);
      if (ovRes?.data?.success) setOverview(ovRes.data.data);

      // 2. Monthly enrollment trend
      const trRes = await apiConnector("GET", adminEndpoints.ENROLLMENT_TREND_API, null, headers);
      if (trRes?.data?.success) {
        const raw = trRes.data.data || [];
        setEnrollTrend(
          raw.map((d) => ({
            month: `${MONTH_NAMES[(d._id?.month ?? 1) - 1]} ${d._id?.year ?? ""}`,
            enrollments: d.enrollments ?? 0,
          }))
        );
      }

      // 3. Top courses via the recommendations endpoint (no extra route needed)
      const rcRes = await apiConnector("GET", adminEndpoints.TOP_COURSES_API, null, headers);
      if (rcRes?.data?.success) {
        const { trending = [], topRated = [] } = rcRes.data.data;
        // Merge & deduplicate, pick top 8 by enrollmentCount
        const merged = [...trending, ...topRated];
        const seen = new Set();
        const deduped = merged.filter((c) => {
          if (seen.has(c._id)) return false;
          seen.add(c._id);
          return true;
        });
        setTopCourses(deduped.sort((a, b) => b.enrollmentCount - a.enrollmentCount).slice(0, 8));

        // Category distribution pie from the categories list
        const catCounts = {};
        merged.forEach((c) => {
          if (c.category?.name) {
            catCounts[c.category.name] = (catCounts[c.category.name] || 0) + c.enrollmentCount;
          }
        });
        setCategoryDist(
          Object.entries(catCounts).map(([name, value]) => ({ name, value }))
        );
      }

      // 4. Recent users (newest students)
      const urRes = await apiConnector("GET", adminEndpoints.RECENT_USERS_API, null, headers);
      if (urRes?.data?.success) setRecentUsers(urRes.data.data || []);

    } catch (err) {
      console.error("Admin dashboard error:", err);
      setError("Failed to load analytics. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── total revenue from topCourses list ──
  const totalRevenue = topCourses.reduce(
    (sum, c) => sum + (c.price || 0) * (c.enrollmentCount || 0), 0
  );

  // ── Rating distribution from top courses ──
  const ratingBuckets = [1, 2, 3, 4, 5].map((star) => ({
    star: `${star}★`,
    courses: topCourses.filter(
      (c) => Math.round(c.avgRating || 0) === star
    ).length,
  }));

  return (
    <div className="min-h-screen bg-richblack-900 text-white pb-16">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-richblack-5">
          Welcome back, {user?.firstName} 👋
        </h1>
        <p className="text-richblack-400 text-sm mt-1">
          Platform analytics overview — all numbers are live from the database.
        </p>
        <button
          onClick={loadAll}
          className="mt-3 text-xs text-yellow-50 hover:underline"
        >
          ↻ Refresh
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-32">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-yellow-50 border-t-transparent" />
        </div>
      )}

      {!loading && error && (
        <div className="rounded-xl bg-red-900/20 border border-red-500/30 p-6 text-center text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* ── KPI Cards ─────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard icon="📚" label="Published Courses" value={overview?.totalCourses?.toLocaleString()} sub="Courses" color="yellow" />
            <StatCard icon="👩‍🎓" label="Total Students"   value={overview?.totalUsers?.toLocaleString()}        sub="Users"    color="blue"   />
            <StatCard icon="🏫" label="Instructors"      value={overview?.totalInstructors?.toLocaleString()}   sub="Educators" color="purple" />
            <StatCard icon="🎓" label="Total Enrolments" value={overview?.totalEnrollments?.toLocaleString()}   sub="All time" color="green"  />
          </div>

          {/* Revenue estimate banner */}
          <div className="rounded-xl bg-gradient-to-r from-yellow-900/30 to-yellow-800/10 border border-yellow-500/20 p-5 mb-8 flex items-center justify-between">
            <div>
              <p className="text-xs text-richblack-400 uppercase tracking-widest">Estimated Gross Revenue</p>
              <p className="text-4xl font-bold text-yellow-50 mt-1">
                ₹{totalRevenue.toLocaleString()}
              </p>
              <p className="text-xs text-richblack-400 mt-1">
                Based on price × enrollments for top {topCourses.length} courses
              </p>
            </div>
            <span className="text-6xl opacity-20">💰</span>
          </div>

          {/* ── Row 1: Enrolment Trend + Category Pie ─ */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Line chart */}
            <div className="lg:col-span-2 rounded-xl bg-richblack-800 p-5">
              <p className="font-bold text-richblack-5 mb-4">📈 Monthly Enrolment Trend</p>
              {enrollTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={enrollTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" />
                    <XAxis dataKey="month" tick={{ fill: "#94A3B8", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#94A3B8", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: "#1E293B", border: "none", borderRadius: 8 }}
                      labelStyle={{ color: "#E2E8F0" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="enrollments"
                      stroke="#FFD60A"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: "#FFD60A" }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-richblack-400 text-center py-20">No trend data yet.</p>
              )}
            </div>

            {/* Pie chart */}
            <div className="rounded-xl bg-richblack-800 p-5">
              <p className="font-bold text-richblack-5 mb-4">🗂️ Enrolments by Category</p>
              {categoryDist.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={categoryDist}
                        cx="50%" cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        dataKey="value"
                        paddingAngle={2}
                      >
                        {categoryDist.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: "#1E293B", border: "none", borderRadius: 8 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-2 space-y-1">
                    {categoryDist.map((cat, i) => (
                      <div key={cat.name} className="flex items-center gap-2 text-xs">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: COLORS[i % COLORS.length] }} />
                        <span className="text-richblack-300 truncate">{cat.name}</span>
                        <span className="ml-auto text-richblack-200 font-medium">{cat.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-richblack-400 text-center py-20">No category data.</p>
              )}
            </div>
          </div>

          {/* ── Row 2: Top Courses + Rating Distribution ─ */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Top Courses table */}
            <div className="lg:col-span-2 rounded-xl bg-richblack-800 p-5">
              <p className="font-bold text-richblack-5 mb-4">🏆 Top Performing Courses</p>
              {topCourses.length > 0 ? (
                topCourses.map((c, i) => (
                  <TopCourseRow key={c._id} rank={i + 1} course={c} />
                ))
              ) : (
                <p className="text-richblack-400 text-center py-10">No course data yet.</p>
              )}
            </div>

            {/* Rating distribution bar */}
            <div className="rounded-xl bg-richblack-800 p-5">
              <p className="font-bold text-richblack-5 mb-4">⭐ Rating Distribution</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={ratingBuckets} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#2D3748" />
                  <XAxis type="number" tick={{ fill: "#94A3B8", fontSize: 11 }} />
                  <YAxis dataKey="star" type="category" tick={{ fill: "#94A3B8", fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ background: "#1E293B", border: "none", borderRadius: 8 }}
                  />
                  <Bar dataKey="courses" fill="#FFD60A" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Row 3: Recent Users ─────────────────── */}
          {recentUsers.length > 0 && (
            <div className="rounded-xl bg-richblack-800 p-5">
              <p className="font-bold text-richblack-5 mb-4">🆕 Recent Registrations</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-richblack-400 text-xs uppercase border-b border-richblack-700">
                      <th className="pb-2 text-left">Name</th>
                      <th className="pb-2 text-left">Email</th>
                      <th className="pb-2 text-left">Role</th>
                      <th className="pb-2 text-left">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentUsers.map((u) => (
                      <tr key={u._id} className="border-b border-richblack-700 last:border-0">
                        <td className="py-2.5 pr-4 text-richblack-5 flex items-center gap-2">
                          <img
                            src={u.image || `https://api.dicebear.com/7.x/initials/svg?seed=${u.firstName}`}
                            alt={u.firstName}
                            className="h-7 w-7 rounded-full object-cover"
                          />
                          {u.firstName} {u.lastName}
                        </td>
                        <td className="py-2.5 pr-4 text-richblack-300">{u.email}</td>
                        <td className="py-2.5 pr-4">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            u.accountType === "Admin"
                              ? "bg-purple-900/40 text-purple-300"
                              : u.accountType === "Instructor"
                              ? "bg-blue-900/40 text-blue-300"
                              : "bg-green-900/40 text-green-300"
                          }`}>
                            {u.accountType}
                          </span>
                        </td>
                        <td className="py-2.5 text-richblack-400">
                          {new Date(u.createdAt).toLocaleDateString("en-IN", {
                            day: "numeric", month: "short", year: "numeric",
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
