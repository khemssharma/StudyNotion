import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { apiConnector } from "../services/apiconnector";
import { searchEndpoints } from "../services/apis";


function InstructorDetails() {
  const { instructorId } = useParams();
  const [instructor, setInstructor] = useState(null);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchInstructor = async () => {
      try {
        // Fetch instructor details and their courses
        const res = await apiConnector(
          "GET",
          searchEndpoints.INSTRUCTOR_SEARCH_API + `/${instructorId}`
        );
        setInstructor(res.data.instructor);
        setCourses(res.data.courses || []);
      } catch (err) {
        setError("Failed to fetch instructor details.");
      } finally {
        setLoading(false);
      }
    };
    fetchInstructor();
  }, [instructorId]);

  if (loading) {
    return <div className="grid min-h-[calc(100vh-3.5rem)] place-items-center"><div className="spinner"></div></div>;
  }
  if (error || !instructor) {
    return <div className="text-center text-red-500 mt-10">{error || "Instructor not found."}</div>;
  }

  return (
    <div className="w-full bg-richblack-800 min-h-screen">
      <div className="mx-auto box-content px-4 lg:w-[900px] 2xl:relative ">
        {/* Instructor Profile */}
        <div className="flex flex-col items-center py-10">
          <img
            src={
              instructor.image
                ? instructor.image
                : `https://api.dicebear.com/5.x/initials/svg?seed=${instructor.firstName} ${instructor.lastName}`
            }
            alt="Instructor"
            className="h-24 w-24 rounded-full object-cover border-4 border-yellow-100"
          />
          <h2 className="mt-4 text-3xl font-bold text-richblack-5">
            {instructor.firstName} {instructor.lastName}
          </h2>
          <p className="text-richblack-200">{instructor.email}</p>
          <p className="mt-2 text-richblack-50 text-center max-w-xl">
            {instructor?.additionalDetails?.about}
          </p>
        </div>

        {/* Courses by Instructor */}
        <div className="mt-10">
          <h3 className="text-2xl font-semibold text-richblack-5 mb-6">Courses by {instructor.firstName}</h3>
          {courses.length > 0 ? (
            <div className="flex flex-col gap-6">
              {courses.map((course) => (
                <Link
                  to={`/courses/${course._id}`}
                  key={course._id}
                  style={{ textDecoration: 'none' }}
                >
                  <div className="flex bg-richblack-700 rounded-lg p-4 gap-6 items-center shadow-md hover:scale-[1.02] transition-transform cursor-pointer">
                    <img
                      src={course.thumbnail}
                      alt={course.courseName}
                      className="w-32 h-20 object-cover rounded-md bg-richblack-800"
                    />
                    <div className="flex-1">
                      <div className="text-xl font-bold text-yellow-50">{course.courseName}</div>
                      <div className="text-richblack-200 mb-2">{course.courseDescription}</div>
                      <div className="text-richblack-100 text-sm">Price: Rs. {course.price}</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-richblack-200">No courses found for this instructor.</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default InstructorDetails;
