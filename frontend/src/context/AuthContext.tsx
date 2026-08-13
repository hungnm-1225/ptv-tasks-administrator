// frontend/src/context/AuthContext.tsx
import { useEffect, useState, createContext, useContext } from 'react';
import { supabase } from '../lib/supabase';

// 🛑 CHỈ CHO PHÉP EMAIL DUY NHẤT NÀY ĐĂNG NHẬP
const ALLOWED_ADMIN_EMAIL = "hung.nguyenmanh@dtt.vn";

export const AuthContext = createContext<any>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Kiểm tra Session hiện tại
    supabase.auth.getSession().then(({ data: { session } }) => {
      checkUserAccess(session?.user ?? null);
    });

    // Lắng nghe sự kiện Đăng nhập từ Google
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      checkUserAccess(session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const checkUserAccess = async (currentUser: any) => {
    if (currentUser) {
      // ⚠️ KIỂM TRA EMAIL: Nếu KHÔNG PHẢI hung.nguyenmanh@dtt.vn -> ĐĂNG XUẤT NGAY!
      if (currentUser.email !== ALLOWED_ADMIN_EMAIL) {
        alert(`❌ Quyền truy cập bị từ chối! Email ${currentUser.email} không có quyền Admin.`);
        await supabase.auth.signOut();
        setUser(null);
      } else {
        setUser(currentUser);
      }
    } else {
      setUser(null);
    }
    setLoading(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};