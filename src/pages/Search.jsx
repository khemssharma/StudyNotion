import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiConnector } from '../services/apiconnector';
import { searchEndpoints } from '../services/apis';

const cardStyle = {
  background: '#232323',
  borderRadius: '12px',
  boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
  display: 'flex',
  alignItems: 'center',
  margin: '2vw 10vw',
  padding: '1.5vw',
  color: 'white',
  gap: '2vw',
  maxWidth: '700px',
  cursor: 'pointer',
  textDecoration: 'none',
};

const imgStyle = {
  width: '120px',
  height: '80px',
  objectFit: 'cover',
  borderRadius: '8px',
  background: '#111',
  flexShrink: 0,
};

const infoStyle = {
  flex: 1,
};

const titleStyle = {
  fontSize: '1.2em',
  fontWeight: 600,
  marginBottom: '0.5em',
  color: '#FFD60A',
};

const descStyle = {
  fontSize: '1em',
  color: '#ccc',
  marginBottom: '0.5em',
};

const instructorStyle = {
  fontSize: '0.95em',
  color: '#aaa',
};

const instructorProfileStyle = {
  background: '#181818',
  borderRadius: '12px',
  boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
  display: 'flex',
  alignItems: 'center',
  margin: '2vw 10vw 1vw 10vw',
  padding: '1vw 2vw',
  color: 'white',
  gap: '2vw',
  maxWidth: '700px',
};

const instructorImgStyle = {
  width: '70px',
  height: '70px',
  borderRadius: '50%',
  objectFit: 'cover',
  background: '#222',
};

const Search = () => {
  const { query } = useParams();
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Find if all courses are from the same instructor
  const getUniqueInstructor = (courses) => {
    if (!courses.length) return null;
    const firstInstructorId = courses[0]?.instructor?._id;
    if (
      firstInstructorId &&
      courses.every(
        (course) => course.instructor && course.instructor._id === firstInstructorId
      )
    ) {
      return courses[0].instructor;
    }
    return null;
  };

  useEffect(() => {
    const fetchSearchResults = async () => {
      if (!query) return;

      try {
        const res = await apiConnector(
          'GET',
          searchEndpoints.COURSE_SEARCH_API + `?query=${encodeURIComponent(query)}`
        );
        setSearchResults(Array.isArray(res.data.data) ? res.data.data : []);
      } catch (err) {
        setError('Failed to fetch search results.');
      } finally {
        setLoading(false);
      }
    };

    fetchSearchResults();
  }, [query]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>{error}</div>;
  }

  const uniqueInstructor = getUniqueInstructor(searchResults);

  return (
    <div>
      <h1 style={{color: "white", margin:"6vw 8vw 2vw 8vw"}}>
        Search Results for: <span style={{color: "#FFD60A"}}>{decodeURIComponent(query)}</span>
      </h1>

      {/* Instructor Profile Card */}
      {uniqueInstructor && (
        <Link
          to={`/instructor/${uniqueInstructor._id}`}
          style={{ textDecoration: 'none' }}
        >
          <div style={instructorProfileStyle}>
            <img
              src={uniqueInstructor.image || "https://via.placeholder.com/70?text=No+Image"}
              alt={uniqueInstructor.firstName + " " + uniqueInstructor.lastName}
              style={instructorImgStyle}
              onError={e => { e.target.src = "https://via.placeholder.com/70?text=No+Image"; }}
            />
            <div>
              <div style={{fontWeight: 600, fontSize: "1.1em", color: "#FFD60A"}}>
                {uniqueInstructor.firstName} {uniqueInstructor.lastName}
              </div>
              <div style={{color: "#ccc", fontSize: "0.98em"}}>
                {uniqueInstructor.email}
              </div>
              <div style={{color: "#aaa", fontSize: "0.95em"}}>
                Instructor
              </div>
            </div>
          </div>
        </Link>
      )}

      {searchResults.length > 0 ? (
        <div>
          {searchResults.map((course, index) => (
            <Link
              to={`/courses/${course._id}`}
              key={course._id || index}
              style={{ ...cardStyle, display: 'flex' }}
            >
              <img
                src={course.thumbnail}
                alt={course.courseName}
                style={imgStyle}
                onError={e => { e.target.src = "https://via.placeholder.com/120x80?text=No+Image"; }}
              />
              <div style={infoStyle}>
                <div style={titleStyle}>{course.courseName}</div>
                <div style={descStyle}>{course.courseDescription}</div>
                <div style={instructorStyle}>
                  Instructor: {course.instructor?.firstName} {course.instructor?.lastName}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p style={{color: "white", margin:"8vw"}}>No results found.</p>
      )}
    </div>
  );
};

export default Search;