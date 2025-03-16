import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

/**
 * UI state interface
 */
interface UiState {
  // Sidebar state
  sidebar: {
    isOpen: boolean;
    width: number;
  };
  
  // Theme state
  theme: 'light' | 'dark' | 'system';
  
  // Mobile state
  isMobileMenuOpen: boolean;
  
  // Modal state
  modals: {
    [key: string]: boolean;
  };
  
  // Toast notifications
  toasts: {
    id: string;
    type: 'success' | 'error' | 'info' | 'warning';
    message: string;
    duration?: number;
  }[];
  
  // Actions
  actions: {
    // Sidebar
    toggleSidebar: () => void;
    setSidebarOpen: (isOpen: boolean) => void;
    setSidebarWidth: (width: number) => void;
    
    // Theme
    setTheme: (theme: UiState['theme']) => void;
    
    // Mobile menu
    toggleMobileMenu: () => void;
    setMobileMenuOpen: (isOpen: boolean) => void;
    
    // Modals
    openModal: (modalId: string) => void;
    closeModal: (modalId: string) => void;
    toggleModal: (modalId: string) => void;
    
    // Toasts
    addToast: (toast: Omit<UiState['toasts'][0], 'id'>) => string;
    removeToast: (id: string) => void;
    clearToasts: () => void;
  };
}

/**
 * UI state store
 * Manages global UI state like sidebar, theme, modals, and toasts
 */
export const useUiStore = create<UiState>()(
  immer((set) => ({
    // Initial state
    sidebar: {
      isOpen: true,
      width: 260,
    },
    theme: 'system',
    isMobileMenuOpen: false,
    modals: {},
    toasts: [],
    
    // Actions
    actions: {
      // Sidebar actions
      toggleSidebar: () => 
        set((state) => {
          state.sidebar.isOpen = !state.sidebar.isOpen;
        }),
      
      setSidebarOpen: (isOpen) => 
        set((state) => {
          state.sidebar.isOpen = isOpen;
        }),
      
      setSidebarWidth: (width) => 
        set((state) => {
          state.sidebar.width = width;
        }),
      
      // Theme actions
      setTheme: (theme) => 
        set((state) => {
          state.theme = theme;
        }),
      
      // Mobile menu actions
      toggleMobileMenu: () => 
        set((state) => {
          state.isMobileMenuOpen = !state.isMobileMenuOpen;
        }),
      
      setMobileMenuOpen: (isOpen) => 
        set((state) => {
          state.isMobileMenuOpen = isOpen;
        }),
      
      // Modal actions
      openModal: (modalId) => 
        set((state) => {
          state.modals[modalId] = true;
        }),
      
      closeModal: (modalId) => 
        set((state) => {
          state.modals[modalId] = false;
        }),
      
      toggleModal: (modalId) => 
        set((state) => {
          state.modals[modalId] = !state.modals[modalId];
        }),
      
      // Toast actions
      addToast: (toast) => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        set((state) => {
          state.toasts.push({ ...toast, id });
        });
        return id;
      },
      
      removeToast: (id) => 
        set((state) => {
          state.toasts = state.toasts.filter((toast) => toast.id !== id);
        }),
      
      clearToasts: () => 
        set((state) => {
          state.toasts = [];
        }),
    },
  }))
);

// Selector hooks for better performance
export const useSidebar = () => useUiStore((state) => state.sidebar);
export const useTheme = () => useUiStore((state) => state.theme);
export const useModals = () => useUiStore((state) => state.modals);
export const useToasts = () => useUiStore((state) => state.toasts);

// Action hooks
export const useSidebarActions = () => useUiStore((state) => ({
  toggleSidebar: state.actions.toggleSidebar,
  setSidebarOpen: state.actions.setSidebarOpen,
  setSidebarWidth: state.actions.setSidebarWidth,
}));

export const useThemeActions = () => useUiStore((state) => ({
  setTheme: state.actions.setTheme,
}));

export const useMobileMenuActions = () => useUiStore((state) => ({
  toggleMobileMenu: state.actions.toggleMobileMenu,
  setMobileMenuOpen: state.actions.setMobileMenuOpen,
}));

export const useModalActions = () => useUiStore((state) => ({
  openModal: state.actions.openModal,
  closeModal: state.actions.closeModal,
  toggleModal: state.actions.toggleModal,
}));

export const useToastActions = () => useUiStore((state) => ({
  addToast: state.actions.addToast,
  removeToast: state.actions.removeToast,
  clearToasts: state.actions.clearToasts,
})); 