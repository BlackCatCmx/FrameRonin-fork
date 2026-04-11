import {
  createContext,
  useCallback,
  useContext,
  useId,
  useState,
} from 'react'

export interface StashItem {
  id: string
  url: string
  name?: string
}

const STORAGE_KEY = 'frameronin_stash'

async function urlToDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url
  if (!url.startsWith('blob:')) return url
  const res = await fetch(url)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

function loadFromSession(): StashItem[] {
  try {
    const s = sessionStorage.getItem(STORAGE_KEY)
    if (!s) return []
    const parsed = JSON.parse(s) as StashItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveToSession(items: StashItem[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    /* ignore */
  }
}

interface ImageStashContextValue {
  items: StashItem[]
  addImage: (url: string, name?: string) => void
  removeImage: (id: string) => void
  clearAll: () => void
}

const ImageStashContext = createContext<ImageStashContextValue | null>(null)

export function ImageStashProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<StashItem[]>(() => loadFromSession())
  const idSeed = useId()

  const addImage = useCallback(
    async (url: string, name?: string) => {
      const id = `${idSeed}-${Date.now()}-${Math.random().toString(36).slice(2)}`
      let persistUrl: string
      if (url.startsWith('blob:')) {
        persistUrl = await urlToDataUrl(url).catch(() => url)
        if (persistUrl !== url) URL.revokeObjectURL(url)
      } else {
        persistUrl = url
      }
      setItems((prev) => {
        const next = [...prev, { id, url: persistUrl, name }]
        saveToSession(next)
        return next
      })
    },
    [idSeed]
  )

  const removeImage = useCallback((id: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id)
      if (item?.url.startsWith('blob:')) URL.revokeObjectURL(item.url)
      const next = prev.filter((i) => i.id !== id)
      saveToSession(next)
      return next
    })
  }, [])

  const clearAll = useCallback(() => {
    setItems((prev) => {
      prev.forEach((i) => {
        if (i.url.startsWith('blob:')) URL.revokeObjectURL(i.url)
      })
      saveToSession([])
      return []
    })
  }, [])

  return (
    <ImageStashContext.Provider value={{ items, addImage, removeImage, clearAll }}>
      {children}
    </ImageStashContext.Provider>
  )
}

export function useImageStash() {
  const ctx = useContext(ImageStashContext)
  if (!ctx) throw new Error('useImageStash must be used within ImageStashProvider')
  return ctx
}
