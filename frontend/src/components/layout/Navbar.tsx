import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Menu, UserCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import ChildSelector from '../parent/ChildSelector';
import LanguageSelector from '../common/LanguageSelector';

interface NavbarProps {
  onMenuClick?: () => void;
  onSidebarOpen?: () => void;
  onSidebarClose?: () => void;
}

const Navbar = ({ onMenuClick, onSidebarOpen, onSidebarClose }: NavbarProps) => {
  const { user } = useAuth();

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 sticky top-0 z-40">
      <div className="flex items-center gap-4 flex-1">
        <div onMouseEnter={onSidebarOpen} onMouseLeave={onSidebarClose}>
        <button 
          onClick={onMenuClick}
          className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
        >
          <Menu className="w-6 h-6" />
        </button>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        {user?.role === 'parent' && (
          <>
            <LanguageSelector />
            <ChildSelector />
          </>
        )}
        <Link 
          to={
            user?.role === 'admin' 
              ? '/admin/account' 
              : user?.role === 'student' || user?.role === 'parent' 
                ? '/account' 
                : '/teacher/profile'
          } 
          className="flex items-center gap-3 hover:bg-gray-50 p-1.5 rounded-lg transition-colors cursor-pointer"
        >
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-gray-900">{user?.name}</p>
            <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
          </div>
          {user?.avatar ? (
            <img src={user.avatar} alt="Profile" className="w-9 h-9 rounded-full object-cover border border-gray-200" />
          ) : (
            <UserCircle className="w-9 h-9 text-gray-400" />
          )}
        </Link>
      </div>
    </header>
  );
};

export default Navbar;
