import Ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import { PassThrough } from 'stream';
import path from 'path';
import fs from 'fs';
// export const FfmpegHandler = async (file: string) => {
//   Ffmpeg.setFfmpegPath(ffmpegPath.path);
//   return new Promise((resolve, reject) => {
//     Ffmpeg(file, { timeout: 432000 })
//       .addOptions([
//         '-profile:v baseline', // for H264 video codec
//         '-level 3.0',
//         '-s 640x360', // 640px width, 360px height
//         '-start_number 0', // start the first .ts segment at index 0
//         '-hls_time 10', // 10 second segment duration
//         '-hls_list_size 0', // Maximum number of playlist entries
//         '-f hls', // HLS format
//       ])
//       .output('./public/source-m3u8/output.m3u8')
//       .on('end', () => {
//         console.log('finish');
//         resolve('success');
//       })
//       .on('error', (err) => {
//         console.error('ffmpeg error:', err);
//         reject(err);
//       })
//       .run();
//   });
// };

Ffmpeg.setFfmpegPath(ffmpegPath.path);
const streamMap = new Map();
function start(uuid: string) {
  const dirPath = path.resolve(process.cwd(), `public/source-m3u8/${uuid}`);
  const outputPath = path.join(dirPath, 'output.m3u8');
  // 如果資料夾不存在，建立它
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  const stream: PassThrough = new PassThrough();
  streamMap.set(uuid, stream);
  stream.on('data', (d) => {
    console.log(d, 'stream data');
  });

  Ffmpeg(stream, { timeout: 432000 })
    .inputFormat('webm')
    .addOptions([
      '-start_number 0',
      '-c:v libx264',
      '-profile:v baseline',
      '-level 3.0',
      '-preset veryfast',
      '-s 640x360',

      // --- HLS low-latency ---
      '-hls_time 1',
      '-hls_list_size 6',
      '-hls_flags delete_segments+append_list+program_date_time+independent_segments',
      // '-hls_start_number_source epoch',
      '-f hls',
    ])
    .output(outputPath)
    .run();
}

export default {
  start,
  write: ({ data, uuid }: { data: Buffer; uuid: string }) => {
    const stream = streamMap.get(uuid);
    if (!stream) {
      throw new Error('no stream data!!');
    }

    const ok = stream.write(data);
    return ok;
  },
  end: ({ uuid }: { uuid: string }) => {
    const stream = streamMap.get(uuid);
    if (!stream) {
      throw new Error('no stream data!!');
    }

    console.log('stream end');
    stream.end();
  },
};
