import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

interface AuthContextType {
  user: User | null;
  firebaseUser: FirebaseUser | null;
  token: string | null;
  signInWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signup: (email: string, password: string, fullName: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  updatePassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ADMIN_EMAILS = ['naliniraju774@gmail.com', 'admin@forgexplain.ai'];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Sync Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setLoading(true);
      if (fbUser) {
        setFirebaseUser(fbUser);
        const userToken = await fbUser.getIdToken();
        setToken(userToken);

        const email = fbUser.email?.toLowerCase().trim() || '';
        const isAdmin = ADMIN_EMAILS.includes(email);

        const userDocRef = doc(db, 'users', fbUser.uid);
        let profileUser: User;

        try {
          const docSnap = await getDoc(userDocRef);
          if (docSnap.exists()) {
            profileUser = docSnap.data() as User;
          } else {
            profileUser = {
              id: fbUser.uid,
              email: fbUser.email || '',
              full_name: fbUser.displayName || email.split('@')[0] || 'Forensics Examiner',
              role: isAdmin ? 'admin' : 'user',
              created_at: new Date().toISOString(),
            };
            await setDoc(userDocRef, profileUser);
          }
          setUser(profileUser);
          localStorage.setItem('fx_user', JSON.stringify(profileUser));
          localStorage.setItem('fx_token', userToken);
        } catch (err) {
          console.warn('Firestore profile sync error, falling back to local session:', err);
          profileUser = {
            id: fbUser.uid,
            email: fbUser.email || '',
            full_name: fbUser.displayName || 'Forensics Examiner',
            role: isAdmin ? 'admin' : 'user',
            created_at: new Date().toISOString(),
          };
          setUser(profileUser);
        }
      } else {
        setFirebaseUser(null);
        // Check for local session fallback
        const savedUser = localStorage.getItem('fx_user');
        const savedToken = localStorage.getItem('fx_token');
        if (savedUser && savedToken) {
          try {
            setUser(JSON.parse(savedUser));
            setToken(savedToken);
          } catch {
            setUser(null);
            setToken(null);
          }
        } else {
          setUser(null);
          setToken(null);
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      setLoading(true);
      const result = await signInWithPopup(auth, googleProvider);
      const fbUser = result.user;
      const userToken = await fbUser.getIdToken();
      setToken(userToken);
      setFirebaseUser(fbUser);

      const email = fbUser.email?.toLowerCase().trim() || '';
      const isAdmin = ADMIN_EMAILS.includes(email);

      const userDocRef = doc(db, 'users', fbUser.uid);
      const userProfile: User = {
        id: fbUser.uid,
        email: fbUser.email || '',
        full_name: fbUser.displayName || 'Forensics Examiner',
        role: isAdmin ? 'admin' : 'user',
        created_at: new Date().toISOString(),
      };

      try {
        await setDoc(userDocRef, userProfile, { merge: true });
      } catch (err) {
        console.warn('Firestore profile save warning:', err);
      }

      setUser(userProfile);
      localStorage.setItem('fx_user', JSON.stringify(userProfile));
      localStorage.setItem('fx_token', userToken);
      return { success: true };
    } catch (err: any) {
      console.error('Google Sign-In failed:', err);
      return { success: false, error: err.message || 'Google sign-in failed' };
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Login failed' };
      }
      setUser(data.user);
      setToken(data.token);
      localStorage.setItem('fx_user', JSON.stringify(data.user));
      localStorage.setItem('fx_token', data.token);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  };

  const signup = async (email: string, password: string, fullName: string) => {
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, full_name: fullName }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Signup failed' };
      }
      setUser(data.user);
      setToken(data.token);
      localStorage.setItem('fx_user', JSON.stringify(data.user));
      localStorage.setItem('fx_token', data.token);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('SignOut error:', e);
    }
    setUser(null);
    setFirebaseUser(null);
    setToken(null);
    localStorage.removeItem('fx_user');
    localStorage.removeItem('fx_token');
  };

  const updatePassword = async (newPassword: string) => {
    if (!user) return { success: false, error: 'Not logged in' };
    try {
      const res = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Update failed' };
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Network error' };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        firebaseUser,
        token,
        signInWithGoogle,
        login,
        signup,
        logout,
        updatePassword,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
