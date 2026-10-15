// Shrinks images in the browser so they stay small in the database.

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file couldn't be read as an image."));
    };
    img.src = url;
  });
}

// Centred square PNG (keeps transparency) for the browser tab icon.
export async function makeFavicon(file, size = 64) {
  const img = await loadImage(file);
  const side = Math.min(img.width, img.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas
    .getContext("2d")
    .drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
  return canvas.toDataURL("image/png");
}

// Full-page background: longest side capped at 1920px, saved as JPEG.
export async function makeBackground(file, maxSide = 1920) {
  const img = await loadImage(file);
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82);
}

// Screenshots are sent to the server as they are, unless they are too big for
// the host (Vercel accepts requests up to 4.5 MB). Big ones are scaled down and
// saved as JPEG, which keeps the small stat text readable for Gemini.
export async function shrinkForUpload(file, maxBytes = 3.5 * 1024 * 1024) {
  if (file.size <= maxBytes) return file;
  const img = await loadImage(file);
  let scale = Math.min(1, 2400 / Math.max(img.width, img.height));
  for (let attempt = 0; attempt < 6; attempt++) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (blob && blob.size <= maxBytes) {
      const base = (file.name || "screenshot").replace(/\.[^.]+$/, "");
      return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
    }
    scale *= 0.8;
  }
  throw new Error("That screenshot is too large to send, even after shrinking it. Try a smaller one.");
}
