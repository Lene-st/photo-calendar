const databaseName = 'photo-calendar-db'
const storeName = 'photos'
const databaseVersion = 1

function openPhotoDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion)

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: 'dateKey' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function runPhotoTransaction(mode, action) {
  const database = await openPhotoDatabase()

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode)
    const store = transaction.objectStore(storeName)
    const request = action(store)
    let result

    request.onsuccess = () => {
      result = request.result
    }
    request.onerror = () => reject(request.error)
    transaction.oncomplete = () => {
      database.close()
      resolve(result)
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error)
    }
    transaction.onabort = () => {
      database.close()
      reject(transaction.error)
    }
  })
}

export function getAllPhotos() {
  return runPhotoTransaction('readonly', (store) => store.getAll())
}

export function savePhotoRecord(photoRecord) {
  return runPhotoTransaction('readwrite', (store) => store.put(photoRecord))
}

export function deletePhotoRecord(dateKey) {
  return runPhotoTransaction('readwrite', (store) => store.delete(dateKey))
}
