
import React from 'react';

const Spinner: React.FC = () => {
  return (
    <div
      className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"
      role="status"
      aria-label="Loading..."
    ></div>
  );
};

export default Spinner;
