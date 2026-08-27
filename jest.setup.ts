import '@testing-library/jest-dom'
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer'

/**
 * `jest-fixed-jsdom` keeps Node's undici `fetch`/`FormData` so MSW can
 * intercept, but leaves jsdom's `Blob`/`File` in place. The two come from
 * different realms, and undici's `FormData.append` rejects a jsdom `File`
 * outright — which the real Node runtime never does, because there both come
 * from undici. Align the realms so uploads behave in tests the way they behave
 * on the server.
 */
globalThis.Blob = NodeBlob as unknown as typeof Blob
globalThis.File = NodeFile as unknown as typeof File

/**
 * `jest-fixed-jsdom` keeps Node's undici globals (so MSW can intercept), and
 * undici's `FormData` refuses to be constructed from a `<form>` element:
 *
 *     new FormData(form)  ->  TypeError: Argument 1 could not be converted
 *
 * React 19 does exactly that when a form `action` fires, which would make every
 * form test throw. Bridge the gap by reading the form's controls ourselves.
 */
const NativeFormData = globalThis.FormData

class FormAwareFormData extends NativeFormData {
  constructor(form?: HTMLFormElement) {
    super()
    if (!form) return

    for (const element of Array.from(form.elements)) {
      const control = element as HTMLInputElement & {
        selectedOptions?: HTMLCollectionOf<HTMLOptionElement>
      }
      if (!control.name || control.disabled) continue

      switch (control.type) {
        case 'button':
        case 'submit':
        case 'reset':
          break
        case 'checkbox':
        case 'radio':
          if (control.checked) this.append(control.name, control.value || 'on')
          break
        case 'file':
          for (const file of Array.from(control.files ?? [])) {
            this.append(control.name, file)
          }
          break
        case 'select-multiple':
          for (const option of Array.from(control.selectedOptions ?? [])) {
            this.append(control.name, option.value)
          }
          break
        default:
          this.append(control.name, control.value)
      }
    }
  }
}

globalThis.FormData = FormAwareFormData as unknown as typeof FormData

/**
 * jsdom has no `DataTransfer`, which is the only way to put a `File` back into a
 * native file input. The photo field uses it to restore a selection after React
 * resets the form, so tests need a stand-in that behaves the same way: hold
 * files, and expose them as a `FileList`.
 */
if (typeof globalThis.DataTransfer === 'undefined') {
  class FakeDataTransfer {
    #files: File[] = []

    items = {
      add: (file: File) => {
        this.#files.push(file)
      },
    }

    get files(): FileList {
      const files = this.#files
      const list = {
        length: files.length,
        item: (index: number) => files[index] ?? null,
        [Symbol.iterator]: () => files[Symbol.iterator](),
      } as unknown as FileList
      files.forEach((file, index) => {
        ;(list as unknown as Record<number, File>)[index] = file
      })
      return list
    }
  }

  globalThis.DataTransfer = FakeDataTransfer as unknown as typeof DataTransfer
}

// jsdom does not implement object URLs either; the photo preview needs both.
if (typeof URL.createObjectURL !== 'function') {
  let counter = 0
  URL.createObjectURL = () => `blob:jest/${++counter}`
  URL.revokeObjectURL = () => {}
}
