import { useState, useEffect } from "react";
import axios from "axios";

const useFetch = (url) => {
  const [data, setData] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await axios.get(url);
        console.log('res: ', res);
        setData(res.data.data); // Giả định rằng dữ liệu nằm trong `res.data.data`
        setError(null);
      } catch (err) {
        console.log('err: ', err);
        setError(err.message || "Something went wrong");
        setData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [url]);

  return { data, error, loading };
};

export default useFetch;