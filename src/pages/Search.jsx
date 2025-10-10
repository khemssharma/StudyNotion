import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
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

const Search = () => {
  const { query } = useParams();
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  return (
    <div>
      <h1 style={{color: "white", margin:"10vw 10vw 2vw 10vw"}}>
        Search Results for: <span style={{color: "#FFD60A"}}>{decodeURIComponent(query)}</span>
      </h1>
      {searchResults.length > 0 ? (
        <div>
          {searchResults.map((course, index) => (
            <div key={course._id || index} style={cardStyle}>
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
            </div>
          ))}
        </div>
      ) : (
        <p style={{color: "white", margin:"10vw"}}>No results found.</p>
      )}
    </div>
  );
};

export default Search;