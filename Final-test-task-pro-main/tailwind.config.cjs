/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{js,ts,jsx,tsx}',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      padding: {
        safe: 'env(safe-area-inset-bottom)',
        'safe-top': 'env(safe-area-inset-top)',
      },
    },
  },
  safelist: [
    'bg-[#10B981]',
    'hover:bg-[#059669]',
    'bg-[#EF4444]',
    'hover:bg-[#DC2626]',
    'bg-[#4F46E5]',
    'hover:bg-[#4338CA]',
  ],
  plugins: [],
};

