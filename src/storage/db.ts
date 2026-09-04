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

class GifForgeDatabase extends Dexie {
  projects!: Table<StoredProject, string>
  assets!: Table<StoredAsset, string>

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
    await db.projects.put({ id: CURRENT_PROJECT_ID, updatedAt: Date.now(), project, sourceBlob })
  } catch (err) {
    throw new StorageError(`Failed to autosave project: ${(err as Error).message}`)
  }
}

export async function loadProjectAutosave(): Promise<StoredProject | undefined> {
  try {
    return await db.projects.get(CURRENT_PROJECT_ID)
  } catch (err) {
    throw new StorageError(`Failed to load autosaved project: ${(err as Error).message}`)
  }
}

export async function clearProjectAutosave(): Promise<void> {
  await db.projects.delete(CURRENT_PROJECT_ID)
  await db.assets.where('projectId').equals(CURRENT_PROJECT_ID).delete()
}

export async function saveAsset(id: string, blob: Blob, name: string): Promise<void> {
  await db.assets.put({ id, projectId: CURRENT_PROJECT_ID, blob, name })
}

export async function loadAssets(): Promise<StoredAsset[]> {
  return db.assets.where('projectId').equals(CURRENT_PROJECT_ID).toArray()
}

export async function deleteAsset(id: string): Promise<void> {
  await db.assets.delete(id)
}
