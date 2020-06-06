import { CaseCreator, ProgressStat, createStat, createFiber, createFiberGroup } from './utils'
import { BASE_URL } from '../const'
import { Observable } from 'rxjs'

const blob1M = new Blob([new ArrayBuffer(1024 * 1024)])
let blobCache: Blob
let blobCacheCount: number

export const xhrUpload: CaseCreator = function* (count = 64) {
  const xhr = new XMLHttpRequest()
  if (!blobCache || blobCacheCount !== count) {
    blobCacheCount = count
    blobCache = new Blob(new Array(count).fill(blob1M))
  }
  const data = blobCache
  let finished = false
  let processes: Array<ProgressStat> = []
  let loaded = 0
  let time = 0
  let finishedTime = Infinity
  const total = count * 1024 * 1024

  function getRate() {
    let size = 0
    let duration = 0
    for (const pg of processes) {
      size += pg.size
      duration += pg.duration
    }

    processes = []

    return { size, duration, loaded, total }
  }

  xhr.open('POST', `${BASE_URL}/upload`)

  xhr.upload.onloadstart = () => {
    time = performance.now()
  }
  xhr.upload.onprogress = (e) => {
    const size = e.loaded - loaded
    const now = performance.now()
    const duration = now - time
    processes.push({ size, duration })
    loaded = e.loaded
    time = now
  }
  xhr.upload.onloadend = () => {
    finished = true
    finishedTime = performance.now()
  }

  xhr.send(data)

  while (true) {
    if (finished) {
      return getRate()
    }

    const ret = yield getRate()
    if (!ret) {
      break
    }
  }

  return { duration: performance.now() - finishedTime, size: -1, loaded, total }
}

export const upload = createStat(xhrUpload)

const fiberUpload = createFiber(
  (count = 64) =>
    new Observable((sub) => {
      const xhr = new XMLHttpRequest()
      if (!blobCache || blobCacheCount !== count) {
        blobCacheCount = count
        blobCache = new Blob(new Array(count).fill(blob1M))
      }
      const data = blobCache
      let loaded = 0

      xhr.open('POST', `${BASE_URL}/upload`)

      xhr.upload.onloadstart = () => {
        sub.next(-1)
      }

      xhr.upload.onprogress = (e) => {
        const size = e.loaded - loaded
        loaded = e.loaded
        sub.next(size)
      }

      xhr.upload.onloadend = () => {
        sub.complete()
      }

      xhr.upload.onerror = (e) => sub.error(e)
      xhr.onerror = (e) => sub.error(e)

      sub.add({
        unsubscribe() {
          xhr.abort()
        },
      })

      xhr.send(data)
    }),
)

export const uploadFiber = createFiberGroup(fiberUpload)
