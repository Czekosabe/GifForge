import * as Comlink from 'comlink'
import type { GifPipeline } from './pipeline.worker'

let worker: Worker | null = null
let remote: Comlink.Remote<GifPipeline> | null = null

/** Lazily creates the single shared pipeline worker (decode/render/optimize/encode all live here to avoid cross-worker buffer transfers). */
export function getPipeline(): Comlink.Remote<GifPipeline> {
  if (!remote) {
    worker = new Worker(new URL('./pipeline.worker.ts', import.meta.url), { type: 'module' })
    remote = Comlink.wrap<GifPipeline>(worker)
  }
  return remote
}

export function terminatePipeline(): void {
  worker?.terminate()
  worker = null
  remote = null
}

export function proxyProgress(
  cb: (fraction: number | null, message: string) => void,
): (fraction: number | null, message: string) => void {
  return Comlink.proxy(cb)
}
