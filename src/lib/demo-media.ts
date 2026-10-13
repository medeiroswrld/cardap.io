const PREFIX = "demo-media:";

async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("brasa-demo-media", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("videos");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Não foi possível acessar os vídeos locais."));
  });
}

export async function saveDemoVideo(file: File) {
  const db = await database();
  const id = crypto.randomUUID();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("videos", "readwrite");
      tx.objectStore("videos").put(file, id);
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () =>
        reject(
          new Error(
            "Não foi possível guardar o vídeo. Confira o espaço disponível neste navegador.",
          ),
        );
    });
    return PREFIX + id;
  } finally {
    db.close();
  }
}

export async function resolveDemoVideo(source: string) {
  if (!source.startsWith(PREFIX)) return source;
  const db = await database();
  try {
    const file = await new Promise<Blob>((resolve, reject) => {
      const request = db
        .transaction("videos")
        .objectStore("videos")
        .get(source.slice(PREFIX.length));
      request.onsuccess = () =>
        request.result
          ? resolve(request.result)
          : reject(new Error("Vídeo local não encontrado."));
      request.onerror = () => reject(request.error);
    });
    return URL.createObjectURL(file);
  } finally {
    db.close();
  }
}

export async function removeDemoVideo(source: string) {
  if (!source.startsWith(PREFIX)) return;
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("videos", "readwrite");
      tx.objectStore("videos").delete(source.slice(PREFIX.length));
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
