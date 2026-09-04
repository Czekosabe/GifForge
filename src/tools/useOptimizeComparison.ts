import { useEffect, useRef, useState } from 'react'
import { getPipeline } from '../workers/client'
import type { CompareDecodeResult } from '../workers/pipeline.worker'

export interface OptimizeResultData {
  bytes: Uint8Array
  achievedBytes: number
  achievedTarget: boolean
  message: string
  width: number
  height: number
}

export interface ComparisonState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  original: CompareDecodeResult | null
  optimized: CompareDecodeResult | null
  error: string | null
}

const IDLE: ComparisonState = { status: 'idle', original: null, optimized: null, error: null }

function closeSide(side: CompareDecodeResult | null): void {
  side?.bitmaps.forEach((b) => b.close())
}

/**
 * Decodes the real "before" (original upload) and "after" (actual optimized output) GIF
 * bytes into displayable bitmaps for the visual comparison viewer, whenever a NEW
 * optimization result appears. Deliberately keyed on `result`/`sourceBlob` object identity
 * (both are stable React state until something real changes) so re-renders that don't
 * change either — e.g. dragging the comparison split, which is pure CSS/local state —
 * never trigger a re-decode. `result` becoming null (no result yet, a New Project, or a
 * fresh run superseding this one) invalidates and releases the previous comparison.
 */
export function useOptimizeComparison(result: OptimizeResultData | null, sourceBlob: Blob | null): ComparisonState {
  const [state, setState] = useState<ComparisonState>(IDLE)
  const heldRef = useRef<{ original: CompareDecodeResult | null; optimized: CompareDecodeResult | null }>({
    original: null,
    optimized: null,
  })

  useEffect(() => {
    if (!result || !sourceBlob) {
      closeSide(heldRef.current.original)
      closeSide(heldRef.current.optimized)
      heldRef.current = { original: null, optimized: null }
      setState(IDLE)
      return
    }

    let cancelled = false
    setState({ status: 'loading', original: null, optimized: null, error: null })

    const resultBytes = result.bytes
    const blob = sourceBlob

    async function run() {
      try {
        const pipeline = getPipeline()
        // A fresh copy: result.bytes is also what the "Download optimized GIF" button
        // sends to downloadBytes — Comlink would transfer (detach) the buffer we hand it,
        // so we slice a copy here rather than risk zeroing out the downloadable bytes.
        const optimizedCopy = resultBytes.buffer.slice(
          resultBytes.byteOffset,
          resultBytes.byteOffset + resultBytes.byteLength,
        ) as ArrayBuffer
        const [original, optimized] = await Promise.all([
          blob.arrayBuffer().then((buf) => pipeline.decodeForCompare(buf)),
          pipeline.decodeForCompare(optimizedCopy),
        ])
        if (cancelled) {
          original.bitmaps.forEach((b) => b.close())
          optimized.bitmaps.forEach((b) => b.close())
          return
        }
        closeSide(heldRef.current.original)
        closeSide(heldRef.current.optimized)
        heldRef.current = { original, optimized }
        setState({ status: 'ready', original, optimized, error: null })
      } catch (err) {
        if (cancelled) return
        setState({
          status: 'error',
          original: null,
          optimized: null,
          error: err instanceof Error ? err.message : 'Failed to prepare the visual comparison.',
        })
      }
    }
    run()

    return () => {
      cancelled = true
    }
  }, [result, sourceBlob])

  // Unmount (e.g. switching away from the Optimize tool): release whatever is currently held.
  useEffect(() => {
    return () => {
      closeSide(heldRef.current.original)
      closeSide(heldRef.current.optimized)
    }
  }, [])

  return state
}
