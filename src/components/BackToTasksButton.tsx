import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface BackToTasksButtonProps {
  className?: string;
}

export const BackToTasksButton: React.FC<BackToTasksButtonProps> = ({ className = '' }) => {
  const navigate = useNavigate();

  const handleBackToTasks = () => {
    navigate('/');
  };

  return (
    <button
      onClick={handleBackToTasks}
      className={`
        flex items-center justify-center
        min-h-[44px]
        px-4 py-3
        bg-white
        border border-gray-200
        rounded-lg
        shadow-md
        transition-all duration-200
        hover:bg-gray-50
        active:scale-105
        ${className}
      `}
      style={{
        touchAction: 'manipulation',
      }}
    >
      <ArrowLeft size={20} color="#374151" className="mr-2" />
      <span 
        className="text-gray-700 font-medium text-sm"
        style={{ minHeight: '44px' }}
      >
        ← Back to Tasks
      </span>
    </button>
  );
};
