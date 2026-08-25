-- Expand Market delivery to the audio formats already understood by the
-- seller package detector. Product composition remains provenance metadata;
-- every selected file is still delivered through the purchased package.

alter table public.market_asset_formats
  drop constraint if exists market_asset_formats_media_kind_check;

alter table public.market_asset_formats
  add constraint market_asset_formats_media_kind_check
  check (media_kind in ('project', 'image', 'animation', 'audio'));

insert into public.market_asset_formats (
  id, label, media_kind, allows_pixieed_native, allows_external_upload, active
) values
  ('aac', 'AAC音声', 'audio', true, true, true),
  ('aiff', 'AIFF音声', 'audio', true, true, true),
  ('flac', 'FLAC音声', 'audio', true, true, true),
  ('m4a', 'M4A音声', 'audio', true, true, true),
  ('mid', 'MIDI', 'audio', true, true, true),
  ('midi', 'MIDI', 'audio', true, true, true),
  ('mp3', 'MP3音声', 'audio', true, true, true),
  ('oga', 'OGA音声', 'audio', true, true, true),
  ('ogg', 'OGG音声', 'audio', true, true, true),
  ('opus', 'Opus音声', 'audio', true, true, true),
  ('wav', 'WAV音声', 'audio', true, true, true),
  ('weba', 'WebM音声', 'audio', true, true, true)
on conflict (id) do update set
  label = excluded.label,
  media_kind = excluded.media_kind,
  allows_pixieed_native = excluded.allows_pixieed_native,
  allows_external_upload = excluded.allows_external_upload,
  active = excluded.active;
