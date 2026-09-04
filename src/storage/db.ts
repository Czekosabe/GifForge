import Dexie, { type Table } from 'dexie'
import type { Project } from '../types/project'

export interface StoredProject {
  id: string
  updatedAt: number
  project: Project
  sourceBlob: Blob
}

export interface StoredAsset {
  id: string
  projectId: string
  blob: Blob
  name: string
}

/**
 * What actually gets written to IndexedDB. Some WebKit/Safari builds (including the
 * Playwright-bundled WebKit used for this project's cross-browser tests) throw
 * "UnknownError: Error preparing Blob/File data to be stored in object store" when a
 * raw Blob/File is put directly into an object store — a long-standing WebKit
 * IndexedDB limitation. ArrayBuffers don't have this problem in any tested browser,
 * so binary data is converted to ArrayBuffer at the storage boundary and reconstructed
 * into a Blob (preserving its original MIME type) on the way back out. Callers of the
 * public save/load functions below never see this — they still deal in Blob.
 */
interface StoredProjectRecord {
  id: string
  updatedAt: number
  project: Project
  sourceBuffer: ArrayBuffer
  sourceType: string
}

interface StoredAssetRecord {
  id: string
  projectId: string
  buffer: ArrayBuffer
  type: string
  name: string
}

class GifForgeDatabase extends Dexie {
  projects!: Table<StoredProjectRecord, string>
  assets!: Table<StoredAssetRecord, string>

  constructor() {
    super('gifforge')
    this.version(1).stores({
      projects: 'id, updatedAt',
      assets: 'id, projectId',
    })
  }
}

export const db = new GifForgeDatabase()

export const CURRENT_PROJECT_ID = 'current'

export class StorageError extends Error {}

export async function saveProjectAutosave(project: Project, sourceBlob: Blob): Promise<void> {
  try {
    const sourceBuffer = await sourceBlob.arrayBuffer()
    await db.projects.put({
      id: CURRENT_PROJECT_ID,
      updatedAt: Date.now(),
      project,
      sourceBuffer,
      sourceType: sourceBlob.type || 'image/gif',
    })
  } catch (err) {
    throw new StorageError(`Failed to autosave project: ${(err as Error).message}`)
  }
}

export async function loadProjectAutosave(): Promise<StoredProject | undefined> {
  try {
    const record = await db.projects.get(CURRENT_PROJECT_ID)
    if (!record) return undefined
    return {
      id: record.id,
      updatedAt: record.updatedAt,
      project: record.project,
      sourceBlob: new Blob([record.sourceBuffer], { type: record.sourceType }),
    }
  } catch (err) {
    throw new StorageError(`Failed to load autosaved project: ${(err as Error).message}`)
  }
}

export async function clearProjectAutosave(): Promise<void> {
  await db.projects.delete(CURRENT_PROJECT_ID)
  await db.assets.where('projectId').equals(CURRENT_PROJECT_ID).delete()
}

export async function saveAsset(id: string, blob: Blob, name: string): Promise<void> {
  const buffer = await blob.arrayBuffer()
  await db.assets.put({ id, projectId: CURRENT_PROJECT_ID, buffer, type: blob.type || 'application/octet-stream', name })
}

export async function loadAssets(): Promise<StoredAsset[]> {
  const records = await db.assets.where('projectId').equals(CURRENT_PROJECT_ID).toArray()
  return records.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    blob: new Blob([r.buffer], { type: r.type }),
    name: r.name,
  }))
}

export async function deleteAsset(id: string): Promise<void> {
  await db.assets.delete(id)
}
