declare global {
  interface Window {
    lamejs?: LameJsApi
  }
}

export interface LameJsApi {
  Mp3Encoder: new (
    channels: number,
    sampleRate: number,
    bitrateKbps: number
  ) => {
    encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array
    flush(): Int8Array
  }
}

let lameJsPromise: Promise<LameJsApi> | null = null

export function loadLameJs(): Promise<LameJsApi> {
  if (window.lamejs?.Mp3Encoder) return Promise.resolve(window.lamejs)
  if (lameJsPromise) return lameJsPromise

  lameJsPromise = new Promise<LameJsApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-lamejs-loader="1"]')
    if (existing) {
      existing.addEventListener('load', () => {
        if (window.lamejs?.Mp3Encoder) resolve(window.lamejs)
        else reject(new Error('ERR_LAMEJS_UNAVAILABLE'))
      })
      existing.addEventListener('error', () => reject(new Error('ERR_LAMEJS_LOAD')))
      return
    }

    const script = document.createElement('script')
    script.src = `${import.meta.env.BASE_URL}vendor/lame.min.js`
    script.async = true
    script.dataset.lamejsLoader = '1'
    script.onload = () => {
      if (window.lamejs?.Mp3Encoder) resolve(window.lamejs)
      else reject(new Error('ERR_LAMEJS_UNAVAILABLE'))
    }
    script.onerror = () => reject(new Error('ERR_LAMEJS_LOAD'))
    document.head.appendChild(script)
  }).catch((error) => {
    lameJsPromise = null
    throw error
  })

  return lameJsPromise
}

