import { useEffect } from 'react'
import { useProjectStore } from '../state/projectStore'
import { useEditorStore } from '../state/editorStore'
import { usePlaybackStore } from '../state/playbackStore'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

export function useKeyboardShortcuts() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const typing = isTypingTarget(e.target)
      const cmd = e.metaKey || e.ctrlKey

      if (cmd && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        useProjectStore.getState().undo()
        return
      }
      if ((cmd && e.key.toLowerCase() === 'z' && e.shiftKey) || (cmd && e.key.toLowerCase() === 'y')) {
        e.preventDefault()
        useProjectStore.getState().redo()
        return
      }
      if (!typing && (e.key === 'Delete' || e.key === 'Backspace')) {
        const { selectedLayerId, selectLayer } = useEditorStore.getState()
        if (selectedLayerId) {
          e.preventDefault()
          useProjectStore.getState().removeLayer(selectedLayerId)
          selectLayer(null)
        }
        return
      }
      if (!typing && e.key === ' ') {
        if (!useProjectStore.getState().project) return
        e.preventDefault()
        usePlaybackStore.getState().toggle()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
