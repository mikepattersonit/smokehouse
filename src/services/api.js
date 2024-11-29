// Placeholder for API integrations
export const fetchData = async (endpoint) => {
    try {
      const response = await fetch(endpoint);
      return response.json();
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };
  