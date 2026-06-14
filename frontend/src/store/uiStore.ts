import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  // State
  sidebarOpen: boolean;
  treeSidebarOpen: boolean;
  annotationEnabled: boolean;
  settingsOpen: boolean;
  previousTreeSidebarOpen: boolean; // saved before opening settings
  exploringBranches: string[]; // branch IDs currently exploring
  dirtyBranches: Record<string, string[]>; // rootConversationId -> branch IDs with unseen messages

  // Actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleTreeSidebar: () => void;
  toggleAnnotation: () => void;
  setAnnotationEnabled: (enabled: boolean) => void;
  toggleSettings: () => void;
  setSettingsOpen: (open: boolean) => void;
  addExploringBranch: (id: string) => void;
  removeExploringBranch: (id: string) => void;
  addDirtyBranch: (rootId: string, branchId: string) => void;
  removeDirtyBranch: (rootId: string, branchId: string) => void;
  clearDirtyBranches: (rootId: string) => void;
}

const useUIStore = create<UIState>()(
  persist(
    (set) => ({
  // Initial state
  sidebarOpen: true,
  treeSidebarOpen: true,
  annotationEnabled: true,
  settingsOpen: false,
  previousTreeSidebarOpen: true,
  exploringBranches: [],
  dirtyBranches: {},

  // Actions
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  toggleTreeSidebar: () => set((state) => ({ treeSidebarOpen: !state.treeSidebarOpen })),

  toggleAnnotation: () =>
    set((state) => ({ annotationEnabled: !state.annotationEnabled })),

  setAnnotationEnabled: (enabled) => set({ annotationEnabled: enabled }),

  toggleSettings: () =>
    set((state) => {
      if (state.settingsOpen) {
        // Closing settings: restore tree sidebar
        return { settingsOpen: false, treeSidebarOpen: state.previousTreeSidebarOpen };
      }
      // Opening settings: save tree sidebar and collapse it
      return { settingsOpen: true, previousTreeSidebarOpen: state.treeSidebarOpen, treeSidebarOpen: false };
    }),

  setSettingsOpen: (open) =>
    set((state) => {
      if (open && !state.settingsOpen) {
        return { settingsOpen: true, previousTreeSidebarOpen: state.treeSidebarOpen, treeSidebarOpen: false };
      }
      if (!open && state.settingsOpen) {
        return { settingsOpen: false, treeSidebarOpen: state.previousTreeSidebarOpen };
      }
      return {};
    }),

  addExploringBranch: (id) =>
    set((state) => {
      if (state.exploringBranches.includes(id)) return state;
      return { exploringBranches: [...state.exploringBranches, id] };
    }),

  removeExploringBranch: (id) =>
    set((state) => ({
      exploringBranches: state.exploringBranches.filter((b) => b !== id),
    })),

  addDirtyBranch: (rootId, branchId) =>
    set((state) => {
      const existing = state.dirtyBranches[rootId] ?? [];
      if (existing.includes(branchId)) return state;
      return {
        dirtyBranches: {
          ...state.dirtyBranches,
          [rootId]: [...existing, branchId],
        },
      };
    }),

  removeDirtyBranch: (rootId, branchId) =>
    set((state) => {
      const existing = state.dirtyBranches[rootId];
      if (!existing) return state;
      const filtered = existing.filter((b) => b !== branchId);
      if (filtered.length === existing.length) return state;
      if (filtered.length === 0) {
        const { [rootId]: _, ...rest } = state.dirtyBranches;
        return { dirtyBranches: rest };
      }
      return {
        dirtyBranches: {
          ...state.dirtyBranches,
          [rootId]: filtered,
        },
      };
    }),

  clearDirtyBranches: (rootId) =>
    set((state) => {
      if (!state.dirtyBranches[rootId]) return state;
      const { [rootId]: _, ...rest } = state.dirtyBranches;
      return { dirtyBranches: rest };
    }),
    }),
    {
      name: 'graphchat-ui-store',
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        treeSidebarOpen: state.treeSidebarOpen,
        annotationEnabled: state.annotationEnabled,
        settingsOpen: state.settingsOpen,
        dirtyBranches: state.dirtyBranches,
      }),
    },
  ),
);

export default useUIStore;
