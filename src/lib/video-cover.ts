// Runs only for a locally selected file. The original never leaves the browser here.
export async function createVideoCover(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    await new Promise<void>((resolve, reject) => {
      const finish = (ok: boolean) => {
        clearTimeout(timer);
        video.onloadeddata = null;
        video.onerror = null;
        if (ok) resolve();
        else
          reject(
            new Error(
              "Não foi possível gerar a capa. Escolha outro vídeo MP4 ou WebM.",
            ),
          );
      };
      const timer = setTimeout(() => finish(false), 15000);
      video.onloadeddata = () => finish(true);
      video.onerror = () => finish(false);
      video.src = url;
    });
    if (!video.videoWidth || !video.videoHeight)
      throw new Error("O vídeo não contém uma imagem válida.");
    const scale = Math.min(1, 720 / video.videoWidth, 1280 / video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Não foi possível preparar a capa neste navegador.");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(new Error("Não foi possível preparar a capa.")),
        "image/jpeg",
        0.82,
      ),
    );
    return new File([blob], "capa.jpg", { type: "image/jpeg" });
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
