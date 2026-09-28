// Canvas aspect ratios, width / height. Both vertical: the height is the
// long edge and stays fixed, only the width changes.
export const FORMATS = {
  "3:4": 3 / 4,
  "9:16": 9 / 16,
};
export const DEFAULT_FORMAT = "3:4";

// Data files made for a format carry a suffix: contours1_916.json,
// image1_916.jpg… (written by notebooks/distance_field.ipynb from
// media/<stem>_916.jpg). The default format uses the plain names.
export const fileSuffix = (format) =>
  format === DEFAULT_FORMAT ? "" : `_${format.replace(":", "")}`;

// fontSize, titlePerp, overlay text etc. are absolute pixel values
// calibrated against the height, so keeping it fixed keeps them in
// proportion with the map when switching format.
export function canvasSize(format, height) {
  const ratio = FORMATS[format] ?? FORMATS[DEFAULT_FORMAT];
  return { W: Math.round(height * ratio), H: height };
}

export function nextFormat(format) {
  const keys = Object.keys(FORMATS);
  return keys[(keys.indexOf(format) + 1) % keys.length];
}
