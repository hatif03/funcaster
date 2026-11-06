import { useCallback, useEffect, useRef, useState } from 'react'
import { ReadError, type ChainSnapshot, type ReadErrorKind } from '../lib/reader'

export type SnapshotState =
  | { status: 'loading'; attemptedAt?: number }
  | { status: 'ready'; snapshot: ChainSnapshot; attemptedAt: number }
  | { status: 'error'; kind: ReadErrorKind; message: string; observedChainId?: number; attemptedAt: number }

/** Loads on mount and on every `refresh()`. Stale responses are discarded. */
export function useChainSnapshot(read: () => Promise<ChainSnapshot>, now: () => number = Date.now) {
  const [state, setState] = useState<SnapshotState>({ status: 'loading' })
  const requestId = useRef(0)
  const readRef = useRef(read)
  useEffect(() => {
    readRef.current = read
  })

  const load = useCallback(async () => {
    const id = ++requestId.current
    try {
      const snapshot = await readRef.current()
      if (id !== requestId.current) return
      setState({ status: 'ready', snapshot, attemptedAt: snapshot.checkedAt })
    } catch (error) {
      if (id !== requestId.current) return
      const attemptedAt = now()
      if (error instanceof ReadError) {
        setState({
          status: 'error',
          kind: error.kind,
          message: error.message,
          observedChainId: error.observedChainId,
          attemptedAt,
        })
      } else {
        setState({
          status: 'error',
          kind: 'rpc',
          message: error instanceof Error ? error.message : 'Unexpected error while reading.',
          attemptedAt,
        })
      }
    }
  }, [now])

  const refresh = useCallback(() => {
    setState((prev) => ({ status: 'loading', attemptedAt: prev.attemptedAt }))
    return load()
  }, [load])

  useEffect(() => {
    void load()
    return () => {
      requestId.current += 1
    }
  }, [load])

  return { state, refresh }
}
