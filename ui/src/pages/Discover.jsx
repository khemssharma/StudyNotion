import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { apiConnector } from "../services/apiconnector";
import { courseEndpoints } from "../services/apis";
import RatingStars from "../components/common/RatingStars";

const { RECOMMENDATIONS_API } = courseEndpoints;

// Lightweight course card that works with the API's flattened shape
// (avgRating + enrollmentCount — ratingAndReviews is stripped server-side)
function DiscoverCourseCard({ course }) {
  return (
    <Link to={`/courses/${course._id}`}>
      <div className="rounded-xl overflow-hidden bg-richblack-800 hover:scale-[1.02] transition-transform duration-200">
        <img
          src={course?.thumbnail}
          alt={course?.courseName}
          className="h-[180px] w-full object-cover"
        />
        <div className="flex flex-col gap-2 p-4">
          <p className="text-base font-semibold text-richblack-5 line-clamp-2">
            {course?.courseName}
          </p>
          <p className="text-sm text-richblack-300">
            {course?.instructor?.firstName} {course?.instructor?.lastName}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-yellow-5 text-sm font-bold">
              {course?.avgRating?.toFixed(1) || "0.0"}
            </span>
            <RatingStars Review_Count={course?.avgRating || 0} />
            {course?.enrollmentCount > 0 && (
              <span className="text-richblack-400 text-xs ml-auto">
                {course.enrollmentCount.toLocaleString()} students
              </span>
            )}
          </div>
          <p className="text-richblack-5 font-bold">
            {course?.price === 0 ? "Free" : `₹${course?.price}`}
          </p>
        </div>
      </div>
    </Link>
  );
}

function CourseSection({ title, subtitle, courses, emptyMsg }) {
  if (!courses || courses.length === 0) {
    return (
      <section className="mb-12">
        <h2 className="text-2xl font-bold text-richblack-5 mb-1">{title}</h2>
        {subtitle && <p className="text-richblack-300 mb-6 text-sm">{subtitle}</p>}
        <p className="text-richblack-400 italic">{emptyMsg}</p>
      </section>
    );
  }
  return (
    <section className="mb-14">
      <h2 className="text-2xl font-bold text-richblack-5 mb-1">{title}</h2>
      {subtitle && <p className="text-richblack-300 mb-6 text-sm">{subtitle}</p>}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {courses.map((course) => (
          <DiscoverCourseCard key={course._id} course={course} />
        ))}
      </div>
    </section>
  );
}

export default function Discover() {
  const { token } = useSelector((state) => state.auth);
  const [data, setData] = useState({
    recommended: [],
    trending: [],
    topRated: [],
    categories: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState("all");

  useEffect(() => {
    const fetchRecommendations = async () => {
      try {
        setLoading(true);
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const response = await apiConnector("GET", RECOMMENDATIONS_API, null, headers);
        if (response?.data?.success) {
          setData(response.data.data);
        } else {
          setError("Could not load recommendations.");
        }
      } catch (err) {
        console.error("Discover page error:", err);
        setError("Something went wrong. Please try again.");
      } finally {
        setLoading(false);
      }
    };
    fetchRecommendations();
  }, [token]);

  // Filter all three sections by category when a chip is active
  const filterByCat = (courses) => {
    if (activeCategory === "all") return courses;
    return courses.filter(
      (c) => c.category && c.category._id?.toString() === activeCategory
    );
  };

  return (
    <div className="min-h-screen bg-richblack-900 text-white">
      {/* Hero Banner */}
      <div className="bg-richblack-800 py-12">
        <div className="mx-auto w-11/12 max-w-maxContent">
          <h1 className="text-3xl font-bold text-richblack-5">
            {token ? "Courses Picked for You" : "Explore Courses"}
          </h1>
          <p className="mt-2 text-richblack-300">
            {token
              ? "Personalised picks based on your interests, plus what's trending and top-rated."
              : "Browse trending and top-rated courses — sign in for personalised picks."}
          </p>
        </div>
      </div>

      <div className="mx-auto w-11/12 max-w-maxContent py-10">
        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-20">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-yellow-50 border-t-transparent" />
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <p className="text-center text-richblack-300 py-20">{error}</p>
        )}

        {!loading && !error && (
          <>
            {/* Category filter chips */}
            {data.categories.length > 0 && (
              <div className="mb-10 flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveCategory("all")}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    activeCategory === "all"
                      ? "bg-yellow-50 text-richblack-900"
                      : "bg-richblack-700 text-richblack-200 hover:bg-richblack-600"
                  }`}
                >
                  All
                </button>
                {data.categories.map((cat) => (
                  <button
                    key={cat._id}
                    onClick={() => setActiveCategory(cat._id)}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                      activeCategory === cat._id
                        ? "bg-yellow-50 text-richblack-900"
                        : "bg-richblack-700 text-richblack-200 hover:bg-richblack-600"
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>
            )}

            {/* Trending — visible to everyone */}
            <CourseSection
              title="🔥 Trending Now"
              subtitle="The most enrolled courses on the platform right now"
              courses={filterByCat(data.trending)}
              emptyMsg="No trending courses in this category yet."
            />

            {/* Top Rated — visible to everyone */}
            <CourseSection
              title="⭐ Top Rated"
              subtitle="Highest-rated courses chosen by our learners"
              courses={filterByCat(data.topRated)}
              emptyMsg="No rated courses in this category yet."
            />

            {/* Recommended — personalised for logged-in users */}
            {token ? (
              <CourseSection
                title="🎯 Recommended for You"
                subtitle="Based on your enrolled courses and interests"
                courses={filterByCat(data.recommended)}
                emptyMsg="Enrol in a few courses so we can personalise your recommendations!"
              />
            ) : (
              /* CTA for guests */
              <div className="mt-4 flex flex-col items-center gap-4 rounded-xl bg-richblack-800 p-10 text-center">
                <p className="text-xl font-semibold text-richblack-100">
                  🎯 Want personalised recommendations?
                </p>
                <p className="text-richblack-300 max-w-md">
                  Sign in and we'll suggest courses based on what you've
                  already been learning.
                </p>
                <Link
                  to="/login"
                  className="rounded-md bg-yellow-50 px-8 py-3 font-semibold text-richblack-900 hover:bg-yellow-100 transition-colors"
                >
                  Log In
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
