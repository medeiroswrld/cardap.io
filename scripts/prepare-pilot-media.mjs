import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bundled = path.join(
  root,
  ".tools/ffmpeg/node_modules/ffmpeg-static",
  process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
);
export function ffmpegPath() {
  return process.env.FFMPEG_PATH || (existsSync(bundled) ? bundled : "ffmpeg");
}
export function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpegPath(),
      ["-hide_banner", "-loglevel", "error", "-nostdin", ...args],
      { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] },
    );
    // Decoder output can contain private source paths/metadata. Do not print it.
    child.stderr.resume();
    child.on("error", () =>
      reject(
        new Error("FFmpeg indisponível. Instale-o ou configure FFMPEG_PATH."),
      ),
    );
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              "Não foi possível processar este vídeo. Confira se o arquivo é válido.",
            ),
          ),
    );
  });
}
export async function prepareVideo(source, outputDirectory) {
  const input = path.resolve(source);
  const output = path.resolve(outputDirectory);
  if (!statSync(input).isFile())
    throw new Error("Selecione um arquivo de vídeo local.");
  // A fresh output folder prevents overwriting either originals or previous exports.
  mkdirSync(output, { recursive: false });
  const video = path.join(output, "video.mp4");
  const cover = path.join(output, "capa.jpg");
  await runFfmpeg([
    "-n",
    "-i",
    input,
    "-t",
    "45",
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-vf",
    "scale=720:1280:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
    "-r",
    "30",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "26",
    "-maxrate",
    "1200k",
    "-bufsize",
    "2400k",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "64k",
    "-movflags",
    "+faststart",
    "-map_metadata",
    "-1",
    video,
  ]);
  await runFfmpeg([
    "-n",
    "-i",
    video,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    "-map_metadata",
    "-1",
    cover,
  ]);
  if (statSync(video).size > 20 * 1024 * 1024)
    throw new Error(
      "O arquivo preparado ainda excede 20 MB. Revise a exportação antes de enviar.",
    );
  return {
    video,
    cover,
    originalBytes: statSync(input).size,
    preparedBytes: statSync(video).size,
  };
}
async function main() {
  const [input, destination] = process.argv.slice(2);
  if (!input || !destination) {
    process.stdout.write(
      'Uso: npm run prepare:media -- "pasta-dos-originais" "pasta-de-saida-nova"\nCria MP4/H.264 + capa JPG; usa os primeiros 45 segundos e preserva os originais.\n',
    );
    return;
  }
  const sources = readdirSync(input, { withFileTypes: true }).filter(
    (entry) => entry.isFile() && /\.(mp4|mov|webm|mkv|m4v)$/i.test(entry.name),
  );
  if (!sources.length)
    throw new Error("Nenhum vídeo encontrado na pasta indicada.");
  mkdirSync(destination, { recursive: false });
  for (const [index, source] of sources.entries()) {
    const result = await prepareVideo(
      path.join(input, source.name),
      path.join(destination, `produto-${String(index + 1).padStart(2, "0")}`),
    );
    process.stdout.write(
      JSON.stringify({
        product: index + 1,
        originalBytes: result.originalBytes,
        preparedBytes: result.preparedBytes,
        durationLimitSeconds: 45,
      }) + "\n",
    );
  }
  process.stdout.write(
    "Arquivos preparados. Revise cada vídeo/capa antes de cadastrar no restaurante.\n",
  );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(
      error.code === "EEXIST"
        ? "A pasta de saída já existe. Escolha outra para preservar seus arquivos.\n"
        : "Não foi possível concluir. Confira os caminhos, o FFmpeg e os arquivos; os originais foram preservados.\n",
    );
    process.exitCode = 1;
  });
}
