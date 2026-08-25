# DRAW-130 Timeline Performance Contract

The Timeline is a bounded projection. A reference viewport mounts only the
requested frame/layer window plus bounded overscan. Hidden thumbnails, full
grid cells, polling, and full Timeline rebuilds are prohibited.

The benchmark records total items, visible items, overscan, mounted/rendered
items, structural commit count, Undo depth, and a deterministic structure hash.
It is a synthetic reference measurement and is not browser, device, compositor,
or production performance evidence.

Required later qualification remains explicit: desktop/mobile browser geometry,
real touch/stylus, Safari/Firefox, full compositor, long-task attribution, and
30-minute memory behavior.
