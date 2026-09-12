/**
 * Blur and brightness, measured directly on a camera frame's Y (luma) plane.
 *
 * In YUV 4:2:0 the Y plane *is* the grayscale image, so the two Stage 1 pixel
 * checks need no colour conversion — and therefore no native code. These run
 * inside the VisionCamera frame worklet.
 *
 * Both formulas are ports of `tools/stage1_quality_gate.py`:
 *   blur       = cv2.Laplacian(gray, CV_64F).var()
 *   brightness = gray.mean()
 *
 * `ImageMath.kt` implements the same two formulas for the captured still. The
 * duplication is deliberate: the still arrives as a JPEG that only native code
 * can cheaply decode, while the preview arrives as a buffer only the worklet
 * can cheaply reach. The *decision* is not duplicated — both feed `gate.ts`.
 *
 * CAVEAT: variance-of-the-Laplacian is resolution dependent, so the preview and
 * the full-resolution still will not report identical blur scores. The live
 * value is guidance; the capture-time check on the still is authoritative.
 */

export type LumaMeasurement = {
  blurScore: number;
  brightness: number;
};

/**
 * @param luma  Y-plane bytes.
 * @param bytesPerRow Row stride — often larger than `width`, so rows must be
 *   indexed by stride, not by width, or the image shears.
 */
export function measureLuma(
  luma: Uint8Array,
  width: number,
  height: number,
  bytesPerRow: number
): LumaMeasurement {
  'worklet';

  if (width < 3 || height < 3) {
    return { blurScore: 0, brightness: 0 };
  }

  let sum = 0;
  for (let y = 0; y < height; y++) {
    const row = y * bytesPerRow;
    for (let x = 0; x < width; x++) {
      sum += luma[row + x];
    }
  }
  const brightness = sum / (width * height);

  // Laplacian, OpenCV's default 3x3 kernel [[0,1,0],[1,-4,1],[0,1,0]] (ksize=1).
  // Interior pixels only: OpenCV reflects at the border, but a one-pixel frame
  // contributes negligibly to the variance at any real camera resolution.
  let lapSum = 0;
  let lapSumSq = 0;
  const lapCount = (width - 2) * (height - 2);

  for (let y = 1; y < height - 1; y++) {
    const row = y * bytesPerRow;
    const rowAbove = row - bytesPerRow;
    const rowBelow = row + bytesPerRow;
    for (let x = 1; x < width - 1; x++) {
      const lap =
        luma[rowAbove + x] +
        luma[rowBelow + x] +
        luma[row + x - 1] +
        luma[row + x + 1] -
        4 * luma[row + x];
      lapSum += lap;
      lapSumSq += lap * lap;
    }
  }

  // Population variance, matching numpy's ndarray.var() default (ddof=0).
  const mean = lapSum / lapCount;
  const blurScore = lapSumSq / lapCount - mean * mean;

  return { blurScore, brightness };
}

export type DownsampledLuma = {
  data: Uint8Array;
  width: number;
  height: number;
};

/**
 * Nearest-neighbour downsample of the Y plane, used to keep the per-frame
 * payload handed to the pose detector small. MediaPipe's Pose Landmarker
 * resizes its input to 256x256 internally, so sampling much above that buys
 * nothing.
 */
export function downsampleLuma(
  luma: Uint8Array,
  width: number,
  height: number,
  bytesPerRow: number,
  targetLongEdge: number
): DownsampledLuma {
  'worklet';

  const longEdge = Math.max(width, height);
  const scale = longEdge > targetLongEdge ? targetLongEdge / longEdge : 1;
  const outWidth = Math.max(1, Math.round(width * scale));
  const outHeight = Math.max(1, Math.round(height * scale));

  const out = new Uint8Array(outWidth * outHeight);
  for (let y = 0; y < outHeight; y++) {
    const srcRow = Math.min(height - 1, Math.floor(y / scale)) * bytesPerRow;
    const dstRow = y * outWidth;
    for (let x = 0; x < outWidth; x++) {
      out[dstRow + x] = luma[srcRow + Math.min(width - 1, Math.floor(x / scale))];
    }
  }

  return { data: out, width: outWidth, height: outHeight };
}
