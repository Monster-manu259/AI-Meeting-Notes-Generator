import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import path from "path";

ffmpeg.setFfmpegPath(ffmpegPath as string);

export function extractAudio(videoPath: string): Promise<string> {
  const audioPath = videoPath.replace(path.extname(videoPath), ".wav");

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec("pcm_s16le")
      .format("wav")
      .save(audioPath)
      .on("end", () => resolve(audioPath))
      .on("error", reject);
  });
}

export function isVideoFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();

  const videoExtensions = [
    ".mp4",
    ".mov",
    ".webm",
    ".mkv",
    ".avi"
  ];

  return videoExtensions.includes(ext);
}
