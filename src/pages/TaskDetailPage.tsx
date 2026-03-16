import React from 'react';
import { useParams } from 'react-router-dom';
import { BackToTasksButton } from '../components/BackToTasksButton';
import { ErrorBoundary } from './ErrorBoundary';

export const TaskDetailPage: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-gray-50">
        {/* Mobile-friendly header with large back button */}
        <div className="bg-white border-b border-gray-200 px-4 py-4">
          <div className="max-w-4xl mx-auto">
            <BackToTasksButton className="mb-4" />
            <h1 className="text-2xl font-bold text-gray-900">Task Details</h1>
          </div>
        </div>

        {/* Task detail content would go here */}
        <div className="p-4">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-lg shadow-md p-6">
              <p className="text-gray-600">Task ID: {taskId}</p>
              {/* Task details would be rendered here */}
            </div>
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};
