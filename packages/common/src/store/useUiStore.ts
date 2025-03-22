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
    theme: 'system' as const,
    isMobileMenuOpen: false,
    modals: {},
    toasts: [],

    // Actions
    actions: {
      // Sidebar actions
      toggleSidebar: () =>
        set((state: UiState) => {
          state.sidebar.isOpen = !state.sidebar.isOpen;
        }),

      setSidebarOpen: (isOpen: boolean) =>
        set((state: UiState) => {
          state.sidebar.isOpen = isOpen;
        }),

      setSidebarWidth: (width: number) =>
        set((state: UiState) => {
          state.sidebar.width = width;
        }),

      // Theme actions
      setTheme: (theme: UiState['theme']) =>
        set((state: UiState) => {
          state.theme = theme;
        }),

      // Mobile menu actions
      toggleMobileMenu: () =>
        set((state: UiState) => {
          state.isMobileMenuOpen = !state.isMobileMenuOpen;
        }),

      setMobileMenuOpen: (isOpen: boolean) =>
        set((state: UiState) => {
          state.isMobileMenuOpen = isOpen;
        }),

      // Modal actions
      openModal: (modalId: string) =>
        set((state: UiState) => {
          state.modals[modalId] = true;
        }),

      closeModal: (modalId: string) =>
        set((state: UiState) => {
          state.modals[modalId] = false;
        }),

      toggleModal: (modalId: string) =>
        set((state: UiState) => {
          state.modals[modalId] = !state.modals[modalId];
        }),

      // Toast actions
      addToast: (toast: Omit<UiState['toasts'][0], 'id'>) => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        set((state: UiState) => {
          state.toasts.push({ ...toast, id });
        });
        return id;
      },

      removeToast: (id: string) =>
        set((state: UiState) => {
          state.toasts = state.toasts.filter((toast: { id: string }) => toast.id !== id);
        }),

      clearToasts: () =>
        set((state: UiState) => {
          state.toasts = [];
        }),
    },
  }))
);

// Selector hooks for better performance
export const useSidebar = () => useUiStore((state: UiState) => state.sidebar);
export const useTheme = () => useUiStore((state: UiState) => state.theme);
export const useModals = () => useUiStore((state: UiState) => state.modals);
export const useToasts = () => useUiStore((state: UiState) => state.toasts);

// Action hooks
export const useSidebarActions = () =>
  useUiStore((state: UiState) => ({
    toggleSidebar: state.actions.toggleSidebar,
    setSidebarOpen: state.actions.setSidebarOpen,
    setSidebarWidth: state.actions.setSidebarWidth,
  }));

export const useThemeActions = () =>
  useUiStore((state: UiState) => ({
    setTheme: state.actions.setTheme,
  }));

export const useMobileMenuActions = () =>
  useUiStore((state: UiState) => ({
    toggleMobileMenu: state.actions.toggleMobileMenu,
    setMobileMenuOpen: state.actions.setMobileMenuOpen,
  }));

export const useModalActions = () =>
  useUiStore((state: UiState) => ({
    openModal: state.actions.openModal,
    closeModal: state.actions.closeModal,
    toggleModal: state.actions.toggleModal,
  }));

export const useToastActions = () =>
  useUiStore((state: UiState) => ({
    addToast: state.actions.addToast,
    removeToast: state.actions.removeToast,
    clearToasts: state.actions.clearToasts,
  }));
