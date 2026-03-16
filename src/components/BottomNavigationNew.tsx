import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { CheckSquare, Bell, Users, Settings } from 'lucide-react';

export default function BottomNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/tasks') {
      return location.pathname === '/' || location.pathname.startsWith('/tasks');
    }
    return location.pathname === path;
  };

  return (
    <nav style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: '70px',
      backgroundColor: 'white',
      borderTop: '1px solid #e5e7eb',
      display: 'flex',
      justifyContent: 'space-around',
      alignItems: 'center',
      zIndex: 1000,
      boxShadow: '0 -2px 10px rgba(0,0,0,0.1)'
    }}>
      <button
        onClick={() => navigate('/tasks')}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
          padding: '8px 16px',
          minWidth: '60px',
          minHeight: '60px',
          border: 'none',
          backgroundColor: 'transparent',
          cursor: 'pointer',
          color: isActive('/tasks') ? '#4F46E5' : '#6B7280',
          borderRadius: '8px',
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => {
          if (!isActive('/tasks')) {
            e.currentTarget.style.backgroundColor = '#f3f4f6';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <CheckSquare size={24} />
        <span style={{ fontSize: '12px', fontWeight: isActive('/tasks') ? 600 : 400 }}>
          TASKS
        </span>
      </button>

      <button
        onClick={() => navigate('/approvals')}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
          padding: '8px 16px',
          minWidth: '60px',
          minHeight: '60px',
          border: 'none',
          backgroundColor: 'transparent',
          cursor: 'pointer',
          color: isActive('/approvals') ? '#4F46E5' : '#6B7280',
          borderRadius: '8px',
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => {
          if (!isActive('/approvals')) {
            e.currentTarget.style.backgroundColor = '#f3f4f6';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <Bell size={24} />
        <span style={{ fontSize: '12px', fontWeight: isActive('/approvals') ? 600 : 400 }}>
          APPROVALS
        </span>
      </button>

      <button
        onClick={() => navigate('/team')}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
          padding: '8px 16px',
          minWidth: '60px',
          minHeight: '60px',
          border: 'none',
          backgroundColor: 'transparent',
          cursor: 'pointer',
          color: isActive('/team') ? '#4F46E5' : '#6B7280',
          borderRadius: '8px',
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => {
          if (!isActive('/team')) {
            e.currentTarget.style.backgroundColor = '#f3f4f6';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <Users size={24} />
        <span style={{ fontSize: '12px', fontWeight: isActive('/team') ? 600 : 400 }}>
          TEAM
        </span>
      </button>

      <button
        onClick={() => navigate('/settings')}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
          padding: '8px 16px',
          minWidth: '60px',
          minHeight: '60px',
          border: 'none',
          backgroundColor: 'transparent',
          cursor: 'pointer',
          color: isActive('/settings') ? '#4F46E5' : '#6B7280',
          borderRadius: '8px',
          transition: 'all 0.2s ease'
        }}
        onMouseEnter={(e) => {
          if (!isActive('/settings')) {
            e.currentTarget.style.backgroundColor = '#f3f4f6';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <Settings size={24} />
        <span style={{ fontSize: '12px', fontWeight: isActive('/settings') ? 600 : 400 }}>
          SETTINGS
        </span>
      </button>
    </nav>
  );
}
