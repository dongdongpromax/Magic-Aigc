import fs from 'node:fs/promises'
import path from 'node:path'

export function createFileStorage({ rootDir }) {
  const referencesDir = path.join(rootDir, 'references')
  const generatedDir = path.join(rootDir, 'generated')

  return {
    async ensureDirs() {
      await fs.mkdir(referencesDir, { recursive: true })
      await fs.mkdir(generatedDir, { recursive: true })
    },

    async writeReferenceFile(file) {
      const fileName = `${Date.now()}-${file.originalname}`
      const absolutePath = path.join(referencesDir, fileName)

      await fs.writeFile(absolutePath, file.buffer)

      return {
        fileName,
        filePath: `/files/references/${fileName}`,
      }
    },

    async writeGeneratedBase64(fileName, base64) {
      const absolutePath = path.join(generatedDir, fileName)
      await fs.writeFile(absolutePath, Buffer.from(base64, 'base64'))
      return `/files/generated/${fileName}`
    },

    async readFileAsDataUrl(filePath, mimeType = 'image/png') {
      const relativePath = filePath.replace(/^\/files\//, '')
      const absolutePath = path.join(rootDir, relativePath)
      const buffer = await fs.readFile(absolutePath)
      return `data:${mimeType};base64,${buffer.toString('base64')}`
    },
  }
}
