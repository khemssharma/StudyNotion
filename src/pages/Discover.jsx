import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { apiConnector } from "../services/apiconnector";
import { courseEndpoints } from "../services/apis";
import CourseCard from "../components/core/Catalog/Course_Card";

const { RECOMMENDATIONS_API } = courseEndpoints;

export default function Discover() {
  const { token } = useSelector((state) => state.auth);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchRecommendations = async () => {
      try {
        setLoading(true);
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const response = await apiConnector("GET", RECOMMENDATIONS_API, null, headers);
        if (response?.data?.success) {
          setCourses(response.data.data);
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

  return (
    <div className="min-h-screen bg-richblack-900 text-white">
      {/* Hero Banner */}
      <div className="bg-richblack-800 py-12">
        <div className="mx-auto w-11/12 max-w-maxContent">
          <h1 className="text-3xl font-bold text-richblack-5">
            {token ? "Courses Picked for You" : "Trending Courses"}
          </h1>
          <p className="mt-2 text-richblack-300">
            {token
              ? "Based on your interests and activity, we think you'll love these."
              : "Explore our most popular courses — sign in for personalised picks."}
          </p>
        </div>
      </div>

      <div className="mx-auto w-11/12 max-w-maxContent py-10">
        {loading && (
          <div className="flex justify-center py-20">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-yellow-50 border-t-transparent"></div>
          </div>
        )}

        {!loading && error && (
          <p className="text-center text-richblack-300">{error}</p>
        )}

        {!loading && !error && courses.length === 0 && (
          <p className="text-center text-richblack-300">
            No recommendations found right now. Try enrolling in a course!
          </p>
        )}

        {!loading && !error && courses.length > 0 && (
          <>
            <p className="mb-6 text-richblack-300">
              Showing {courses.length} recommendation{courses.length !== 1 ? "s" : ""}
            </p>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {courses.map((course) => (
                <CourseCard key={course._id} course={course} Height="h-[250px]" />
              ))}
            </div>
          </>
        )}

        {!token && !loading && (
          <div className="mt-10 flex flex-col items-center gap-4 rounded-xl bg-richblack-800 p-8 text-center">
            <p className="text-lg text-richblack-100">
              Sign in to get personalised course recommendations based on your learning history.
            </p>
            <Link
              to="/login"
              className="rounded-md bg-yellow-50 px-6 py-3 font-semibold text-richblack-900 hover:bg-yellow-100"
            >
              Log In
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
