import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AdminUser } from './types';
import { authStorage, adminApi } from './services/api';
import { Login } from './pages/Login';
import { AdminLayout } from './components/AdminLayout';
import { Dashboard } from './pages/Dashboard';
import { MapManager } from './pages/MapManager';
import { PlayerManager } from './pages/PlayerManager';
import { MonsterManager } from './pages/MonsterManager';
import { NpcTemplateManager } from './pages/NpcTemplateManager';
import { DialogueManager } from './pages/DialogueManager';
import { SystemGrant } from './pages/SystemGrant';
import { NpcInstanceManager } from './pages/NpcInstanceManager';
import { NotificationManager } from './pages/NotificationManager';
import { PlayerLevelUpNotification } from './pages/PlayerLevelUpNotification';
import { StoryNodeNotification } from './pages/StoryNodeNotification';
import { MedicineManager } from './pages/MedicineManager';
import { SkillManager } from './pages/SkillManager';

/**
 * 路由守卫：校验是否已登录管理员，未登录时重定向至 /login 并附带原始路径
 */
const RequireAuth: React.FC<{ children: JSX.Element; user: AdminUser | null }> = ({
  children,
  user,
}) => {
  const location = useLocation();

  if (!user || !authStorage.getToken()) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

const AppContent: React.FC = () => {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState<AdminUser | null>(() => authStorage.getUser());

  useEffect(() => {
    // 全局捕获 401 凭据失效事件，自动回到登录页
    const handleUnauthorized = () => {
      setCurrentUser(null);
      navigate('/login', { replace: true });
    };

    window.addEventListener('admin:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('admin:unauthorized', handleUnauthorized);
  }, [navigate]);

  const handleLoginSuccess = (user: AdminUser) => {
    setCurrentUser(user);
  };

  const handleLogout = () => {
    adminApi.logout();
    setCurrentUser(null);
    navigate('/login', { replace: true });
  };

  return (
    <Routes>
      {/* 登录页面 */}
      <Route
        path="/login"
        element={
          currentUser && authStorage.getToken() ? (
            <Navigate to="/dashboard" replace />
          ) : (
            <Login onLoginSuccess={handleLoginSuccess} />
          )
        }
      />

      {/* 需登录保护的管理总枢路由组 */}
      <Route
        element={
          <RequireAuth user={currentUser}>
            <AdminLayout user={currentUser!} onLogout={handleLogout} />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/maps" element={<MapManager />} />
        <Route path="/npc-templates" element={<NpcTemplateManager />} />
        <Route path="/dialogues" element={<DialogueManager />} />
        <Route path="/monsters" element={<MonsterManager />} />
        <Route path="/players" element={<PlayerManager />} />
        <Route path="/grants" element={<SystemGrant />} />
        <Route path="/medicines" element={<MedicineManager />} />
        <Route path="/skills" element={<SkillManager />} />
        <Route path="/npc-instances" element={<NpcInstanceManager />} />
        <Route path="/notifications" element={<NotificationManager />} />
        <Route path="/notifications/player-level-up" element={<PlayerLevelUpNotification />} />
        <Route path="/notifications/story-trigger" element={<StoryNodeNotification />} />
      </Route>

      {/* 任意未知路径统一回退到 /dashboard */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
};

export default App;
