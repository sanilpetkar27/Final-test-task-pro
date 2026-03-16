import React, { useState } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Users, Settings, CheckSquare, List } from 'lucide-react';
import { useAuthStore } from '../state/authStore';
import { lumina, spacing } from '../theme';

export type WebTabType = 'tasks' | 'approvals' | 'team' | 'settings' | 'notifications';

const BottomNavigation = () => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.profile);
  const [activeTab, setActiveTab] = useState<WebTabType>('tasks');

  const getTabIcon = (tab: WebTabType, isActive: boolean) => {
    const iconProps = {
      size: 20,
      color: isActive ? lumina.action.primary : lumina.text.secondary,
    };

    switch (tab) {
      case 'tasks':
        return <List {...iconProps} />;
      case 'approvals':
        return <CheckSquare {...iconProps} />;
      case 'team':
        return <Users {...iconProps} />;
      case 'settings':
        return <Settings {...iconProps} />;
      case 'notifications':
        return <Bell {...iconProps} />;
      default:
        return null;
    }
  };

  const handleTabClick = (tab: WebTabType) => {
    setActiveTab(tab);
    if (tab === 'tasks') {
      navigate('/');
    } else if (tab === 'approvals') {
      navigate('/approvals');
    } else if (tab === 'team') {
      navigate('/team');
    } else if (tab === 'settings') {
      navigate('/settings');
    }
  };

  // Don't show bottom nav on login page
  if (!currentUser) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 md:hidden">
      <div className="flex justify-around items-center max-w-md mx-auto">
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
