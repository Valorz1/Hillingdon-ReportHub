// Downscale a photo before it goes anywhere. A 12 MP phone shot is ~4 MB as
// a data URL; at 1024px / q0.75 it's ~150 KB, which keeps uploads fast and
// localStorage (mock mode) from filling up.
export function resizeDataUrl(dataUrl, maxPx = 1024, quality = 0.75) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      // Always re-encode, even when small: strips EXIF (incl. GPS) and normalises PNG/HEIC to JPEG
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

export function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
