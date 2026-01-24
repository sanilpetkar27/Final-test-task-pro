import React from 'react';
import ReactDOM from 'react-dom/client';

const SimpleApp = () => {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">✅ App is Working!</h1>
        <p className="text-xl">React + Vite + Tailwind CSS</p>
        <p className="text-gray-400 mt-4">If you can see this, the basic setup is working.</p>
      </div>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(<SimpleApp />);
