import React, { useState } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Users, Settings, CheckSquare, List } from 'lucide-react';

export type WebTabType = 'tasks' | 'approvals' | 'team' | 'settings' | 'notifications';

const BottomNavigation = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<WebTabType>('tasks');

  const getTabIcon = (tab: WebTabType, isActive: boolean) => {
    const color = isActive ? '#3B82F6' : '#6B7280';
    switch (tab) {
      case 'tasks':
        return <CheckSquare size={20} color={color} />;
      case 'approvals':
        return <Bell size={20} color={color} />;
      case 'team':
        return <Users size={20} color={color} />;
      case 'settings':
        return <Settings size={20} color={color} />;
      case 'notifications':
        return <Bell size={20} color={color} />;
      default:
        return <List size={20} color={color} />;
    }
  };

  const handleTabClick = (tab: WebTabType) => {
    setActiveTab(tab);
    switch (tab) {
      case 'tasks':
        navigate('/');
        break;
      case 'approvals':
        navigate('/approvals');
        break;
      case 'team':
        navigate('/team');
        break;
      case 'settings':
        navigate('/settings');
        break;
      case 'notifications':
        navigate('/notifications');
        break;
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 rounded-t-2xl shadow-lg">
      <div className="flex justify-around items-center p-2">
        <button
          onClick={() => handleTabClick('tasks')}
          className={`flex flex-col items-center p-3 rounded-t-lg transition-all duration-200 ${
            activeTab === 'tasks' ? 'bg-blue-500 text-white' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {getTabIcon('tasks', activeTab === 'tasks')}
          <span className="text-xs mt-1 font-medium">Tasks</span>
        </button>

        <button
          onClick={() => handleTabClick('approvals')}
          className={`flex flex-col items-center p-3 rounded-t-lg transition-all duration-200 ${
            activeTab === 'approvals' ? 'bg-blue-500 text-white' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {getTabIcon('approvals', activeTab === 'approvals')}
          <span className="text-xs mt-1 font-medium">Approvals</span>
        </button>

        <button
          onClick={() => handleTabClick('team')}
          className={`flex flex-col items-center p-3 rounded-t-lg transition-all duration-200 ${
            activeTab === 'team' ? 'bg-blue-500 text-white' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {getTabIcon('team', activeTab === 'team')}
          <span className="text-xs mt-1 font-medium">Team</span>
        </button>

        <button
          onClick={() => handleTabClick('settings')}
          className={`flex flex-col items-center p-3 rounded-t-lg transition-all duration-200 ${
            activeTab === 'settings' ? 'bg-blue-500 text-white' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {getTabIcon('settings', activeTab === 'settings')}
          <span className="text-xs mt-1 font-medium">Settings</span>
        </button>
      </div>
    </div>
  );
};

export default BottomNavigation;
