-- Keep the ordered PiXiSYNC log on one enum-backed kind column. PostgreSQL
-- requires a newly added enum value to be committed before constraints and
-- functions can use it, so the implementation follows in the next migration.
alter type collab_v1.operation_kind add value if not exists 'document_patch';
