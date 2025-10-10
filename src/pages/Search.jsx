import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom'; // <-- useParams instead of useLocation
import { apiConnector } from '../services/apiconnector';

const Search = () => {
  const { query } = useParams(); 
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSearchResults = async () => {
      if (!query) return;

      try {
        const res = await apiConnector('GET', `/mock-api/search?query=${encodeURIComponent(query)}`);
        // Ensure searchResults is always an array
        setSearchResults(Array.isArray(res.data) ? res.data : []);
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
      <h1 style={{color: "white", margin:"10vw"}}>Search Results for: <span style={{color: "#FFD60A"}}>{decodeURIComponent(query)}</span></h1>
      {searchResults.length > 0 ? (
        <ul>
          {searchResults.map((result, index) => (
            <li key={index}>{result.title}</li>
          ))}
        </ul>
      ) : (
        <p style={{color: "white", margin:"10vw"}}>No results found.</p>
      )}
    </div>
  );
};

export default Search;