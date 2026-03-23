import { createContext, useCallback, useContext, useEffect, useState } from 'react'

/** File System Access API 的目录句柄（仅 Chromium 系支持） */
export type LocalWorkspaceHandle = FileSystemDirectoryHandle

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>
  }
}

export const canUseLocalWorkspace = typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'

const LOCAL_FOLDER_MODE_KEY = 'frameronin-local-folder-mode'

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'image/bmp']

export interface LocalFolderItem {
  id: string
  url: string
  name: string
  lastModified?: number
}

interface LocalWorkspaceContextValue {
  folderName: string | null
  handle: FileSystemDirectoryHandle | null
  selectFolder: () => Promise<boolean>
  /** true = 本地模式，false = 暂存模式 */
  useLocalFolderMode: boolean
  setUseLocalFolderMode: (v: boolean) => void
  localFolderItems: LocalFolderItem[]
  loadLocalFolderImages: () => Promise<void>
  loadingLocalFolder: boolean
  /** 将文件保存到当前工作目录 */
  saveFileToFolder: (file: File) => Promise<boolean>
  /** 从工作目录删除文件 */
  removeFileFromFolder: (fileName: string) => Promise<boolean>
}

const LocalWorkspaceContext = createContext<LocalWorkspaceContextValue | null>(null)

export function LocalWorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [folderName, setFolderName] = useState<string | null>(null)
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [localFolderItems, setLocalFolderItems] = useState<LocalFolderItem[]>([])
  const [loadingLocalFolder, setLoadingLocalFolder] = useState(false)
  const [useLocalFolderMode, setUseLocalFolderModeState] = useState(() => {
    try {
      return localStorage.getItem(LOCAL_FOLDER_MODE_KEY) === '1'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_FOLDER_MODE_KEY, useLocalFolderMode ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [useLocalFolderMode])

  const setUseLocalFolderMode = useCallback((v: boolean) => {
    if (!canUseLocalWorkspace && v) return
    setUseLocalFolderModeState(v)
  }, [])

  const loadLocalFolderImages = useCallback(async () => {
    const h = handle
    if (!h) return
    setLoadingLocalFolder(true)
    try {
      setLocalFolderItems((prev) => {
        prev.forEach((i) => URL.revokeObjectURL(i.url))
        return []
      })
      const items: LocalFolderItem[] = []
      const dirHandle = h as unknown as { values: () => AsyncIterableIterator<FileSystemHandle> }
      for await (const entry of dirHandle.values()) {
        if (entry.kind !== 'file') continue
        try {
          const file = await (entry as FileSystemFileHandle).getFile()
          const type = (file.type ?? '').toLowerCase()
          const ext = (file.name.split('.').pop() ?? '').toLowerCase()
          const isImage =
            IMAGE_TYPES.some((t) => type.startsWith(t)) ||
            ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)
          if (!isImage) continue
          const url = URL.createObjectURL(file)
          items.push({
            id: `local-${file.name}-${file.lastModified}-${items.length}`,
            url,
            name: file.name,
            lastModified: file.lastModified,
          })
        } catch {
          /* skip unreadable files */
        }
      }
      items.sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0))
      setLocalFolderItems(items)
    } finally {
      setLoadingLocalFolder(false)
    }
  }, [handle])

  useEffect(() => {
    return () => {
      setLocalFolderItems((prev) => {
        prev.forEach((i) => URL.revokeObjectURL(i.url))
        return []
      })
    }
  }, [])

  const removeFileFromFolder = useCallback(
    async (fileName: string): Promise<boolean> => {
      const h = handle
      if (!h) return false
      try {
        await (h as FileSystemDirectoryHandle).removeEntry(fileName)
        return true
      } catch {
        return false
      }
    },
    [handle]
  )

  const saveFileToFolder = useCallback(
    async (file: File): Promise<boolean> => {
      const h = handle
      if (!h) return false
      try {
        const name = file.name || `image_${Date.now()}.png`
        const fileHandle = await (h as FileSystemDirectoryHandle).getFileHandle(name, { create: true })
        const writable = await (fileHandle as FileSystemFileHandle).createWritable()
        await writable.write(file)
        await writable.close()
        return true
      } catch {
        return false
      }
    },
    [handle]
  )

  const selectFolder = useCallback(async () => {
    if (!canUseLocalWorkspace || !window.showDirectoryPicker) return false
    try {
      const h = await window.showDirectoryPicker({ mode: 'readwrite' })
      setHandle(h)
      setFolderName(h.name)
      setUseLocalFolderModeState(true)
      setLocalFolderItems((prev) => {
        prev.forEach((i) => URL.revokeObjectURL(i.url))
        return []
      })
      const items: LocalFolderItem[] = []
      const dirHandle = h as unknown as { values: () => AsyncIterableIterator<FileSystemHandle> }
      for await (const entry of dirHandle.values()) {
        if (entry.kind !== 'file') continue
        try {
          const file = await (entry as FileSystemFileHandle).getFile()
          const type = (file.type ?? '').toLowerCase()
          const ext = (file.name.split('.').pop() ?? '').toLowerCase()
          const isImage =
            IMAGE_TYPES.some((t) => type.startsWith(t)) ||
            ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(ext)
          if (!isImage) continue
          const url = URL.createObjectURL(file)
          items.push({
            id: `local-${file.name}-${file.lastModified}-${items.length}`,
            url,
            name: file.name,
            lastModified: file.lastModified,
          })
        } catch {
          /* skip */
        }
      }
      items.sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0))
      setLocalFolderItems(items)
      return true
    } catch {
      return false
    }
  }, [])

  return (
    <LocalWorkspaceContext.Provider
      value={{
        folderName,
        handle,
        selectFolder,
        useLocalFolderMode,
        setUseLocalFolderMode,
        localFolderItems,
        loadLocalFolderImages,
        loadingLocalFolder,
        saveFileToFolder,
        removeFileFromFolder,
      }}
    >
      {children}
    </LocalWorkspaceContext.Provider>
  )
}

export function useLocalWorkspace() {
  const ctx = useContext(LocalWorkspaceContext)
  if (!ctx) throw new Error('useLocalWorkspace must be used within LocalWorkspaceProvider')
  return ctx
}
