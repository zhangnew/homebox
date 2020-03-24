import { interval, Observable } from 'rxjs'
import { take } from 'rxjs/operators'
import { createStat } from './utils'
import { BASE_URL } from '../const'

export interface DownloadProgressStat {
  // 当前分片下载的大小
  size: number
  // 当前持续的时间
  duration: number
  // 已经下载的数量
  loaded: number
  // 总共的数量，-1 表示长度无法提前得知
  total: number
}

export function *fetchDownload(count = 10): Generator<DownloadProgressStat, DownloadProgressStat, boolean> {
  let time = 0
  let progresses: Array<{
    size: number,
    duration: number
  }> = []
  let loaded = 0
  let total = -1
  let finished = false

  function getRate() {
    let totalTime = 0
    let totalSize = 0
    let i = progresses.length - 1
    for (i = 0; i < progresses.length; i++) {
      totalTime += progresses[i].duration
      totalSize += progresses[i].size
    }
    progresses = []

    return {
      size: totalSize,
      duration: totalTime,
      total,
      loaded,
    }
  }

  fetch(`${BASE_URL}/download?count=${count}`, {
    method: 'get',
  }).then(async resp => {
    // IMPROVE
    total = parseInt(resp.headers.get('content-length')!, 10)
    time = performance.now()
    const reader = resp.body?.getReader()
    for(;;) {
      const data = await reader?.read()
      if (!data) {
        finished = true
        break
      }

      const { value, done } = data

      const size = value?.length ?? 0
      const now = performance.now()
      const duration = now - time

      progresses.push({size, duration})
      total += size
      time = now

      if (done) {
        finished = true
        break;
      }
    }

    if (finished) {
      reader?.cancel()
    }
  })

  let ret = true
  do {
    if (finished) {
      return getRate()
    }
    ret = yield getRate()
  } while(ret)
  finished = true
  // TODO: cancel

  return {} as any
}

export function *xhrDownload(count: number = 10): Generator<DownloadProgressStat, DownloadProgressStat, boolean> {
  const xhr = new XMLHttpRequest()
  let start = 0
  let progressTime = performance.now()
  let progresses: Array<{
    size: number,
    duration: number
  }> = []
  let loaded = 0
  let total = -1
  let finished = false

  const getStat = (): DownloadProgressStat => {
    let totalTime = 0
    let totalSize = 0
    let i = progresses.length - 1
    for (i = 0; i < progresses.length; i++) {
      totalTime += progresses[i].duration
      totalSize += progresses[i].size
    }
    progresses = []

    return {
      size: totalSize,
      duration: totalTime,
      total,
      loaded,
    }
  }

  xhr.responseType = 'arraybuffer'

  xhr.onloadstart = () => {
    start = performance.now()
  }

  xhr.onprogress = (ev) => {
    const current = performance.now()
    progresses.push({
      size: ev.loaded - loaded,
      duration: current - progressTime
    })
    loaded = ev.loaded
    total = ev.lengthComputable ? ev.total : -1
    progressTime = current
  }

  xhr.onload = () => {
    finished = true
    try {xhr.abort()} catch(e) {}
    console.log(performance.now() - start, progressTime - start)
  }

  xhr.onerror = () => {
    try {xhr.abort()} catch(e) {}
    finished = true
  }

  xhr.open('GET', `${BASE_URL}/download?count=${count}`)
  xhr.send()

  let ret = true
  do {
    if (finished) {
      return getStat()
    }
    ret = yield getStat()
  } while(ret)

  // TODO: 要处理强制停止的情况
  try {xhr.abort()} catch(e) {}

  // 这里无关紧要
  return {} as any
}

export const download = createStat(fetchDownload)
