import type * as OpenCvStar from '@techstark/opencv-js'

/** 与原先静态导入时一致；此处仅用 `import type`，不把 OpenCV 运行时打进主包 */
type CvModule = typeof OpenCvStar & {
  Mat?: unknown
  onRuntimeInitialized?: () => void
  then?: unknown
}

async function waitUntilMatUsable(cv: CvModule, timeoutMs: number): Promise<void> {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = new (cv as any).Mat(1, 1, (cv as any).CV_8UC1)
      m.delete()
      return
    } catch {
      await new Promise((r) => setTimeout(r, 40))
    }
  }
  throw new Error('OpenCV Mat not usable (timeout)')
}

async function resolveImportedCv(): Promise<CvModule> {
  const opencvStar = await import('@techstark/opencv-js')
  const cvModuleRaw = (opencvStar as { default?: unknown }).default ?? opencvStar

  let cv: CvModule

  if (cvModuleRaw instanceof Promise) {
    cv = (await cvModuleRaw) as CvModule
  } else if ((cvModuleRaw as CvModule).Mat) {
    cv = cvModuleRaw as CvModule
  } else {
    const mod = cvModuleRaw as CvModule
    try {
      await Promise.race([
        new Promise<void>((resolve) => {
          const prev = mod.onRuntimeInitialized
          mod.onRuntimeInitialized = () => {
            prev?.()
            resolve()
          }
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('opencv init timeout')), 15_000),
        ),
      ])
    } catch {
      await waitUntilMatUsable(mod, 15_000)
    }
    cv = mod
  }

  if (typeof cv?.then === 'function') {
    delete cv.then
  }

  return cv
}

let loadOpenCvPromise: Promise<CvModule> | null = null

/** 首次调用时动态加载 @techstark/opencv-js，避免打进首页主包 */
export function loadOpenCv(): Promise<CvModule> {
  if (!loadOpenCvPromise) {
    loadOpenCvPromise = resolveImportedCv()
  }
  return loadOpenCvPromise
}
